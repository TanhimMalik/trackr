# Trackr — Product Specification

Trackr is an automatic job application tracker. Its defining feature is that users should need to maintain their job-search pipeline by hand as little as possible.

> Connect your browser and inbox once, then let your job search organize itself.

This document describes what Trackr does and why. How it is built is covered in [architecture.md](architecture.md), the data model in [database.md](database.md), email ingestion in [email-pipeline.md](email-pipeline.md), the browser extension in [browser-extension.md](browser-extension.md), and the visual language in [design-system.md](design-system.md).

## 1. Vision

Most job trackers are spreadsheets with a nicer interface: the user types in every company and drags every card. Trackr inverts that. Applications are captured when they are submitted, recruiting emails are recognized and linked to the right application, and statuses update themselves, with a visible explanation for every automatic change. Manual editing exists as a fallback, not as the primary workflow.

Opening the dashboard should immediately answer:

- What jobs have I applied to, and when?
- Which companies have responded, and how long do they usually take?
- Which applications have assessments, interviews, offers or rejections?
- Which resume did I submit?
- Which applications have had no response in two weeks or more?
- Which job sources give me the best response rate?
- What percentage of my applications turn into interviews?

## 2. Primary user flow

```
User finds a job and applies on Greenhouse, Lever, Ashby or a company site
        ↓
Browser extension detects the successful submission
        ↓
Application appears in the dashboard automatically
        ↓
Confirmation email arrives → linked to the existing application, no duplicate
        ↓
Recruiter sends an interview invitation → detected and classified
        ↓
Status changes Applied → Interview, and the interview appears in the timeline
        ↓
Rejection, offer or next round arrives → status updates again
```

The dashboard becomes an automatically maintained history of the job search.

## 3. Product principles

| Principle         | What it means                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automation first  | Capture and status changes happen without user effort. Manual entry is the fallback.                                                                                                    |
| Trust             | Every automatic change shows what happened, where it came from and how confident the system was, and can be undone. Users should never feel their data is changing without explanation. |
| Low friction      | One click beats a form. The extension popup beats opening the dashboard.                                                                                                                |
| Speed and clarity | Dense, fast and legible. The state of the search is understandable at a glance.                                                                                                         |
| Privacy           | Store application-related metadata, never a copy of the inbox.                                                                                                                          |

## 4. Core concepts

### Application

A job the user has saved or applied to: company, role, job URL, location, employment type, salary range, where the job was found (source), where it was submitted (platform), the resume used, notes, and a current status.

### Event

Something that happened to an application: submitted, confirmation received, assessment received, recruiter contact, interview requested, scheduled or rescheduled, next round, offer, rejection, withdrawal, follow-up sent, or a manual status change. Events are stored permanently and form the application's timeline. Each event records its source (browser extension, email, manual or system), when it happened, and for automatic events, how it was detected and with what confidence.

### Status

A small, normalized set derived from events:

| Status           | Meaning                                 |
| ---------------- | --------------------------------------- |
| SAVED            | Interested, not yet applied             |
| APPLIED          | Submitted and waiting                   |
| ASSESSMENT       | Coding challenge or assessment received |
| RECRUITER_SCREEN | In conversation with a recruiter        |
| INTERVIEW        | Interviewing                            |
| FINAL_ROUND      | Final round or onsite                   |
| OFFER            | Offer received                          |
| REJECTED         | Rejected                                |
| WITHDRAWN        | Withdrawn by the user                   |
| UNKNOWN          | Not enough information to place it      |

Finer distinctions, such as technical versus hiring-manager versus onsite interviews, live in events and interview records rather than in additional statuses.

### Source and platform

- **Source** is where the job was found: LinkedIn, Indeed, company website, referral, Handshake or other. It drives source analytics.
- **Platform** is where the application was submitted or hosted: Greenhouse, Lever, Ashby, Workday, iCIMS, LinkedIn, Indeed, company site or other.

## 5. Status rules

Statuses move forward through the pipeline automatically and never regress because of late or out-of-order information.

- Applied plus an assessment becomes Assessment. Applied or Assessment plus an interview request becomes Interview. Interview plus a next round becomes Interview or Final round.
- Any active status plus a rejection becomes Rejected. Any active status plus an offer becomes Offer.
- An old "application received" email processed after an interview invitation does not move Interview back to Applied. Events are evaluated in the order they happened, not the order they arrived.
- Offer, Rejected and Withdrawn are final for automation. Later automatic events still appear in the timeline but do not change the status. The user can always change the status manually.
- Every manual change is recorded as an event.

## 6. Automatic capture

### 6.1 Browser extension

The extension initially supports Greenhouse, Lever and Ashby. Workday follows later.

While the user fills out an application, the extension keeps temporary job context: company, job title, job URL, platform, and location and job description when available. When the page reaches a confirmation state such as "Thank you for applying", "Application submitted" or "We've received your application", the extension reports the submission and the application appears in the dashboard.

Automatic detection will never be perfect, so the extension popup shows the detected company, role and URL, pre-filled and editable, with a one-click **Track application** button.

