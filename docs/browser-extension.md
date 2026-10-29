# Browser Extension

> **Status:** implemented in Phase 3: authorization (connect page, tokens, `/api/extension/me`, Integrations), submission ingestion (`POST /api/extension/applications`, matching, duplicate review) and the extension in `apps/extension`. Detectors were checked against live Greenhouse, Lever and Ashby postings in October 2026. Platform-specific selectors and URL patterns below are starting points that will be validated against saved page fixtures during implementation.

The Trackr extension detects when the user submits a job application and reports it to their account, so the application appears in the dashboard without manual entry. When detection is uncertain, the popup lets the user track the current job in one click.

Initial platforms: **Greenhouse, Lever and Ashby.** Workday follows later.

## Architecture

```
┌───────────────────────────── Chrome (Manifest V3) ─────────────────────────────┐
│                                                                                │
│  Content script (job boards)         Service worker               Popup        │
│  ┌──────────────────────────┐  msg  ┌───────────────────────┐ msg ┌──────────┐ │
│  │ detector.extractJob()    │ ────► │ job context store     │ ◄──►│ plain TS │ │
│  │ detector.confirmation()  │       │ (storage.session)     │     │ and CSS  │ │
│  └──────────────────────────┘       │ API client + tokens   │     └──────────┘ │
│                                     │ (storage.local)       │                  │
│  Reader (injected on triage)        │ outbox + retry        │                  │
│  ┌──────────────────────────┐ ◄──── │ (alarms)              │                  │
│  │ readJob(): open tabs     │       │ triage runner         │                  │
│  └──────────────────────────┘       └───────────┬───────────┘                  │
└─────────────────────────────────────────────────┼──────────────────────────────┘
                                                  │ HTTPS, bearer token
                                                  ▼
                                    Trackr API  /api/extension/*
```

- **Content scripts** run only on supported job-board domains. They read the page and send messages to the service worker. They never call the Trackr API directly, because content scripts operate under the page's origin.
- **The service worker** owns the job context store, the API client, token storage, and an outbox that retries failed submissions with `chrome.alarms`.
- **The popup** shows connection status and the detected job, provides the manual tracking fallback, and runs tab triage.
- **The reader** is a small script injected into open tabs only when the person triages them. It reads the posting a tab shows and returns it; it sends nothing itself.
- **Shared contracts:** the submission payload schema and enums come from `packages/domain`, so the extension and the API validate against the same definitions.

Built with TypeScript and esbuild (`apps/extension/build.mjs`, one bundle per context: an ES module service worker, and classic scripts for the content script, the reader and the popup). The popup is plain TypeScript and CSS, a few kilobytes, rather than React. Shared types and schemas come from `packages/domain`, which is marked side-effect free so bundles include only what they use.

## Permissions

| Permission                                     | Why                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `storage`                                      | Job context (session storage), tokens and the outbox (local storage)                                            |
| `alarms`                                       | Retry queued submissions after failures                                                                         |
| `activeTab`, `scripting`                       | Let the popup read the title and metadata of the page it was opened on, to pre-fill                             |
| Content scripts on the supported job boards    | Read job pages and recognize submitted applications                                                             |
| Host access for the Trackr origin              | Call the API from the service worker                                                                            |
| Optional host access to all http(s) sites      | Read the postings open in a window when the person triages it; asked for on first use, removable from the popup |
| `externally_connectable` for the Trackr origin | Receive the one-time connect code from the authorization page                                                   |

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

Automatic tracking respects the **Track applications automatically** setting (Settings → Browser extension), which the extension reads from `/api/extension/me`. It re-reads it before each automatic submission, so a change applies at once; offline, it uses the last value it saw. When it is off, only the popup flow is active.

## Demo

The extension isn't in the Chrome Web Store, so demo workspaces can simulate it instead. Integrations offers three sample submissions that go through the same ingestion pipeline: a new company (created), the demo's saved Snowflake internship (matched and marked Applied) and a Stripe role close to an existing one (flagged as a possible duplicate). The server action refuses to run outside a demo workspace.

Demo workspaces can also try tab triage on a pretend window of seven tabs: five sample postings at fictional companies, the demo's saved Supabase job (marked "In Trackr") and an article (not a posting). Their scores come from ratings stored with the samples, worked out by the same `computeFit` as real scores, so the demo never calls the model. **Save** runs the same ingestion as the extension; **Close** only closes tabs in the pretend window. The rules for what to keep, save and close live in `packages/domain` and are shared by the extension and this demo.

## Popup

```
┌──────────────────────────────────────────┐
│ Trackr                       ● Connected │
├──────────────────────────────────────────┤
│ Company   [ Example Corp               ] │
│ Role      [ Software Engineer          ] │
│ URL       [ boards.greenhouse…         ] │
│                                          │
│ [ Track application ] [ Save for later ] │
│                                          │
│ Too many job tabs open?                  │
│ [ Triage open tabs ]                     │
│                                          │
│ Open Trackr ↗               Disconnect   │
└──────────────────────────────────────────┘
```

- Fields are pre-filled from the current tab's job context, or from page metadata when no detector matches, and remain editable.
- **Track application** sends the same submission as automatic detection, marked as a popup capture.
- **Save for later** sends it with `intent: "SAVED"`: the job lands in Saved, ready for when the user applies. Applying later, from the popup or automatically, moves the same application forward.
- If the server matches an existing application, the popup says "Already tracked" and links to it.
- When disconnected, the popup shows **Connect account**.

