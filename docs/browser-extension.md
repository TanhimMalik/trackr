# Browser Extension

> **Status:** Phase 3, in progress. Implemented: authorization (connect page, tokens, `/api/extension/me`, Integrations), submission ingestion (`POST /api/extension/applications`, matching, duplicate review) and the extension in `apps/extension`. Detectors were checked against live Greenhouse, Lever and Ashby postings in October 2026. Platform-specific selectors and URL patterns below are starting points that will be validated against saved page fixtures during implementation.

The Trackr extension detects when the user submits a job application and reports it to their account, so the application appears in the dashboard without manual entry. When detection is uncertain, the popup lets the user track the current job in one click.

Initial platforms: **Greenhouse, Lever and Ashby.** Workday follows later.

## Architecture

```
┌──────────────────────────── Chrome (Manifest V3) ─────────────────────────────┐
│                                                                                │
│  Content scripts (per platform)        Service worker               Popup     │
│  ┌──────────────────────────┐   msg   ┌──────────────────────┐  msg ┌───────┐ │
│  │ detector.extractJob()    │ ──────► │ job context store     │ ◄──► │ React │ │
│  │ detector.isConfirmation()│         │ (storage.session)     │      │  UI   │ │
│  └──────────────────────────┘         │ API client + tokens   │      └───────┘ │
│                                       │ (storage.local)       │                │
│                                       │ outbox + retry        │                │
│                                       │ (alarms)              │                │
│                                       └──────────┬────────────┘                │
└──────────────────────────────────────────────────┼─────────────────────────────┘
                                                   │ HTTPS, bearer token
                                                   ▼
                                     Trackr API  /api/extension/*
```

- **Content scripts** run only on supported job-board domains. They read the page and send messages to the service worker. They never call the Trackr API directly, because content scripts operate under the page's origin.
- **The service worker** owns the job context store, the API client, token storage, and an outbox that retries failed submissions with `chrome.alarms`.
- **The popup** shows connection status and the detected job, and provides the manual tracking fallback.
- **Shared contracts:** the submission payload schema and enums come from `packages/domain`, so the extension and the API validate against the same definitions.

Built with TypeScript and esbuild (`apps/extension/build.mjs`, one bundle per context: an ES module service worker, and classic scripts for the content script and popup). The popup is plain TypeScript and CSS, a few kilobytes, rather than React. Shared types and schemas come from `packages/domain`, which is marked side-effect free so bundles include only what they use.

## Permissions

| Permission                                     | Why                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `storage`                                      | Job context (session storage), tokens and the outbox (local storage)                |
| `alarms`                                       | Retry queued submissions after failures                                             |
| `activeTab`, `scripting`                       | Let the popup read the title and metadata of the page it was opened on, to pre-fill |
| Content scripts on the supported job boards    | Read job pages and recognize submitted applications                                 |
| Host access for the Trackr origin              | Call the API from the service worker                                                |
| `externally_connectable` for the Trackr origin | Receive the one-time connect code from the authorization page                       |

Single-page navigation is handled inside the content script with a `MutationObserver`, so `webNavigation` isn't needed. `activeTab` grants access only to the tab the person opened the popup on, only at that moment.

Content scripts are not injected on arbitrary sites. Company career pages that embed a supported job board can be enabled per site through an optional host permission requested from the popup.

## Platform detectors

Each platform implements one interface:

```ts
interface PlatformDetector {
  platform: SourcePlatform;
  matches(url: URL): boolean;
  extractJob(document: Document, url: URL): JobContext | null;
  isConfirmation(document: Document, url: URL): boolean;
}

interface JobContext {
  platform: SourcePlatform;
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  atsJobId?: string;
  location?: string;
  description?: string; // plain text, only when the user allows storing descriptions
  capturedAt: string;
}
```

Extraction prefers structured data, such as schema.org `JobPosting` JSON-LD and Open Graph metadata, over DOM selectors. Selectors are a fallback and are covered by fixture tests.