The extension connects to the user's account through a short browser-based authorization flow. It never stores a password or a permanent credential.

### 6.2 Gmail

Gmail is connected from **Integrations**, independently of how the user signs in to Trackr. The integration states exactly what it does:

> **Gmail** — automatically detect application confirmations, assessments, recruiter messages, interview invitations, offers and rejections.

Controls: connect, disconnect, sync now, last synced time, and connection status, including "reconnect needed".

Processing is staged. A cheap relevance filter discards email that is not about a job search, deterministic rules classify most job email, and a language model is used only for messages the rules cannot classify confidently. Classifications are structured and validated; raw model output is never trusted.

The privacy statement shown to users:

> Email content is processed to identify job application updates. Trackr stores application-related metadata (sender, subject, date, a short snippet and the detected update) rather than a copy of your inbox.

## 7. Confidence and review

Every automated classification carries a confidence score. Default behavior, configurable in settings:

| Confidence  | Behavior                                            |
| ----------- | --------------------------------------------------- |
| 0.95 – 1.00 | Apply automatically                                 |
| 0.75 – 0.94 | Apply, clearly marked as auto-classified, with undo |
| 0.50 – 0.74 | Ask the user to confirm                             |
| below 0.50  | Do not update                                       |

When Trackr is unsure, it asks:

```
We think this email is related to:
Stripe — Software Engineer

Possible update: Applied → Interview
[Confirm]  [Ignore]
```

Rejections and offers inferred only by the language model always require confirmation.

## 8. Matching and duplicates

The same application is often detected twice: by the extension on submission, and by the confirmation email minutes later. These must resolve to one application with two events, never two applications.

Matching compares the normalized company name, company domain, job title (exact and similar), ATS job ID, job URL, email thread, application date proximity and recruiter domain, and produces a score:

| Score    | Outcome                                                                 |
| -------- | ----------------------------------------------------------------------- |
| 80+      | Automatic match                                                         |
| 50 – 79  | Possible match, which the user confirms                                 |
| below 50 | Unmatched: the user can link it, create a new application, or ignore it |

If two applications at the same company match equally well, Trackr asks rather than guesses. When the extension reports a submission that may duplicate an existing application, the application is created and a review item offers **Merge** or **Keep both**.

## 9. Product surfaces

The layout has persistent left navigation (Overview, Applications, Activity, Analytics, Resumes, Integrations, Settings) and a header with global search (⌘K), notifications and the user menu. Visual priority, in order: applications, automation activity, timeline and history, analytics.

### Overview

- Greeting and today's date.
- Summary metrics for applications, interviews, response rate and offers, each with the change against the previous period and a small trend line.
- The applications board or table, with **Add application**.
- A recent automation feed of automatic updates ("Ramp moved Applied → Interview · 14 min ago") and items that need review ("Vercel application may be a duplicate · Review").
- An application funnel for a selectable period: applications → responses → interviews → offers.
- Integration status for Gmail and the Chrome extension.

### Applications

**Board.** Columns for Applied, Assessment, Interview, Offer and Closed (rejected or withdrawn), plus an optional Saved column. Cards show the company, role, applied date and the latest signal, such as "Gmail detected", "Assessment received" or "Interview scheduled". Dragging a card changes its status and records a manual event.

**Table.** Search by company or role. Filter by status, company, date applied, source, job title, location and response status. Sort by newest, oldest, recently updated, company or status.

### Application detail

Opens in a large right-side drawer from the board or table, with a dedicated page for direct links. It shows the company, role and status; the facts (applied date, source, location, salary, job URL, resume used); the timeline built from events; contacts; interviews; and related emails.

For updates that came from email, the user can see why they happened:

```
Email
From: Jane Doe
Subject: Next steps for Software Engineer
Detected: Interview requested
Confidence: 96%
```

Full email bodies are not copied into Trackr.

### Activity

A chronological log of everything that happened across all applications, grouped by day in the viewer's time zone and filterable by source (all, automatic, manual). Each entry opens its application and can be undone or restored. A **Needs review** tab for possible matches, unmatched emails, medium-confidence updates and possible duplicates arrives with the email pipeline.

### Analytics

Applications this week and this month, response rate, interview rate, offer rate, rejection rate, average time to response, applications by source and by role, and the funnel. Source analytics show applications, interviews and interview rate per source.

### Resumes

Resume versions with name and file, the resume used for each application, and later, performance per resume (applications, interviews, interview rate).

### Integrations

Gmail and the Chrome extension: status, what each one does, connect and disconnect, and last sync.

### Settings

- **Account.**
- **Automation:** automatically update high-confidence statuses, ask before medium-confidence updates, follow-up reminders, store job descriptions, automatically track supported job sites, and confidence thresholds.
- **Privacy:** disconnect Gmail, delete imported email metadata.
- **Data:** export application data, delete all applications, delete account.

### Notifications

An in-app notification center whose entries link straight to the application: "Figma moved to Interview", "Datadog sent you an assessment", "Stripe hasn't responded in 14 days", "Google application marked Rejected".

