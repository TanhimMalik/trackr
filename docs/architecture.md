# Architecture

Trackr is a modular monolith: one Next.js application that holds the UI, the API and the business logic, plus a Chrome extension and a shared, framework-free domain package, all backed by PostgreSQL. There are no microservices, queues or background workers. Each of those can be added when a measured need appears, without restructuring.

Related documents: [product-spec.md](product-spec.md), [database.md](database.md), [email-pipeline.md](email-pipeline.md), [browser-extension.md](browser-extension.md), [design-system.md](design-system.md).

## System overview

```
  ┌─────────────────────┐                 ┌──────────────┐
  │ Chrome extension    │                 │  Gmail API   │
  │ (Manifest V3)       │                 └──────┬───────┘
  └─────────┬───────────┘                        │ OAuth, incremental sync (pull)
            │ HTTPS + bearer token               │
            ▼                                    ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ apps/web (Next.js)                                           │
  │                                                              │
  │   React Server Components and client components              │
  │          │ server actions               │ route handlers     │
  │          ▼                              ▼                    │
  │   ┌─────────────────────── services ──────────────────────┐  │
  │   │ applications · events · matching · email-classification │ │
  │   │ gmail · extension · review · notifications · analytics │  │
  │   └──────┬─────────────────────┬──────────────────┬───────┘  │
  │          │                     │                  │          │
  │   packages/domain        server/integrations   server/db     │
  │   (pure rules)           (Gmail, LLM, crypto)  (Drizzle)     │
  └──────────────────────────────────────────────────┬───────────┘
                                                     ▼
                              PostgreSQL (Supabase) · Supabase Auth
```

## Principles

- **Events are the source of truth.** Everything that happens to an application is an append-only event. The current status is derived from those events.
- **Deterministic first.** Normalization, status transitions, match scoring, rule classification and confidence decisions are pure functions. The LLM is a fallback for ambiguous email only.
- **Explainable and reversible.** Every automatic change records its source, method and confidence, and can be undone.
- **Minimum data.** Store parsed metadata and references, not inboxes.
- **Explicit boundaries.** UI, request handling, business logic, integrations and data access live in separate layers with enforced import rules.

## Repository layout

```
trackr/
├── apps/
│   ├── web/                               Next.js application
│   │   ├── src/
│   │   │   ├── app/                       routes (see "UI architecture")
│   │   │   ├── components/ui/             design-system primitives
│   │   │   ├── components/<feature>/      applications, board, timeline, overview…
│   │   │   ├── server/                    server-only code
│   │   │   │   ├── db/                    Drizzle client, schema, migrations
│   │   │   │   ├── auth/                  session and extension-token authentication
│   │   │   │   ├── services/              business logic; the only layer that touches db
│   │   │   │   ├── integrations/          gmail/, llm/, crypto
│   │   │   │   └── logger.ts
│   │   │   ├── lib/                       client-safe utilities
│   │   │   └── env.ts                     validated environment
│   │   ├── scripts/                       seed and maintenance scripts
│   │   └── tests/integration/             service tests against PGlite
│   └── extension/                         Manifest V3 extension (Phase 3)
├── packages/
│   └── domain/                            pure TypeScript: types, schemas, rules
└── docs/
```

Internal packages are consumed as TypeScript source, so there is no build step between them. Next.js transpiles the domain package, and Vite and Vitest read it directly.

## Layering and dependency rules

```
components ─► server actions / route handlers ─► services ─► db, integrations
                                                    │
                                    packages/domain ◄┘   (imported by every layer)
```

| Layer                             | May import                   | Must not import                                    |
| --------------------------------- | ---------------------------- | -------------------------------------------------- |
| `packages/domain`                 | zod                          | React, Next.js, database, network code             |
| `server/db`                       | Drizzle, domain enums        | services, UI                                       |
| `server/integrations`             | provider SDKs, domain        | database, UI                                       |
| `server/services`                 | db, integrations, domain     | request APIs (`cookies`, `headers`), UI            |
| Route handlers and server actions | services, auth, domain       | `server/db` directly                               |
| Components                        | domain types, server actions | anything under `server/` other than server actions |

Server modules import `server-only`, and ESLint `no-restricted-imports` rules enforce the table. Route handlers and server actions are thin: authenticate, validate input with zod, call one service, and translate the result into a response.

Services receive the acting `userId` explicitly and scope every query by it. Authentication happens once at the boundary, through `requireUser()` for browser sessions and `requireExtensionSession()` for the extension.

