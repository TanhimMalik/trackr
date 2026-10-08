# Database

Trackr uses PostgreSQL, hosted on Supabase, accessed through Drizzle ORM from server-side code only. This document describes the target schema. Tables are introduced in the phase that first uses them (see [Rollout](#rollout)).

## Conventions

- **Keys:** `uuid` primary keys generated with `gen_random_uuid()`.
- **Time:** `timestamptz` everywhere, stored in UTC and displayed in the user's timezone.
- **Ownership:** every user-owned table has a `user_id` column, so authorization is a single filter and the schema is ready for row-level policies.
- **Enums:** Postgres enums are generated from the `as const` arrays in `packages/domain`. The domain package is the single source of truth for enum values.
- **Naming:** `snake_case` tables and columns. Normalized helper columns end in `_norm`.
- **Derived columns:** `applications.current_status`, `applied_at` and `last_activity_at`, plus `application_events.status_before` and `status_after`, are written only by the event processor.
- **Row-level security:** enabled with no policies on every table. Trackr never queries through the Supabase Data API, and this guarantees the tables are not reachable with the public key.
- **Supabase Auth:** `users.id` equals the Supabase auth user ID. There is no foreign key into the `auth` schema, which keeps the schema portable and testable on PGlite.

## Enums

| Enum                      | Values                                                                                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application_status`      | SAVED, APPLIED, ASSESSMENT, RECRUITER_SCREEN, INTERVIEW, FINAL_ROUND, OFFER, REJECTED, WITHDRAWN, UNKNOWN                                                                                                                                                                              |
| `application_event_type`  | JOB_SAVED, APPLICATION_SUBMITTED, APPLICATION_CONFIRMATION_RECEIVED, ASSESSMENT_RECEIVED, RECRUITER_CONTACT, INTERVIEW_REQUESTED, INTERVIEW_SCHEDULED, INTERVIEW_RESCHEDULED, NEXT_ROUND, OFFER_RECEIVED, REJECTION_RECEIVED, APPLICATION_WITHDRAWN, FOLLOW_UP_SENT, STATUS_OVERRIDDEN |
| `event_source_type`       | BROWSER_EXTENSION, EMAIL, MANUAL, SYSTEM                                                                                                                                                                                                                                               |
| `source_platform`         | LINKEDIN, GREENHOUSE, LEVER, ASHBY, WORKDAY, ICIMS, COMPANY_SITE, INDEED, OTHER                                                                                                                                                                                                        |
| `application_source`      | LINKEDIN, INDEED, COMPANY_SITE, REFERRAL, HANDSHAKE, OTHER                                                                                                                                                                                                                             |
| `employment_type`         | FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP, TEMPORARY, OTHER                                                                                                                                                                                                                           |
| `classification_method`   | RULES, LLM                                                                                                                                                                                                                                                                             |
| `email_classification`    | APPLICATION_CONFIRMATION, ASSESSMENT, RECRUITER_CONTACT, INTERVIEW_REQUEST, INTERVIEW_CONFIRMATION, INTERVIEW_RESCHEDULE, NEXT_ROUND, OFFER, REJECTION, WITHDRAWAL, UNKNOWN                                                                                                            |
| `email_processing_status` | MATCHED, NEEDS_REVIEW, UNMATCHED, DISMISSED, IGNORED, FAILED                                                                                                                                                                                                                           |
| `contact_type`            | RECRUITER, HIRING_MANAGER, INTERVIEWER, COORDINATOR, OTHER                                                                                                                                                                                                                             |
| `interview_type`          | RECRUITER_SCREEN, TECHNICAL, HIRING_MANAGER, ONSITE, FINAL, OTHER                                                                                                                                                                                                                      |
| `interview_status`        | SCHEDULED, COMPLETED, CANCELED                                                                                                                                                                                                                                                         |
| `integration_provider`    | GMAIL                                                                                                                                                                                                                                                                                  |
| `integration_status`      | CONNECTED, NEEDS_REAUTH, ERROR, DISCONNECTED                                                                                                                                                                                                                                           |
| `review_item_kind`        | POSSIBLE_DUPLICATE, EMAIL_POSSIBLE_MATCH, EMAIL_UNMATCHED, LOW_CONFIDENCE_UPDATE                                                                                                                                                                                                       |
| `review_item_state`       | OPEN, RESOLVED, DISMISSED                                                                                                                                                                                                                                                              |
| `review_resolution`       | CONFIRMED, LINKED, CREATED, MERGED, DISMISSED                                                                                                                                                                                                                                          |
| `notification_type`       | STATUS_CHANGED, ASSESSMENT_RECEIVED, INTERVIEW_SCHEDULED, FOLLOW_UP_DUE, REVIEW_NEEDED, INTEGRATION_ERROR                                                                                                                                                                              |

## Tables

### `users`

One row per account, created on first sign-in.

| Column       | Type        | Notes                                                             |
| ------------ | ----------- | ----------------------------------------------------------------- |
| `id`         | uuid PK     | Equals the Supabase auth user ID                                  |
| `email`      | text        | Null only for demo accounts, which are anonymous                  |
| `name`       | text        |                                                                   |
| `is_demo`    | boolean     | A temporary workspace from "Try the demo"; deleted after 48 hours |
| `created_at` | timestamptz | Partial index on demo accounts, for deleting expired ones         |
| `updated_at` | timestamptz |                                                                   |

### `user_settings`

Preferences, one row per user, created the first time one is saved or needed. Columns are added with the phase that uses them: automation thresholds (`auto_apply_min_confidence`, `match_auto_min_score` and so on) arrive with the email pipeline.

| Column                        | Type                        | Default | Notes                                           |
| ----------------------------- | --------------------------- | ------- | ----------------------------------------------- |
| `user_id`                     | uuid PK → `users` (cascade) |         |                                                 |
| `follow_up_reminders_enabled` | boolean                     | true    |                                                 |
| `follow_up_after_days`        | integer                     | 14      | Check: 1–90; the UI offers 7, 10, 14, 21 or 30  |
| `auto_track_supported_sites`  | boolean                     | true    | Off: the extension only tracks from its popup   |
| `reminders_checked_at`        | timestamptz                 |         | Last reminder check; cleared when settings save |
| `updated_at`                  | timestamptz                 |         |                                                 |

### `applications`

| Column              | Type                                | Notes                                                      |
| ------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `id`                | uuid PK                             |                                                            |
| `user_id`           | uuid → `users` (cascade)            |                                                            |
| `company_name`      | text                                | Not null                                                   |
| `company_name_norm` | text                                | Not null. Normalized for matching and deduplication.       |
| `company_domain`    | text                                | e.g. `stripe.com`                                          |
| `job_title`         | text                                | Not null                                                   |
| `job_title_norm`    | text                                | Not null                                                   |
| `job_url`           | text                                |                                                            |
| `ats_job_id`        | text                                | Platform job identifier, such as a Greenhouse job ID       |
| `job_description`   | text                                | Sanitized plain text. Null when the user disables storage. |
| `location`          | text                                |                                                            |
| `employment_type`   | `employment_type`                   | Nullable                                                   |
| `salary_min`        | integer                             |                                                            |
| `salary_max`        | integer                             |                                                            |
| `salary_currency`   | char(3)                             | ISO 4217                                                   |
| `source`            | `application_source`                | Nullable. Where the job was found.                         |
| `source_platform`   | `source_platform`                   | Not null, default OTHER. Where it was submitted.           |
| `current_status`    | `application_status`                | Not null. Derived.                                         |
| `applied_at`        | timestamptz                         | Derived from the earliest submission or confirmation event |
| `last_activity_at`  | timestamptz                         | Not null. Derived from the latest active event.            |
| `resume_version_id` | uuid → `resume_versions` (set null) |                                                            |
| `notes`             | text                                |                                                            |
| `created_at`        | timestamptz                         |                                                            |
| `updated_at`        | timestamptz                         |                                                            |

Indexes and constraints:

- `(user_id, current_status)`, which serves the board and filters
- `(user_id, last_activity_at DESC)`, which serves recently updated lists and stale detection
- `(user_id, company_name_norm)`, which serves matching candidate lookup
- `UNIQUE (user_id, source_platform, ats_job_id) WHERE ats_job_id IS NOT NULL`, a race-proof backstop against duplicate submissions
- `UNIQUE (id, user_id)`, the target of child tables' ownership foreign keys
- Checks: salaries are non-negative, `salary_min <= salary_max`, and `salary_currency` is three uppercase letters

### `application_events`

Append-only history. Rows are never updated except for derived transition columns and `reverted_at`.

| Column                  | Type                            | Notes                                                                     |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `id`                    | uuid PK                         |                                                                           |
| `application_id`        | uuid → `applications` (cascade) | Not null                                                                  |
| `user_id`               | uuid → `users` (cascade)        |                                                                           |
| `event_type`            | `application_event_type`        |                                                                           |
| `event_timestamp`       | timestamptz                     | When it happened (email date, submission time)                            |
| `source_type`           | `event_source_type`             |                                                                           |
| `source_reference`      | text                            | Gmail message ID or extension submission ID                               |
| `email_id`              | uuid → `emails` (set null)      | Added in Phase 4                                                          |
| `classification_method` | `classification_method`         | Nullable. Drives the auto-classified marker.                              |
| `confidence`            | real                            | 0–1. Null for manual events.                                              |
| `metadata_json`         | jsonb                           | Not null, default `{}`. Validated per event type.                         |
| `dedupe_key`            | text                            | Not null. e.g. `email:<messageId>`, `ext:<submissionId>`, `manual:<uuid>` |
| `status_before`         | `application_status`            | Derived during replay                                                     |
| `status_after`          | `application_status`            | Derived during replay                                                     |
| `reverted_at`           | timestamptz                     | Set by undo. Reverted events are excluded from derivation.                |
| `created_at`            | timestamptz                     | When Trackr learned about it                                              |

Indexes and constraints:

- `FOREIGN KEY (application_id, user_id) → applications (id, user_id)` (cascade), so an event can only belong to an application owned by the same user
- `UNIQUE (user_id, dedupe_key)`, which makes ingestion idempotent
- `(application_id, event_timestamp)`, which serves timelines and replay
- `(user_id, event_timestamp DESC, created_at DESC, id DESC)`, which serves the Activity page and its cursor pagination
- `(user_id, created_at DESC)`, for recently recorded events
- Check: `confidence` is null or between 0 and 1

### `emails`

Only job-related messages. Full bodies are never stored.

| Column                      | Type                             | Notes                                                                        |
| --------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `id`                        | uuid PK                          |                                                                              |
| `user_id`                   | uuid → `users` (cascade)         |                                                                              |
| `integration_id`            | uuid → `integrations` (set null) |                                                                              |
| `gmail_message_id`          | text                             | Not null                                                                     |
| `gmail_thread_id`           | text                             | Not null                                                                     |
| `sender_email`              | text                             |                                                                              |
| `sender_name`               | text                             |                                                                              |
| `sender_domain`             | text                             |                                                                              |
| `subject`                   | text                             |                                                                              |
| `snippet`                   | text                             | Gmail's short snippet only                                                   |
| `received_at`               | timestamptz                      | Not null                                                                     |
| `classification`            | `email_classification`           |                                                                              |
| `classification_confidence` | real                             |                                                                              |
| `classification_method`     | `classification_method`          |                                                                              |
| `extracted_json`            | jsonb                            | Validated classifier output: recruiter, interview time, ATS job ID, evidence |
| `company_name`              | text                             |                                                                              |
| `job_title`                 | text                             |                                                                              |
| `processing_status`         | `email_processing_status`        | Not null                                                                     |
| `application_id`            | uuid → `applications` (set null) | Confirmed link                                                               |
| `match_score`               | integer                          | Best candidate score, for diagnostics                                        |
| `error_code`                | text                             | e.g. `LLM_UNAVAILABLE`. Retried on the next sync.                            |
| `created_at`                | timestamptz                      |                                                                              |
| `updated_at`                | timestamptz                      |                                                                              |

Rows with status `IGNORED` keep only identifiers (sender, subject and snippet are null), so re-syncs skip them without storing their content.

Indexes and constraints:

- `UNIQUE (user_id, gmail_message_id)`
- `(user_id, processing_status)`
- `(user_id, gmail_thread_id)`, which serves thread-continuity matching

### `review_items`

A single review queue for every source of uncertainty. `email_id` is added with the Gmail tables in Phase 4. Merging a duplicate moves its events, contacts, interviews and notifications to the kept application, and the resolved item then points at that application.

| Column                     | Type                             | Notes                                                       |
| -------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `id`                       | uuid PK                          |                                                             |
| `user_id`                  | uuid → `users` (cascade)         |                                                             |
| `kind`                     | `review_item_kind`               |                                                             |
| `state`                    | `review_item_state`              | Default OPEN                                                |
| `application_id`           | uuid → `applications` (cascade)  | The application under review, if any                        |
| `candidate_application_id` | uuid → `applications` (set null) | Suggested match or duplicate                                |
| `email_id`                 | uuid → `emails` (cascade)        |                                                             |
| `proposed_event`           | jsonb                            | Validated event input to create on confirmation             |
| `match_score`              | integer                          |                                                             |
| `match_reasons`            | jsonb                            | Contributing signals, for the explanation shown to the user |
| `resolution`               | `review_resolution`              | Set when resolved                                           |
| `dedupe_key`               | text                             | Not null                                                    |
| `created_at`               | timestamptz                      |                                                             |
| `resolved_at`              | timestamptz                      |                                                             |

Indexes and constraints: `UNIQUE (user_id, dedupe_key)`, plus `(user_id, state, created_at DESC)`.

### `contacts`

| Column           | Type                            | Notes |
| ---------------- | ------------------------------- | ----- |
| `id`             | uuid PK                         |       |
| `application_id` | uuid → `applications` (cascade) |       |
| `user_id`        | uuid → `users` (cascade)        |       |
| `name`           | text                            |       |
| `email`          | text                            |       |
| `title`          | text                            |       |
| `contact_type`   | `contact_type`                  |       |
| `created_at`     | timestamptz                     |       |
| `updated_at`     | timestamptz                     |       |

Constraint: `UNIQUE (application_id, email)`.

### `interviews`

| Column             | Type                                   | Notes                                 |
| ------------------ | -------------------------------------- | ------------------------------------- |
| `id`               | uuid PK                                |                                       |
| `application_id`   | uuid → `applications` (cascade)        |                                       |
| `user_id`          | uuid → `users` (cascade)               |                                       |
| `interview_type`   | `interview_type`                       |                                       |
| `scheduled_at`     | timestamptz                            |                                       |
| `duration_minutes` | integer                                |                                       |
| `meeting_url`      | text                                   |                                       |
| `location`         | text                                   |                                       |
| `contact_id`       | uuid → `contacts` (set null)           |                                       |
| `status`           | `interview_status`                     |                                       |
| `source_event_id`  | uuid → `application_events` (set null) | The event that created this interview |
| `created_at`       | timestamptz                            |                                       |
| `updated_at`       | timestamptz                            |                                       |

### `resume_versions`

| Column              | Type                     | Notes                                                    |
| ------------------- | ------------------------ | -------------------------------------------------------- |
| `id`                | uuid PK                  |                                                          |
| `user_id`           | uuid → `users` (cascade) |                                                          |
| `name`              | text                     | e.g. "Backend — Fall 2026"                               |
| `storage_path`      | text                     | Path in a private storage bucket, served via signed URLs |
| `original_filename` | text                     |                                                          |
| `created_at`        | timestamptz              |                                                          |

### `integrations`

| Column                    | Type                     | Notes                         |
| ------------------------- | ------------------------ | ----------------------------- |
| `id`                      | uuid PK                  |                               |
| `user_id`                 | uuid → `users` (cascade) |                               |
| `provider`                | `integration_provider`   |                               |
| `provider_account_id`     | text                     |                               |
| `provider_account_email`  | text                     | Shown as "Connected as …"     |
| `access_token_encrypted`  | text                     | AES-256-GCM, versioned format |
| `refresh_token_encrypted` | text                     | AES-256-GCM, versioned format |
| `token_expires_at`        | timestamptz              |                               |
| `scopes`                  | text[]                   |                               |
| `status`                  | `integration_status`     |                               |
| `sync_cursor`             | text                     | Gmail `historyId`             |
| `last_synced_at`          | timestamptz              |                               |
| `last_error_code`         | text                     |                               |
| `last_error_at`           | timestamptz              |                               |
| `created_at`              | timestamptz              |                               |
| `updated_at`              | timestamptz              |                               |

Constraint: `UNIQUE (user_id, provider)`.

### `notifications`

| Column           | Type                                   | Notes                                                                                                  |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`             | uuid PK                                |                                                                                                        |
| `user_id`        | uuid → `users` (cascade)               |                                                                                                        |
| `application_id` | uuid → `applications` (cascade)        | Nullable                                                                                               |
| `event_id`       | uuid → `application_events` (set null) |                                                                                                        |
| `type`           | `notification_type`                    |                                                                                                        |
| `title`          | text                                   | Written once, e.g. "Figma moved to Interview"                                                          |
| `body`           | text                                   | The job title                                                                                          |
| `read_at`        | timestamptz                            |                                                                                                        |
| `dedupe_key`     | text                                   | `event:<eventId>`, `stale:<applicationId>:<lastActivityAt>` or `interview:<interviewId>:<scheduledAt>` |
| `created_at`     | timestamptz                            |                                                                                                        |

Constraint: `UNIQUE (user_id, dedupe_key)`, which makes reminder generation idempotent.

### `extension_sessions`

One row per connected browser. Only hashes of secrets are stored.

| Column               | Type                     | Notes                                       |
| -------------------- | ------------------------ | ------------------------------------------- |
| `id`                 | uuid PK                  |                                             |
| `user_id`            | uuid → `users` (cascade) |                                             |
| `label`              | text                     | e.g. "Chrome on macOS"                      |
| `code_hash`          | text                     | One-time connect code, valid for 60 seconds |
| `code_expires_at`    | timestamptz              |                                             |
| `access_token_hash`  | text                     | Unique                                      |
| `access_expires_at`  | timestamptz              | About one hour                              |
| `refresh_token_hash` | text                     | Unique. Rotated on every use.               |
| `refresh_expires_at` | timestamptz              | About 30 days                               |
| `last_used_at`       | timestamptz              |                                             |
| `revoked_at`         | timestamptz              |                                             |
| `created_at`         | timestamptz              |                                             |

### `rate_limit_buckets`

| Column         | Type        | Notes                         |
| -------------- | ----------- | ----------------------------- |
| `key`          | text        | e.g. `ext-submit:<sessionId>` |
| `window_start` | timestamptz |                               |
| `count`        | integer     |                               |

Primary key: `(key, window_start)`. Expired windows are deleted opportunistically.

## Relationships

```
users ─┬─< applications ─┬─< application_events >─ emails
       │                 ├─< contacts ─< interviews
       │                 ├─< interviews
       │                 └── resume_versions
       ├─< emails ───────── integrations
       ├─< review_items (→ application, candidate application, email)
       ├─< notifications
       ├─< extension_sessions
       └── user_settings
```

## Rollout

| Phase | Tables                                                           |
| ----- | ---------------------------------------------------------------- |
| 1     | `users`, `applications`, `application_events`, `resume_versions` |
| 2     | `user_settings`, `contacts`, `interviews`, `notifications`       |
| 3     | `extension_sessions`, `rate_limit_buckets`, `review_items`       |
| 3     | `extension_sessions`, `review_items`, `rate_limit_buckets`       |
| 4     | `integrations`, `emails`, plus `application_events.email_id`     |
| 5     | New `review_item_kind` values for email review                   |

## Migrations

- The schema is defined in TypeScript under `apps/web/src/server/db/schema/`.
- `pnpm db:generate` produces SQL migrations under `apps/web/src/server/db/migrations/`. Generated SQL is reviewed and committed with the schema change that caused it. Running it again with no schema changes reports nothing to migrate, which is how drift is checked.
- `pnpm db:migrate` applies migrations to the database in `DATABASE_URL`, read from `apps/web/.env.local`. Integration tests apply the same migrations to a fresh PGlite database for every test file.
- Enum values are only ever added. Removing or renaming a value requires an explicit migration plan.

## Access

- The app connects with postgres-js through `getDb()` in `apps/web/src/server/db/client.ts`. Prepared statements are disabled because Supabase's transaction pooler does not support them.
- Services accept the shared `Database` type, so the same code runs against postgres-js in the app and PGlite in tests.
- ESLint allows imports of the client and schema only from `src/server/services` and `src/server/db`.

## Deletion and retention

- Deleting an application cascades to its events, contacts, interviews, notifications and review items. Linked emails keep their metadata with `application_id` set to null.
- "Delete imported email metadata" deletes the user's `emails` rows. Events created from those emails remain, with `email_id` set to null.
- Disconnecting Gmail revokes the token with Google and removes the stored tokens.
- Deleting the account deletes the Supabase auth user and the `users` row, which cascades to all user data.