### Search

A ⌘K command palette to find applications by company or role, jump to any page, and add an application.

## 10. Follow-up reminders

- Applied with no activity for 14 days or more: "No response for 16 days. Consider following up."
- An interview completed with no response for 5 days or more: "Interview completed 5 days ago. Consider sending a follow-up."

Trackr never sends email on the user's behalf.

## 11. Analytics definitions

- A **response** is any company-originated event after applying, other than the automatic confirmation: an assessment, recruiter contact, interview, next round, offer or rejection.
- **Response rate** = applications with a response ÷ total applications.
- **Interview rate** = applications that reached an interview stage ÷ total applications.
- **Offer rate** = applications with an offer ÷ total applications.
- **Rejection rate** = rejected applications ÷ total applications.
- **Average time to response** = mean time from applying to the first response.
- "Reached an interview stage" is based on event history, so an application rejected after interviewing still counts.
- A manual status change that the person later takes back (moving the card back a stage, or reopening a closed application) is treated as a correction and doesn't count as a response or a stage reached. Company responses detected from email always count.
- Funnel periods are cohort-based: they describe applications submitted within the selected period. The funnel's "All time" view matches the summary metrics.
- **Summary metrics** on the Overview show all-time totals. Beside each one, the change compares the last 30 days with the 30 days before: applications sent, applications that first reached an interview stage, and offers received, in percent; the response rate now against 30 days ago, in percentage points. Trend lines show the last 12 weeks: weekly counts, or the response rate at the end of each week.

## 12. Privacy and security requirements

- OAuth refresh tokens are encrypted at rest and never exposed to frontend JavaScript.
- Every API validates authentication. The extension API requires an extension token and never allows anonymous application creation.
- Only minimal email data is stored: message and thread IDs, sender, subject, timestamp, a short snippet and the parsed result. Full bodies are processed in memory only.
- User-provided HTML, such as captured job descriptions, is sanitized.
- CSRF protection applies wherever cookies authenticate requests. Ingestion endpoints are rate limited. All language-model output is validated.
- Logs never contain OAuth tokens, email bodies, passwords or other sensitive authentication data.
- Secrets come from environment variables, documented in `.env.example`.
- Users can disconnect Gmail, delete imported email metadata, delete all applications, export their data and delete their account.

## 13. Error handling

Every external integration fails gracefully and visibly: expired or revoked Gmail access, an unavailable language model, an unavailable database, an extension that cannot identify a job, duplicate events and unmatched emails. Failed processing is recorded and then retried or surfaced to the user, never silently discarded.

## 14. Demo data

Around 20 realistic applications spread across Applied, Assessment, Interview, Offer and Rejected, with event histories, so the product looks complete before any integration is connected.

## 15. MVP acceptance criteria

The MVP is complete when this flow works end to end:

1. The user creates an account.
2. The user installs and connects the browser extension.
3. The user applies to a supported Greenhouse job.
4. The extension detects the submission.
5. The job appears in the dashboard automatically.
6. The Gmail integration detects the confirmation email.
7. The confirmation matches the existing application instead of creating a duplicate.
8. An interview email arrives later.
9. It is classified correctly.
10. The application changes from Applied to Interview automatically.
11. The timeline shows the application submitted, the confirmation received and the interview requested.
12. Dashboard analytics update.
13. The user can correct the status manually if the classification was wrong.

## 16. Scope

### Not in the initial product

Automatic job applications, form filling, mass-application tools, resume and cover letter generation, job scraping, job recommendations, Outlook, mobile apps, social features, Firefox and Safari extensions, career coaching, salary negotiation tools, billing, and team or enterprise features.

### Future possibilities

Outlook and calendar integration, an interview calendar, resume performance comparison, job-description analysis, skill-gap analytics, recruiter relationship tracking, follow-up email drafts, interview preparation, job discovery, salary analytics, a mobile app, CSV import and export, LinkedIn saved-job import and browser autofill.

## 17. Delivery phases

| Phase                    | Scope                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation            | Accounts, application model with event log, manual create and edit, board, table, detail drawer, Overview, search, demo data |
| 2. Events                | Timeline, undo, contacts and interviews, notifications, follow-up reminders, Activity                                        |
| 3. Browser extension     | Greenhouse, Lever and Ashby capture, popup fallback, extension authorization, duplicate review                               |
| 4. Gmail                 | Connection, sync now, relevance filtering, rule classification, email metadata                                               |
| 5. Matching and review   | Email-to-application matching, review queue, automatic status updates. Completes the MVP acceptance flow.                    |
| 6. LLM fallback          | Structured classification of ambiguous email                                                                                 |
| 7. Automation controls   | Configurable thresholds, auto-classified marking, undo everywhere, privacy and data controls                                 |
| 8. Analytics and resumes | Analytics page, source analytics, resume library and performance                                                             |
| 9. Polish                | Responsive and accessibility pass, empty, loading and error states, deployment, documentation                                |