## Services

Services are functional modules, not classes. Each owns one responsibility.

| Service                | Responsibility                                                                                                                          | Phase |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `applications`         | Create, edit, delete, list with filters, detail and board read models. Edits fields, never status.                                      | 1     |
| `events`               | `processApplicationEvent`, `revertEvent`. The only writer of `current_status` and `last_activity_at`.                                   | 1–2   |
| `demo-workspace`       | Seeds a realistic, current-dated workspace for demo sessions and development (two bulk inserts, same derivation rules as the processor) | 1     |
| `analytics`            | Overview metrics, funnel, source and resume analytics. SQL aggregates plus pure domain math.                                            | 1, 8  |
| `notifications`        | Create, list, mark read, and generate follow-up reminders idempotently.                                                                 | 2     |
| `activity`             | Cross-application activity feed and review-item listing.                                                                                | 2, 5  |
| `extension-auth`       | One-time connect codes, token issue, rotation and revocation.                                                                           | 3     |
| `extension-ingestion`  | Validate submissions, normalize, deduplicate, hand off to the event processor.                                                          | 3     |
| `matching`             | Load candidate applications, score them with the domain scorer, resolve ambiguity.                                                      | 3, 5  |
| `review`               | Confirm, link, create, merge or dismiss review items.                                                                                   | 3, 5  |
| `gmail`                | OAuth, token refresh, batched incremental sync.                                                                                         | 4     |
| `email-classification` | Relevance filter, rule classifier, LLM fallback, validated results.                                                                     | 4, 6  |
| `settings`, `privacy`  | User preferences, data export, deletion.                                                                                                | 2, 7  |

## Event-based tracking

### Why events

- **History is the product.** The timeline, time-to-response and "reached an interview" metrics all need to know what happened and when. A single status column loses that.
- **Several sources report asynchronously.** The extension, Gmail and the user each report facts, often out of order. An append-only log with a derived status reconciles them deterministically.
- **Corrections become data operations.** Undo marks an event as reverted and re-derives the status. No hand-written inverse transitions are needed.
- **Automation is auditable.** Every change is attributable to a source, a detection method and a confidence score.

### The event processor

`processApplicationEvent(input)` is the single entry point for anything that can change an application's status. It runs in one transaction:

1. Validate the input, including event metadata, against the domain schema for its event type.
2. Lock the application row (`SELECT … FOR UPDATE`) so concurrent events for the same application are serialized.
3. Insert the event with `ON CONFLICT (user_id, dedupe_key) DO NOTHING`. If it already existed, return it marked as deduplicated.
4. Load the application's active events and run status derivation.
5. Persist `current_status`, `applied_at`, `last_activity_at`, and each event's `status_before` and `status_after`.
6. Create associated interview and contact records from event metadata.
7. If the status changed, create a notification.

It returns the stored event, the previous status, the new status and whether the event was deduplicated.

### Status derivation

Status is a pure fold over the application's active (non-reverted) events, ordered by `(event_timestamp, created_at, id)`. It lives in `packages/domain/src/status.ts`:

```ts
function deriveApplicationState(events: readonly StatusEvent[]) {
  const active = events.filter((e) => !e.revertedAt).sort(compareStatusEvents);
  let status: ApplicationStatus = "UNKNOWN";
  const transitions: StatusTransition[] = [];
  for (const event of active) {
    const before = status;
    status = transition(status, event);
    transitions.push({ eventId: event.id, before, after: status });
  }
  return { status, appliedAt, lastActivityAt, transitions };
}
```

Each event type maps to a target status:

| Event                                                                 | Target status                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| `JOB_SAVED`                                                           | SAVED                                                |
| `APPLICATION_SUBMITTED`, `APPLICATION_CONFIRMATION_RECEIVED`          | APPLIED                                              |
| `ASSESSMENT_RECEIVED`                                                 | ASSESSMENT                                           |
| `RECRUITER_CONTACT`                                                   | RECRUITER_SCREEN                                     |
| `INTERVIEW_REQUESTED`, `INTERVIEW_SCHEDULED`, `INTERVIEW_RESCHEDULED` | INTERVIEW, or FINAL_ROUND if `metadata.isFinalRound` |
| `NEXT_ROUND`                                                          | INTERVIEW, or FINAL_ROUND if `metadata.isFinalRound` |
| `OFFER_RECEIVED`                                                      | OFFER                                                |
| `REJECTION_RECEIVED`                                                  | REJECTED                                             |
| `APPLICATION_WITHDRAWN`                                               | WITHDRAWN                                            |
| `FOLLOW_UP_SENT`                                                      | none (timeline only)                                 |
| `STATUS_OVERRIDDEN`                                                   | `metadata.toStatus`                                  |

