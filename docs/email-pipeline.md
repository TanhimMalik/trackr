# Email Pipeline

> **Status:** Phase 4, in progress. The pure stages are implemented in `packages/domain/src/email` (relevance, body cleanup, rule classifier, extraction, event mapping, automation decision) with a labeled corpus, so are the Gmail connection (`/api/integrations/gmail/connect` and `/callback`, `services/gmail-connection.ts`) and **Sync now** (`services/gmail-sync.ts`, `services/email-processing.ts`), with email review in Activity → Needs review. Matching and review are part of Phase 4. The LLM fallback, measured against a labeled benchmark of real email, is Phase 5.

The email pipeline turns a user's Gmail inbox into application events: confirmations, assessments, recruiter contact, interview requests, offers and rejections. It is built to be cheap, deterministic where possible, and minimal in what it reads and stores.

## Pipeline overview

```
Gmail (incremental sync)
      │  message IDs since the last cursor
      ▼
1. Fetch metadata ──────────── From, Subject, Date, snippet, labels (no body)
      ▼
2. Relevance filter ────────── not relevant → stored as IGNORED (IDs only)
      │ relevant
      ▼
3. Fetch body, in memory only, as plain text with quoted history removed
      ▼
4. Rule classifier ─────────── confident → structured result
      │ not confident
      ▼
5. LLM classifier ──────────── structured output, schema-validated, confidence capped
      ▼
6. Extraction ──────────────── company, title, ATS job ID, recruiter, interview time
      ▼
7. Matching ────────────────── AUTO_MATCH | POSSIBLE_MATCH | NO_MATCH
      ▼
8. Automation decision ─────── event · flagged event · review item · nothing
      ▼
9. Persist email metadata, discard the body, write a structured log line
```

Each stage is a separate, individually testable function. Stages 2, 4, 6 (rule-based parts), 7 and 8 are pure functions in `packages/domain`.

## Gmail connection

- **Separate from sign-in.** Gmail is connected from Integrations through its own Google OAuth flow, independent of how the user signs in to Trackr.
- **Scopes:** `https://www.googleapis.com/auth/gmail.readonly`, plus `openid` and `email` to identify the connected account.
- **Offline access:** the flow requests `access_type=offline` and `prompt=consent` to obtain a refresh token.
- **CSRF protection:** the `state` parameter is a random value bound to an httpOnly cookie (scoped to `/api/integrations/gmail`, ten minutes) and verified on callback. The flow also uses PKCE (S256).
- **Scope check:** Google lets people uncheck Gmail access on the consent screen. A grant without `gmail.readonly` is revoked straight away and the user is told why.
- **Demo workspaces** can't connect Gmail: they are anonymous and deleted after 48 hours.
- **Storage:** tokens are encrypted with AES-256-GCM before storage, as `v1.<iv>.<ciphertext>.<tag>` with the key in `TOKEN_ENCRYPTION_KEY`. Access tokens are refreshed on demand a minute before they expire, and a rotated refresh token replaces the old one.
- **Disconnect:** revokes the token at Google's revocation endpoint, deletes stored tokens and marks the integration `DISCONNECTED`.

`gmail.readonly` is a restricted scope. Until the app completes Google's verification and security assessment, it runs in testing mode: access is limited to listed test users, and refresh tokens expire after seven days. The integration handles this explicitly. An `invalid_grant` response moves the integration to `NEEDS_REAUTH`, clears the tokens, shows **Reconnect Gmail** in Integrations and sends one notification a day while it lasts.

## Sync

Sync is triggered by **Sync now** and, from Phase 8, by a scheduled job. Each invocation processes a bounded batch so it fits within serverless execution limits.

1. **First sync (backfill).** `users.messages.list` over the last 90 days, with a coarse Gmail search query that pre-selects likely candidates by sender domain and subject keywords and excludes spam, trash and chats. The query is only a cost optimization; the relevance filter makes the actual decision.
2. **Incremental sync.** `users.history.list` from the stored `historyId` cursor, limited to `messageAdded`. If the cursor has expired, sync falls back to a time-windowed list since `last_synced_at`.
3. **Batches.** Each call reads one page of up to 25 messages (or one page of history) and stops starting new messages after 20 seconds. The cursor, stored as JSON in `sync_cursor` (`{ mode: "backfill" | "incremental", historyId, pageToken?, after? }`), only moves past a page once all of it is done, and the response reports `hasMore` so **Sync now** keeps going and shows a running count. The backfill records the mailbox `historyId` when it starts, so mail that arrives during it is picked up incrementally afterwards.
4. **One at a time.** A sync claims `sync_locked_until` (90 seconds) with a conditional update, so a second click or tab is told a sync is already running.
5. **Failures.** A message that can't be processed is stored as `FAILED` with an error code and retried on the next sync. Gmail outages and rate limits end the batch without moving the cursor. A disabled Gmail API (`accessNotConfigured`) puts the integration in `ERROR` with a clear message, and **Try again** works once the API is enabled.
6. **Idempotency.** `UNIQUE (user_id, gmail_message_id)` on `emails` and the `email:<messageId>` event dedupe key make re-processing a no-op.