| Platform   | Job pages (expected)                                                                                                         | Confirmation signals (expected)                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse | `boards.greenhouse.io/{board}/jobs/{id}`, `job-boards.greenhouse.io/{board}/jobs/{id}`, and embedded boards on company sites | Confirmation URL or a page state containing "Thank you for applying" or "Application submitted"                                                                                        |
| Lever      | `jobs.lever.co/{company}/{postingId}` and `/apply`                                                                           | Navigation to the `/thanks` page, or "Application submitted"                                                                                                                           |
| Ashby      | `jobs.ashbyhq.com/{company}/{postingId}` and `/application`                                                                  | In-page state change to a success message, detected with a `MutationObserver`. The form has no `<form>` element; `.ashby-application-form-container` and `#_systemfield_email` mark it |

Confirmation detection requires both a platform-specific signal and a job context captured earlier in the same tab. Detectors report the signal as `url` (a dedicated confirmation page, such as Greenhouse's `/confirmation` or Lever's `/thanks`) or `state` (a success message that replaced the form). A `state` signal only counts after the content script has seen the application form on the same page, so a job description that happens to say "thank you for applying" never triggers it. Text alone is never sufficient.

## Job context lifecycle

1. **Capture.** On a job or application page, the content script calls `extractJob` and sends the context to the service worker, which stores it in `chrome.storage.session` keyed by tab, with a time-to-live of about two hours. Single-page navigation re-runs extraction.
2. **Confirm.** When `isConfirmation` becomes true, the content script notifies the service worker, which builds the submission from the stored context.
3. **Submit.** The service worker sends the submission with a client-generated `clientSubmissionId`. On success the toolbar badge briefly shows a check mark and the context is cleared.
4. **Retry.** If the request fails because of the network, server errors or rate limits, the submission goes into an outbox in `chrome.storage.local` and is retried with backoff. The client-generated ID makes retries idempotent.

Automatic tracking respects the user's **Automatically track supported job sites** setting, which the extension reads from `/api/extension/me`. When it is disabled, only the popup flow is active.

## Popup

```
┌──────────────────────────────────┐
│ Trackr                 ● Connected │
├──────────────────────────────────┤
│ Company   [ Example Corp        ] │
│ Role      [ Software Engineer   ] │
│ URL       [ boards.greenhouse…  ] │
│                                  │
│ [ Track application ]            │
│                                  │
│ Open dashboard ↗                 │
└──────────────────────────────────┘
```

- Fields are pre-filled from the current tab's job context, or from page metadata when no detector matches, and remain editable.
- **Track application** sends the same submission as automatic detection, marked as a popup capture.
- If the server matches an existing application, the popup says "Already tracked" and links to it.
- When disconnected, the popup shows **Connect account**.

## Authentication

The extension never stores a password or a long-lived credential.

```
Popup: "Connect account"
   │ opens a tab
   ▼
Trackr /extension/connect?ext=<extensionId>
   │ user signs in (if needed) and clicks "Authorize"
   ▼
Server creates an extension session with a one-time code (hashed, valid for 60 s)
   │ page sends the code to the extension through
   │ chrome.runtime.sendMessage(extensionId, …)   (allowed by externally_connectable)
   ▼
Service worker: POST /api/extension/token { code }
   │
   ▼
Short-lived access token (~1 h) + rotating refresh token (~30 days)
stored in chrome.storage.local
```

- **Refresh.** On a 401, the service worker refreshes once. Each refresh issues a new refresh token and invalidates the old one. A failed refresh returns the extension to the disconnected state.
- **Revocation.** Each connected browser appears in Integrations and can be revoked individually.
- **Storage.** The server stores only hashes of codes and tokens. Tokens never appear in URLs.
- **Development.** A fixed `key` in the development manifest keeps the extension ID stable.

## API contract

All endpoints require `Authorization: Bearer <access token>`, validate input against the shared domain schemas, and are rate limited per extension session.

| Endpoint                           | Purpose                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `POST /api/extension/token`        | Exchange a connect code, or rotate a refresh token (no bearer)  |
| `GET /api/extension/me`            | Connection check, account email and extension-relevant settings |
| `POST /api/extension/applications` | Report a submitted application                                  |