`transition(current, event)` applies these rules in order:

1. `STATUS_OVERRIDDEN` sets the status unconditionally. This is the user's explicit choice.
2. Events with no target status leave the status unchanged.
3. If the current status is final (OFFER, REJECTED, WITHDRAWN), only manual events change it. Automatic events are still recorded in the timeline.
4. REJECTED, WITHDRAWN and OFFER apply from any active status.
5. Otherwise the status only moves forward by rank: UNKNOWN < SAVED < APPLIED < ASSESSMENT = RECRUITER_SCREEN < INTERVIEW < FINAL_ROUND. Equal rank is a lateral move to the later event.

Because derivation replays events in the order they happened, an "application received" email processed after an interview invitation sorts before it and cannot regress the status. `applied_at` is derived from the earliest submission or confirmation event, and `last_activity_at` from the latest active event.

### Undo

Undo sets `reverted_at` on the event and re-runs derivation inside the same transactional processor. Reverted events stay visible, struck through, in the timeline.

## Classification pipeline

Details are in [email-pipeline.md](email-pipeline.md). In summary:

```
Gmail message (metadata only)
      ↓
Relevance filter — sender, subject and snippet signals; at least two independent signals required
      ↓ relevant
Fetch body in memory → rule classifier
      ↓
Confident? ── yes ──► structured result
      │ no
      ▼
LLM classifier (structured output, schema-validated, confidence capped)
      ↓
Matching → automation decision → event, review item, or nothing
```

Rules run first because they are free, fast, deterministic and testable, and most recruiting email is formulaic. The LLM sees only messages the rules cannot resolve, receives the minimum content needed, has no tools, and its output must validate against a strict schema.

## Matching

Matching links an incoming signal, whether an email or an extension submission, to an existing application. The scorer is a pure function in `packages/domain`, and its weights live in one configuration object:

| Signal                                       | Points |
| -------------------------------------------- | ------ |
| ATS job ID match                             | +50    |
| Same Gmail thread as an email already linked | +60    |
| Company name exact match (normalized)        | +40    |
| Company domain match                         | +30    |
| Job title exact match (normalized)           | +30    |
| Job title similar (token similarity)         | +20    |
| Applied within 30 days of the signal         | +10    |
| Sender domain matches the company domain     | +10    |
| Clearly different title at the same company  | −30    |

- 80 or more is an automatic match, 50–79 a possible match, and below 50 no match. Thresholds come from user settings.
- If the top two candidates both clear the automatic threshold within a small margin, the decision drops to a possible match. The system never guesses between two roles at the same company.
- Every result includes the contributing signals, so the UI can explain itself: "Matched: same company, similar title, applied 2 days earlier."
- Normalization handles legal suffixes ("Inc.", "LLC"), ATS display names ("Datadog Hiring Team"), seniority and level variants ("Sr.", "II"), and common abbreviations.

## Confidence thresholds

A pure `decideAutomation` function combines classification confidence, the match decision and user settings:

| Condition                                      | Decision                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Automatic match and confidence ≥ 0.95          | `AUTO_APPLY`: event created                                          |
| Automatic match and 0.75 ≤ confidence < 0.95   | `APPLY_FLAGGED`: event created, marked auto-classified, undo offered |
| Possible match, or 0.50 ≤ confidence < 0.75    | `NEEDS_REVIEW`: review item, nothing changes yet                     |
| Confidence < 0.50                              | `NO_UPDATE`                                                          |
| Automatic updates disabled in settings         | anything that would apply becomes `NEEDS_REVIEW`                     |
| "Ask before medium-confidence updates" enabled | `APPLY_FLAGGED` becomes `NEEDS_REVIEW`                               |

LLM confidence is capped below the automatic band unless the rules independently agree, so LLM-only classifications are always visibly flagged. Offers and rejections inferred by the LLM alone always require review. The thresholds are deliberately conservative because a wrong automatic change costs more trust than a confirmation prompt costs effort.

## Privacy strategy