## Stage 1–2: relevance filter

The filter runs on metadata only: sender, display name, subject, snippet and labels. It scores independent signals and requires at least two distinct kinds of evidence. A single keyword is never enough.

| Signal                                                                                                                                                                                                      | Weight              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Sender domain is a known ATS or recruiting platform (initial list: greenhouse.io, greenhouse-mail.io, lever.co, ashbyhq.com, myworkday.com, myworkdayjobs.com, icims.com, smartrecruiters.com, jobvite.com) | +3                  |
| Sender is a job board's application channel (LinkedIn, Indeed)                                                                                                                                              | +2                  |
| Sender local part looks like recruiting (`careers`, `recruiting`, `talent`, `jobs`, `hiring`)                                                                                                               | +1                  |
| Subject contains application vocabulary (application, applied, candidate, position, role, interview, assessment, coding challenge, offer, next steps)                                                       | +2 (once)           |
| Snippet contains application vocabulary (the subject terms plus unfortunately, moving forward, schedule, availability, recruiter)                                                                           | +1 per term, max +2 |
| Assessment or scheduling platform domain in the snippet (HackerRank, CodeSignal, Codility, Calendly, GoodTime)                                                                                              | +2                  |
| The thread already has a linked message, or the sender is a contact on an application                                                                                                                       | +3 each             |
| Job-alert or digest patterns ("jobs you may be interested in", "job alert", "recommended for you")                                                                                                          | −4                  |
| Promotions category with an unsubscribe header and no other recruiting signal                                                                                                                               | −2                  |

A message is relevant when its score is at least 3 **and** at least two signal kinds contributed. Vocabulary matches whole words and their plurals. Known threads and contacts let a recruiter's "we'd love to move you to the final round" through even when its subject says nothing about a job. Sender-domain and vocabulary lists are data, kept in the domain package and tuned against labeled fixtures. Irrelevant messages are stored as `IGNORED` rows with identifiers only, so later syncs skip them.

## Stage 3: body handling

- The body is fetched only for relevant messages.
- `text/plain` is preferred. HTML is converted to text, and quoted replies, signatures and footers are stripped where detectable.
- The body is truncated to a fixed budget (about 4,000 characters) before any LLM call.
- The body lives only in memory for the duration of processing. It is never stored and never logged.

## Stage 4: rule classifier

Rules are ordered phrase and structure patterns per classification. Each match contributes evidence, and the classifier returns the strongest classification with a confidence score.

| Classification             | Example evidence                                                                                                       | Typical confidence |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `APPLICATION_CONFIRMATION` | "thank you for applying", "we've received your application", "your application has been submitted", from an ATS sender | 0.97               |
| `REJECTION`                | "unfortunately", "not to move forward", "decided to pursue other candidates", "position has been filled"               | 0.97               |
| `ASSESSMENT`               | "coding challenge", "online assessment", "take-home", or an assessment-platform link                                   | 0.96               |
| `INTERVIEW_CONFIRMATION`   | Calendar invitation part, "interview confirmed", scheduling-tool confirmation                                          | 0.95               |
| `INTERVIEW_REQUEST`        | "schedule an interview", "share your availability", "set up a call", or a scheduling link                              | 0.90               |
| `INTERVIEW_RESCHEDULE`     | "reschedule", "new time" in an interview context                                                                       | 0.90               |
| `NEXT_ROUND`               | "next round", "final round", "onsite", "next stage"                                                                    | 0.85               |
| `OFFER`                    | "pleased to offer", "offer letter", "extend an offer"                                                                  | 0.90               |
| `RECRUITER_CONTACT`        | A personal sender at a company domain referencing a role, with no stronger signal                                      | 0.70               |

Conflict handling:

- **Rejection wins over warm language.** "We enjoyed speaking with you, but unfortunately…" is a rejection. Rejection phrases take precedence over positive phrases.
- **Offer phrases need offer context.** "We offer competitive benefits" in a job description is not an offer.
- **Ambiguity lowers confidence.** If two incompatible classifications both have strong evidence, such as interview and rejection phrases together, confidence is lowered so the message goes to the LLM or to review.
- **Hypotheticals don't count as progress.** Interview, assessment, next-round and offer phrases are ignored in sentences with "if", "should", "may", "once" and similar, so a confirmation that says "if your experience matches, we'll schedule an interview" stays a confirmation.
- **Confirmations from outside an ATS** score 0.93, short of automatic, since a company's own mail is less formulaic.
- **Below 0.95 continues.** Results below the automatic threshold are passed to the LLM (Phase 5) or, before then, become review items.

## Stage 5: LLM classifier

Used only when the rule classifier is not confident.

- **Input:** sender name, email and domain, subject, received date, and the truncated plain-text body. The user's other applications and personal data are not sent.
- **Output:** structured output validated with zod against:

  ```json
  {
    "isJobRelated": true,
    "eventType": "INTERVIEW_REQUEST",
    "companyName": "Example Corp",
    "jobTitle": "Software Engineer",
    "recruiterName": "Jane Doe",
    "recruiterEmail": "jane@example.com",
    "applicationStatus": "INTERVIEW",
    "interviewDate": null,
    "isFinalRound": false,
    "evidence": "We'd love to schedule a technical interview next week",
    "confidence": 0.86
  }
  ```

- **Evidence check:** `evidence` must be a verbatim quote that appears in the input. A quote that cannot be found reduces confidence, which guards against fabricated reasoning. The same quote is shown in the UI as "why".
- **Confidence cap:** model-reported confidence is capped below the automatic band (at most 0.94) unless the rule classifier independently agrees. LLM-only results are therefore always applied as flagged, or sent to review. Offers and rejections from the LLM alone always go to review.
- **Failure handling:** a validation failure gets one retry. After that, or on timeout or provider error, the email is stored as `FAILED` with an `error_code` and retried on the next sync. Nothing is guessed.
- **Prompt injection:** email content is untrusted. The model has no tools, can only produce the schema above, and its output is bounded by the confidence cap and the review rules. The worst case is a review item or a flagged, undoable update.
- **Cost controls:** a per-sync cap on LLM calls and a daily per-user cap. Results are cached by message ID, and messages are never classified twice.
- **Provider:** behind a small `LlmClassifier` interface. The provider and model are configured through environment variables.

## Stage 6: extraction

Extraction runs on every job-related email, combining rules and, when used, LLM fields:

- **Company:** the sender display name with ATS suffixes removed ("Datadog Hiring Team" becomes Datadog), subject patterns ("Thank you for applying to X"), and the sender domain when it is not an ATS domain.
- **Job title:** subject and body patterns ("for the Software Engineer position", "application for X at Y").
- **ATS job ID:** parsed from links to known job-board URL formats on Greenhouse, Lever and Ashby.
- **Recruiter:** name and email from a personal, non-ATS sender, which becomes a contact.
- **Interview time:** from calendar invitation parts or explicit dates, which becomes an interview record.

## Stage 7: matching