## Tab triage

**Triage open tabs** in the popup scores every job posting open in the current window against the person's resume, so they can keep the best and close the rest.

1. The first time, Chrome asks for permission to read sites. Nothing is read without it, and **Stop reading tabs** gives it back.
2. The service worker injects the reader into each http(s) tab of that window, once. The reader tries the job-board detectors, then the posting a page describes in schema.org `JobPosting` data (Indeed, LinkedIn's public pages, Glassdoor and most career sites), then LinkedIn's signed-in job panel. Tabs it can't read are counted, never guessed at.
3. The postings, up to 30, go to `POST /api/extension/triage`, which scores them through the same cache as everything else.
4. The popup lists them best first. Strong fits (75 and up) are ticked; postings already in Trackr are marked and left alone. **Save** adds the ticked ones to Saved with their descriptions, reusing their scores. **Close** closes the unticked scored postings after a second click; tabs Trackr couldn't read or score are never closed.

The last triage is kept in session storage for an hour, so reopening the popup brings it back. The logic that picks what to keep, save and close is pure and tested (`src/shared/triage.ts`).

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
| `POST /api/extension/triage`       | Score open job postings against the resume profile              |

Token requests send `{ "grantType": "code", "code": "trk_code_…" }` or `{ "grantType": "refresh", "refreshToken": "trk_rt_…" }` and receive `{ accessToken, accessExpiresAt, refreshToken, refreshExpiresAt }`. Failures use OAuth-style errors: `400 invalid_grant` for a used, expired or revoked code or token, `401 invalid_token` with a `WWW-Authenticate` header on the other endpoints, and `429 rate_limited` with `Retry-After`. The token endpoint is limited to 30 requests a minute per address; authenticated endpoints to 60 a minute per browser.

The connect page hands the code over with `chrome.runtime.sendMessage(extensionId, { type: "TRACKR_CONNECT", code })` and expects `{ ok: true }` back.

Submission payload (`ExtensionSubmissionPayload`):

```json
{
  "clientSubmissionId": "2c6c3f1e-…",
  "captureMode": "AUTO",
  "intent": "APPLIED",
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

`intent` is `APPLIED` or `SAVED`; extensions older than saving leave it out, which means `APPLIED`.

Response: `{ applicationId, outcome: "CREATED" | "MATCHED_EXISTING" | "POSSIBLE_DUPLICATE" }`, with status 201 when an application was created and 200 when it matched an existing one. Repeating a submission returns the first response and changes nothing. Invalid payloads get `400 invalid_request`; the endpoint allows 30 submissions a minute per browser.

Triage requests send `{ "postings": [{ url, companyName, jobTitle, location, platform, atsJobId, description }] }`, at most 30, and receive `{ hasProfile, results: [{ url, status, fit, trackedApplicationId }] }` in the same order. `status` is `SCORED`, `NO_DESCRIPTION` (under 200 characters of posting text), `LIMIT` (the day's 100 scores are used up) or `UNAVAILABLE` (the model didn't answer); `fit` is the score with its breakdown, and `trackedApplicationId` names the application a posting already is. A posting scored since the resume profile last changed comes from the cache without asking the model. Without a profile the response is `{ hasProfile: false, results: [] }`; demo accounts get `403 demo_account`. The endpoint allows 10 requests a minute per browser.

## Server-side handling

1. Authenticate the extension session and apply the rate limit.
2. Validate the payload, normalize the company and title, and sanitize the description to plain text.
3. Match against existing applications using the shared scorer. A matching ATS job ID on the same platform is decisive.
4. Apply the match result:

   | Match           | Result                                                                                                                      |
   | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
   | Automatic match | Add an `APPLICATION_SUBMITTED` event to the existing application; a save only fills in what it was missing                  |
   | Possible match  | Create the application and open a `POSSIBLE_DUPLICATE` review item offering **Merge** or **Keep both**, with a notification |
   | No match        | Create the application with an `APPLICATION_SUBMITTED` event, or `JOB_SAVED` for a save                                     |

5. All writes go through the event processor, with dedupe key `ext:<clientSubmissionId>`.

## Privacy

- Content scripts run only on supported job-board pages, or on sites the user explicitly enables.
- Nothing is sent to Trackr until an application is submitted or the user clicks **Track application** or **Save for later**.
- Browsing history is not collected. Triage reads the open tabs of one window, only when asked, and sends only the postings it found.
- The posting's description is sent with the job, as the page shows it, and stored as plain text for fit scoring.

## Testing

- **Detector unit tests** against saved HTML fixtures for job pages, application forms and confirmation states on each platform, using a DOM environment in Vitest.
- **Contract tests:** extension payloads validated against the shared domain schema.
- **Triage tests:** the reader against saved job-board pages (structured data, LinkedIn's signed-in panel), and the choice of what to keep, save and close.
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
7. Open a few postings (a supported board, LinkedIn, Indeed, a career site) and a non-job tab, then **Triage open tabs**: the postings are scored best first, the non-job tab is counted as unreadable, **Save** adds the ticked ones to Saved, and **Close** closes only the unticked postings.