- **Collect less.** Gmail messages are first read as metadata. Bodies are fetched only for relevant messages, processed in memory and discarded.
- **Store less.** Trackr stores message and thread IDs, sender, subject, timestamp, Gmail's short snippet and the parsed result. Messages judged irrelevant keep only their IDs, so they are never reprocessed.
- **Send less.** The LLM receives the sender, subject and a truncated plain-text body with quoted history removed, and never the user's other data.
- **Explain everything.** Each automatic update links back to the email metadata and detection result that caused it.
- **Logos without leaks.** Company logos load through Trackr's own `/api/logos/[domain]` route, which requires a session, fetches each icon server-side, passes through raster images only and caches them. Logo providers see Trackr's server, not which companies a person applied to.
- **User control.** Disconnecting Gmail revokes the token at Google and deletes the stored tokens. Imported email metadata, applications and the account can each be deleted, and data can be exported.

## Security

- **Three separate credentials.**
  - The web session is a Supabase Auth cookie managed by `@supabase/ssr`.
  - Gmail access is OAuth tokens held server-side.
  - The extension uses Trackr-issued tokens.

  Connecting Gmail is independent of how the user signs in.

- **Authorization.** All data access goes through server-side Drizzle queries scoped by `user_id`. Supabase's auto-generated Data API is turned off for the project, since nothing uses it. As a second layer, row-level security is enabled with no policies on every table, so even with the Data API on, the public key could not read them.
- **Token encryption.** Gmail tokens are encrypted with AES-256-GCM using a key from the environment, in a versioned format (`v1.<iv>.<ciphertext>.<tag>`) that allows key rotation. Tokens never reach the browser.
- **Extension tokens.**
  - Only hashes are stored.
  - Access tokens are short-lived, and refresh tokens rotate on use.
  - Each connected browser can be revoked individually.
  - Tokens never appear in URLs.
- **CSRF.** Server actions rely on Next.js origin checks. The OAuth `state` parameter is bound to an httpOnly cookie. The extension API authenticates with bearer tokens, not cookies.
- **Rate limiting.** Ingestion and sync endpoints use fixed-window counters stored in Postgres.
- **Input handling.** Every boundary validates with zod. Captured job descriptions are converted to sanitized plain text, and user or email content is never rendered as raw HTML.
- **LLM output.** Email is treated as untrusted input. The model has no tools, its output is schema-validated, and its confidence is capped.
- **Secrets.** Secrets are environment variables, validated on first use (`src/lib/env.ts` for public values, `src/server/env.ts` for server secrets) and documented in `.env.example`. Validation errors name the missing variables but never print values.

## Authentication

Email-and-password accounts through Supabase Auth, with the session in cookies managed by `@supabase/ssr`.

- **Proxy (`src/proxy.ts`).** Runs on every page request. It refreshes the session, then redirects optimistically: signed-out visitors go to `/login?next=…`, and signed-in users are sent away from the sign-in and sign-up pages. Refreshed cookies, and the no-store header that must accompany them, are kept on redirects. API routes pass through and authenticate themselves.
- **Verification.** The proxy is not the authorization boundary. Layouts, pages and server actions call `requireUser()`, which verifies the session JWT with `supabase.auth.getClaims()` and is cached per request.
- **Users table.** Sign-in, sign-up and the email-confirmation callback upsert the `users` row. Later sign-ins refresh the email and name.
- **Forms.** Sign-in, sign-up and sign-out are server actions. Input is validated with zod. Supabase error codes are mapped to plain messages that never reveal whether an account exists.
- **Redirect safety.** `?next=` only accepts same-origin paths to protected pages, so it cannot be used as an open redirect or cause a redirect loop.

## UI architecture

- **Routing.** App Router, with `(auth)` and `(app)` route groups. The authenticated shell holds the sidebar, the header and an `@drawer` parallel-route slot.

  ```
  (app)/
  ├── layout.tsx                         sidebar + header + {children} + {drawer}
  ├── @drawer/(.)applications/[id]/      detail drawer (intercepted navigation)
  ├── overview/
  ├── applications/                      ?view=board|table, filters in the URL
  ├── applications/[id]/                 full detail page (direct links, refresh)
  ├── activity/ · analytics/ · resumes/ · integrations/
  └── settings/{account,automation,privacy,data}/
  ```