Matching uses the shared scorer described in [architecture.md](architecture.md#matching). Signals specific to email:

- **Thread continuity:** a message in a thread that already has a linked email scores +60 toward that application.
- **ATS sender domains are excluded** from company-domain matching. Company identity comes from the display name and content.
- **Several open applications at one company:** title similarity and negative title evidence decide. Close scores become a possible match rather than a guess.

## Stage 8: automation decision

The decision combines classification confidence, the match decision and the user's settings, using `decideAutomation` from [architecture.md](architecture.md#confidence-thresholds):

| Outcome                         | Result                                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTO_APPLY` / `APPLY_FLAGGED`  | Event created through the event processor. Email marked `MATCHED` and linked.                                                                                                 |
| `NEEDS_REVIEW` with a candidate | `EMAIL_POSSIBLE_MATCH` or `LOW_CONFIDENCE_UPDATE` review item. Email marked `NEEDS_REVIEW`.                                                                                   |
| No match                        | A confident application confirmation with an extracted company and title creates a new application with source EMAIL. Anything else becomes an `EMAIL_UNMATCHED` review item. |

Routing (`services/email-routing.ts`, shared by sync and the re-match pass) adds a few rules on top of the match score, learned from a real inbox:

- **One confirmation per application.** A confirmation pairs with a matching application that has none yet. If the match already has one, it's a second application to the same company.
- **Dates decide which application.** Progress (an assessment, an interview, an offer) dated after the matching application was rejected or withdrawn starts a new application; progress from before stays with it. A rejection dated before the match's latest progress ended an earlier application.
- **A company-only match counts** when it's the only application at that company. Otherwise it's asked about.
- **Confirmations, rejections and assessments** for jobs Trackr doesn't know start an application, unless they come from a school (`.edu`). The role is "Role not specified" until an email names it; matching treats that placeholder as unknown.
- **After each sync**, emails waiting for review are routed again, oldest first, since earlier messages may have created the application they belong to.

Each review item stores the event it would record, so the review card can say exactly what **Apply update** does. **Create application** starts one from the email's company and role (editable first). **Dismiss** marks the email `DISMISSED`. A personal sender is added as a recruiter contact when an update is applied.
| `NO_UPDATE` | Email marked `IGNORED`. |

Classifications map to event types in one function:

| Email classification       | Event type                          |
| -------------------------- | ----------------------------------- |
| `APPLICATION_CONFIRMATION` | `APPLICATION_CONFIRMATION_RECEIVED` |
| `ASSESSMENT`               | `ASSESSMENT_RECEIVED`               |
| `RECRUITER_CONTACT`        | `RECRUITER_CONTACT`                 |
| `INTERVIEW_REQUEST`        | `INTERVIEW_REQUESTED`               |
| `INTERVIEW_CONFIRMATION`   | `INTERVIEW_SCHEDULED`               |
| `INTERVIEW_RESCHEDULE`     | `INTERVIEW_RESCHEDULED`             |
| `NEXT_ROUND`               | `NEXT_ROUND`                        |
| `OFFER`                    | `OFFER_RECEIVED`                    |
| `REJECTION`                | `REJECTION_RECEIVED`                |
| `WITHDRAWAL`               | `APPLICATION_WITHDRAWN`             |
| `UNKNOWN`                  | none: review or ignore              |

## Measuring accuracy (Phase 5)

Rules tuned against a corpus written alongside them can't prove anything; the first real inbox showed that. Phase 5 measures the pipeline on real email before and after adding the LLM fallback.

**M30: labeling and the baseline.**

- A local-only labeling tool lists the user's job-related messages with Trackr's current reading (relevance, classification, company, role) and lets the person confirm or correct each field.
- Labels and message content stay on the machine, in a gitignored directory. Real email is never committed; the repository keeps only the fictional corpus and published numbers.
- A benchmark script replays the labeled set through the pipeline and reports, per field: exact-match accuracy, precision and recall per classification, and how many messages fell below the automatic threshold. The rules alone are the baseline.

**M31: the LLM fallback.**

- Only messages the rules leave uncertain go to the model (Stage 5 above), with the schema, evidence check and confidence caps described there.
- The benchmark runs again with the fallback on. The model is chosen by the numbers: a smaller model wins if its accuracy is close, since cost scales with volume.
- The README publishes the before-and-after accuracy per field, the share of messages that needed the model, and cost and latency per thousand messages.
- Demo workspaces never call the model; their inbox is simulated. Real accounts have per-sync and daily caps.

## Stored data

Per relevant email Trackr keeps the Gmail message and thread IDs, sender name, email and domain, subject, received time, Gmail's snippet, the classification with confidence and method, the extracted fields, the match score and the processing status. The email preview in the application timeline is built from these fields. Gmail's own message link can open the full message in Gmail.

## Logging

One structured log line per processed message, with allowlisted fields only:

```
event: gmail_message_processed
messageId, stage, relevant, classification, confidence, method,
matchDecision, applicationId, reviewItemId, durationMs, errorCode
```

Subjects, snippets, bodies, addresses and tokens are never logged.

## Testing

- **Fixture corpus.** Anonymized real-world messages under `tests/fixtures/emails`, each labeled with expected relevance, classification, extracted fields and match target.
- **Unit tests.** Relevance scoring, every rule (including the ambiguous cases above), extraction patterns, classification-to-event mapping and automation decisions.
- **Integration tests (PGlite).** A confirmation email matches an extension-created application, an interview email updates the status, a rejection updates the status, a late confirmation does not regress Interview to Applied, and re-syncing creates no duplicates.
- **Quality report.** `pnpm --filter @trackr/domain email:report` prints relevance accuracy and precision and recall per classification over the corpus, so changes to rules or prompts can be measured. The corpus lives in `packages/domain/src/email/email.fixtures.ts`: 32 messages written to match real ATS, recruiter and job-board mail, with fictional companies and people. It was written alongside the rules, so it is a regression baseline rather than an accuracy estimate; real messages that fool the rules should be added to it.