Token requests send `{ "grantType": "code", "code": "trk_code_…" }` or `{ "grantType": "refresh", "refreshToken": "trk_rt_…" }` and receive `{ accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }`. Failures use OAuth-style errors: `400 invalid_grant` for a used, expired or revoked code or token, `401 invalid_token` with a `WWW-Authenticate` header on the other endpoints, and `429 rate_limited` with `Retry-After`. The token endpoint is limited to 30 requests a minute per address; authenticated endpoints to 60 a minute per browser.

The connect page hands the code over with `chrome.runtime.sendMessage(extensionId, { type: "TRACKR_CONNECT", code })` and expects `{ ok: true }` back.

Submission payload (`ExtensionSubmissionPayload`):

```json
{
  "clientSubmissionId": "2c6c3f1e-…",
  "captureMode": "AUTO",
  "platform": "GREENHOUSE",
  "companyName": "Example Corp",
  "jobTitle": "Software Engineer",
  "jobUrl": "https://boards.greenhouse.io/example/jobs/123456",
  "atsJobId": "123456",
  "location": "New York, NY",
  "description": "…",
  "submittedAt": "2026-10-10T15:04:05.000Z"
}
```

Response: `{ applicationId, outcome: "CREATED" | "MATCHED_EXISTING" | "POSSIBLE_DUPLICATE" }`, with status 201 when an application was created and 200 when it matched an existing one. Repeating a submission returns the first response and changes nothing. Invalid payloads get `400 invalid_request`; the endpoint allows 30 submissions a minute per browser.

## Server-side handling

1. Authenticate the extension session and apply the rate limit.
2. Validate the payload, normalize the company and title, and sanitize the description to plain text.
3. Match against existing applications using the shared scorer. A matching ATS job ID on the same platform is decisive.
4. Apply the match result:

   | Match           | Result                                                                                                                      |
   | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
   | Automatic match | Add an `APPLICATION_SUBMITTED` event to the existing application                                                            |
   | Possible match  | Create the application and open a `POSSIBLE_DUPLICATE` review item offering **Merge** or **Keep both**, with a notification |
   | No match        | Create the application with an `APPLICATION_SUBMITTED` event                                                                |

5. All writes go through the event processor, with dedupe key `ext:<clientSubmissionId>`.

## Privacy

- Content scripts run only on supported job-board pages, or on sites the user explicitly enables.
- Nothing is sent to Trackr until an application is submitted or the user clicks **Track application**.
- Browsing history is not collected.
- Job descriptions are included only when the user allows storing them.

## Testing

- **Detector unit tests** against saved HTML fixtures for job pages, application forms and confirmation states on each platform, using a DOM environment in Vitest.
- **Contract tests:** extension payloads validated against the shared domain schema.
- **API integration tests (PGlite):** a submission creates an application, a repeated submission is idempotent, an ATS job ID match adds an event instead of a new application, and a possible duplicate creates a review item.
- **Manual QA checklist:** run per platform before each release, because job-board markup changes over time.

## Local development

1. `pnpm --filter @trackr/extension dev` builds into `apps/extension/dist` in watch mode, pointed at `http://localhost:3000`. `pnpm --filter @trackr/extension build` makes a production build pointed at the live site; `TRACKR_URL=https://… node build.mjs` targets another deployment.
2. Load `apps/extension/dist` as an unpacked extension from `chrome://extensions`, with Developer mode on. Reload it there after a rebuild.
3. Open the popup and choose **Connect account**. The extension ID isn't fixed during development; the connect page reads it from the link the popup opens.

## Manual QA checklist

Run per platform before a release, since job-board markup changes:

1. Connect from the popup; Integrations lists the browser and the popup shows "Connected".
2. Open a posting: the popup pre-fills company, role and link.
3. Submit an application (a test posting, or one you mean to apply to): the toolbar shows ✓ and the application appears as Applied, from the Extension.
4. Track a job from the popup on an unsupported site: it is added, and tracking it again says "Already tracked".
5. Go offline, submit or track: the popup says it will be sent later; back online, it arrives within a few minutes.
6. Disconnect in Integrations: the extension returns to "Not connected" on its next request.