- **Detail drawer.** Clicking a card or row is intercepted and renders the detail view in a right-side drawer, keeping the board's scroll position and filters. A direct URL or a refresh renders the full page. Both render the same `ApplicationDetailView`.
- **Data flow.** Server components read through services. Mutations go through server actions followed by revalidation. Board drags use optimistic updates.
- **Streaming.** Each Overview section is an independent async component inside `<Suspense>` with a skeleton, so one slow query never blocks the page.
- **URL as state.** View, filters, sort and search live in search params, so every view is linkable. Filtering and sorting run in SQL; the search box matches company, role and location, and the response filter uses the same definition of a response as the analytics.
- **Navigation.** Navigation items appear in the phase that implements them, so there are no dead links.

## Error handling

| Failure                                             | Behavior                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Gmail access token expired                          | Refreshed automatically                                                                           |
| Gmail refresh rejected (`invalid_grant`) or revoked | Integration set to `NEEDS_REAUTH`, banner with reconnect, sync paused                             |
| LLM unavailable, timed out or invalid output        | One retry, then the email is marked failed with an error code and retried on the next sync        |
| Database unavailable                                | Request fails with a generic error. The extension keeps the submission in its outbox and retries. |
| Extension cannot identify a job                     | The popup opens with editable, pre-filled fields                                                  |
| Duplicate event                                     | Dedupe-key conflict: no-op that returns the existing event                                        |
| Email cannot be matched                             | Review item (link, create, or ignore)                                                             |
| Sync interrupted                                    | The cursor is persisted after each batch, so the next sync resumes                                |

Failures are stored on the relevant record (`emails.error_code`, `integrations.last_error_code`) and surfaced in the UI, never silently dropped.

## Logging

A small structured JSON logger with a **per-event allowlist** of fields:

```
event: gmail_message_processed
messageId: 18c2…  classification: INTERVIEW_REQUEST  confidence: 0.97
method: RULES  matchDecision: AUTO_MATCH  applicationId: 6f1…  durationMs: 412
```

Fields that are not allowlisted are dropped, so new code cannot leak email content, tokens or personal data by accident.

## Testing strategy

| Level                  | Tooling                      | Covers                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                   | Vitest (`packages/domain`)   | Company and title normalization, title similarity, status transitions (including shuffled event orders), event dedupe keys, match scoring, rule classification fixtures, automation decisions, analytics math              |
| Integration            | Vitest + PGlite (`apps/web`) | Services against real Postgres with real migrations: create application, extension event creates application, confirmation matches, interview and rejection update status, duplicate events are no-ops, users are isolated |
| Extension              | Vitest + DOM fixtures        | Platform detectors against saved Greenhouse, Lever and Ashby pages                                                                                                                                                         |
| Classification quality | Labeled email fixtures       | Precision and recall of the relevance filter, classifier and matcher over time                                                                                                                                             |
| End to end             | Playwright (Phase 9)         | The MVP acceptance flow                                                                                                                                                                                                    |

PGlite runs Postgres in-process via WebAssembly, so integration tests need no Docker or external database.

## Environments

- **Local:** Next.js dev server against a hosted Supabase development project. Tests use PGlite.
- **Production:** Vercel and Supabase. Migrations are generated with drizzle-kit, reviewed as SQL, and applied as a deploy step.
- **Scheduled work (Phase 9):** Vercel Cron for periodic Gmail sync and reminder generation. Until then, sync is user-triggered.

## Key decisions

| Decision                                                  | Rationale                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Modular monolith in one Next.js app                       | One deployable unit, one language, shared types. The scale does not justify service boundaries.                  |
| pnpm workspace with a single shared package               | Only pure domain code is shared, between web and extension. Services have one consumer, so they stay in the app. |
| Drizzle ORM                                               | SQL-first, typed, lightweight, and runs against PGlite in tests.                                                 |
| Supabase for Postgres and Auth                            | Managed database and authentication with little operational overhead.                                            |
| Server-side data access only, RLS with no policies        | One authorization point in the service layer, and nothing exposed through the Supabase Data API.                 |
| Server actions for the UI, REST only for external clients | Avoids maintaining two parallel APIs. The extension and OAuth flows get proper HTTP endpoints.                   |
| Event log and derived status from the first phase         | Board drags already produce events, and later phases build on the same model without a rewrite.                  |
| Status derived by replaying events                        | Correct under out-of-order arrival, and makes undo trivial.                                                      |
| Matching delivered before the LLM fallback                | Rules plus matching complete the end-to-end flow. The LLM improves coverage of an already working pipeline.      |
| PGlite for integration tests                              | Real Postgres semantics without Docker.                                                                          |
