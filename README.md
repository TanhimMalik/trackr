# Trackr

Trackr is an automatic job application tracker. Connect your browser and inbox once, and your job search organizes itself: applications are captured when you submit them, recruiting emails are classified and matched to the right application, and statuses update with a full, explainable history.

**Live demo:** [trackr-coral-gamma.vercel.app/demo](https://trackr-coral-gamma.vercel.app/demo) opens a private workspace with sample data. No sign-up needed.

> **Status:** Complete for its planned scope: the tracker with an event history, the browser extension, Gmail sync with a measured Claude fallback, automation and privacy controls, and a daily scheduled sync. See the [delivery phases](docs/product-spec.md#17-delivery-phases) and [how it was built](#how-it-was-built).

## Documentation

| Document                                       | Contents                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| [Product specification](docs/product-spec.md)  | What Trackr does and why: flows, statuses, surfaces, acceptance criteria |
| [Architecture](docs/architecture.md)           | System design, layering, event processing, matching, security, testing   |
| [Database](docs/database.md)                   | Schema, enums, constraints, migrations and retention                     |
| [Email pipeline](docs/email-pipeline.md)       | Gmail sync, relevance filtering, classification and automation decisions |
| [Browser extension](docs/browser-extension.md) | Extension architecture, platform detectors, authentication and API       |
| [Design system](docs/design-system.md)         | Visual language, layout, components and accessibility                    |

## Tech stack

- **Web:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Data:** PostgreSQL (Supabase) with Drizzle ORM
- **Auth:** Supabase Auth
- **Integrations:** Chrome extension (Manifest V3, esbuild), Gmail API, Claude API (Haiku 5.5)
- **Hosting:** Vercel (with Vercel Cron), Supabase
- **Tooling:** pnpm workspaces, ESLint, Prettier, Vitest with PGlite, Playwright with axe

## Repository layout

```
apps/
  web/          Next.js application (UI, server actions, API routes, services)
  extension/    Chrome extension (Manifest V3) that records applications as you submit them
packages/
  domain/       Shared, framework-free domain logic: statuses, events, matching, schemas
docs/           Product and engineering documentation
```

## Getting started

### Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm, via Corepack: `corepack enable pnpm`
- A [Supabase](https://supabase.com) project (the free tier is enough) for Postgres and authentication

### Supabase

1. Create a project. Under **Security**, turn off **Enable Data API**, because Trackr reads and writes data only through its own server, and turn on **Enable automatic RLS**.
2. Under **Authentication → URL Configuration**, set the site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback**` to the redirect URLs (the wildcard allows the `?next=` destination).
3. Under **Authentication → Sign In / Providers**, keep email sign-ups enabled. Turning off **Confirm email** is convenient during development.
4. On the same page, turn on **Allow anonymous sign-ins**. The "Try the demo" button uses them to open a private workspace without an account.

### Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in the values
pnpm db:migrate
pnpm dev
```

The app runs at http://localhost:3000. The landing page there has **Try the live demo**, and http://localhost:3000/demo opens a demo directly. After signing up, you can also fill your own account with realistic demo data:

```bash
pnpm db:seed --email you@example.com
```

| Variable                               | Where to find it                                                            |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | `http://localhost:3000` locally                                             |
| `NEXT_PUBLIC_SUPABASE_URL`             | Project Settings → API                                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API keys (publishable key)                               |
| `DATABASE_URL`                         | Project Settings → Database → Connection string (session pooler, port 5432) |

## Browser extension

The extension adds applications as you submit them on Greenhouse, Lever and Ashby, and can track a job from any page through its popup.

```bash
pnpm --filter @trackr/extension build
```

Then open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select `apps/extension/dist`. Open the extension's popup and choose **Connect account**. Use `pnpm --filter @trackr/extension dev` to build against a local server on port 3000 instead. See [docs/browser-extension.md](docs/browser-extension.md).

## Connecting Gmail

Gmail is optional: without credentials, Integrations shows it as not set up. To enable it:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, then enable the **Gmail API** (APIs & Services → Library). Without it, connecting succeeds but every Gmail request fails with `accessNotConfigured`.
2. Configure the **OAuth consent screen** (Google Auth Platform): External, app name and support email. Under **Audience → Test users**, add every Google account that will connect, including your own; others are blocked with `403 access_denied`. Leave the app in testing.
3. Under **Data access**, add the scopes `openid`, `email` and `https://www.googleapis.com/auth/gmail.readonly`.
4. Create an **OAuth client ID** (Credentials → Create credentials) of type **Web application**, with these authorized redirect URIs:
   - `http://localhost:3000/api/integrations/gmail/callback`
   - `https://<your-deployment>/api/integrations/gmail/callback`
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) in `apps/web/.env.local` and in the deployment's environment variables.

To sync every day without pressing **Sync now**, set `CRON_SECRET` (`openssl rand -hex 32`) in the deployment's environment variables. `apps/web/vercel.json` schedules `/api/cron/gmail-sync` daily at 12:00 UTC (the free plan allows one run a day); it reads new mail for every connected account, least recently synced first, within the function's time limit.

Optionally, set `ANTHROPIC_API_KEY` too (Anthropic Console → API Keys, scoped to a workspace, with a monthly spend limit). Emails the rules can't settle then go to Claude Haiku 5.5; without it, sync runs on rules alone.

While the app is in testing, Google lets only the listed test users connect and ends access every 7 days; Trackr then asks to reconnect. `gmail.readonly` is a restricted scope, so opening Gmail to everyone requires Google's verification and a security assessment.

## Deploying to Vercel

The web app deploys to Vercel's free plan from this repository; no custom domain is needed.

1. **Import the repository** in Vercel (Add New → Project) and set **Root Directory** to `apps/web`. Vercel detects Next.js and the pnpm workspace.
2. **Environment variables** (Production and Preview):

   | Variable                               | Value                                                                                             |
   | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_APP_URL`                  | The deployment's address, e.g. `https://trackr-yourname.vercel.app`                               |
   | `NEXT_PUBLIC_SUPABASE_URL`             | As in development                                                                                 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | As in development                                                                                 |
   | `DATABASE_URL`                         | Supabase's **transaction pooler** connection string (port 6543), which suits serverless functions |
   | `ENABLE_EXPERIMENTAL_COREPACK`         | `1`, so Vercel installs the pnpm version pinned in `package.json`                                 |

3. **Supabase**, under Authentication → URL Configuration: set the site URL to the deployment's address and add `https://<deployment>/auth/callback**` to the redirect URLs, keeping the `localhost` entry for development. Keep anonymous sign-ins on for the demo.
4. **Migrations** run from your machine against the same database: `pnpm db:migrate`.
5. Optionally, under Settings → Functions, pick the region closest to your Supabase project.

Share `https://<deployment>/demo` to open a demo workspace in one click.

## How it was built

**Specification first.** Before any code, the [product spec](docs/product-spec.md), [architecture](docs/architecture.md), [database](docs/database.md), [email pipeline](docs/email-pipeline.md) and [extension](docs/browser-extension.md) documents set the model: every change to an application is an append-only event, and its status is derived from them. That one decision is what makes automatic updates explainable and undoable.

**Small milestones, each shippable.** The work ran as 34 milestones in 8 phases: foundation, events and history, the extension, Gmail, measured classification, controls and privacy, polish, and wrap-up. Each milestone ended with tests, type checks and lint passing and, from the first deploy on, went to production. A public demo came early, so the product could be tried at every stage without an account.

**Rules first, then a model where measurements showed a gap.** Email is classified by deterministic rules, which are cheap, fast and testable. The language model was added only after a labeled benchmark of a real inbox showed where the rules fell short, and it only sees what the rules can't settle. Its answers are capped below the automatic threshold, its quoted evidence must appear in the email, and offers and rejections it finds alone always wait for the person.

**A real inbox changed the design.** The first sync of a real inbox found 11 applications; after the fixes, the same 90 days produced 65. What it taught, now in [the routing rules](docs/email-pipeline.md#stage-8-automation-decision):

- Patterns that only matched when the subject was the whole message, and confirmations that scored just under the bar to create an application.
- Reading newest first meant rejections arrived before the applications they closed, so sync now reads oldest first and looks again at unresolved email after each run.
- Each application gets one confirmation, and dates decide which application an email belongs to: an assessment after a rejection is a new application, not a reopened one.
- Hiring platforms' names (SHL, Workable) are not companies, and job-board recommendations, card "offers" and school admissions are not job news.

**Tested at every level.** Pure domain logic has unit tests (327). Services run against an in-memory Postgres (PGlite) in integration tests (399), including Gmail sync against a fake Gmail and the model fallback against a fake model. Six Playwright tests drive the demo in a real browser and scan each page with axe. The email benchmark measures the classifier on real, hand-labeled email that never leaves the machine.

**Known limits.**

- Gmail access runs in Google's testing mode: listed test users only, and access ends every 7 days. Opening it up needs Google's verification and a security assessment.
- Sync is pull-based, in bounded batches, on a button and a daily schedule; there is no background queue or push notifications from Gmail.
- The accuracy numbers come from one person's inbox, without interviews or offers in it.
- The extension installs from the repository rather than the Chrome Web Store.

## Email classification accuracy

Measured on one real inbox, labeled by hand: 202 messages, split by message id into a half for tuning and a held-out half for measuring. These are the held-out 103. Details and caveats in [the email pipeline doc](docs/email-pipeline.md#measuring-accuracy-phase-5).

| Measure                          | Rules (first version) | Rules (now) | Rules + Claude Haiku 5.5 |
| -------------------------------- | --------------------- | ----------- | ------------------------ |
| Of what it reads, job email      | 41%                   | 78%         | 92%                      |
| Job email it reads               | 100%                  | 92%         | 92%                      |
| Classified correctly (job email) | 89.5%                 | 92.1%       | 92.1%                    |
| Confident wrong updates          | 4                     | 2           | 2                        |
| Model calls / cost per call      | –                     | –           | 10 of 103 / $0.0003      |

Claude only sees the emails the rules can't settle, never anything else about the user, and its answers are capped: rejections and offers it finds on its own always wait for the person to confirm.

## Scripts

| Command                                    | Description                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`                                 | Start the web app in development mode                                         |
| `pnpm build`                               | Build all workspace packages                                                  |
| `pnpm lint`                                | Lint all workspace packages                                                   |
| `pnpm typecheck`                           | Type-check all workspace packages                                             |
| `pnpm test`                                | Run all test suites                                                           |
| `pnpm db:migrate`                          | Apply database migrations to `DATABASE_URL`                                   |
| `pnpm db:seed --email <email> [--reset]`   | Add demo applications to an account (`--reset` replaces existing ones)        |
| `pnpm benchmark:export --email <email>`    | Copy an account's synced Gmail into `.benchmark/` (local, gitignored)         |
| `pnpm benchmark:label`                     | Label the exported emails at http://127.0.0.1:4100                            |
| `pnpm benchmark:run [--classifier hybrid]` | Score the email classifier (rules, or rules + Claude) against labels          |
| `pnpm format`                              | Format the repository with Prettier                                           |
| `pnpm check`                               | Run formatting check, lint, typecheck and tests                               |
| `pnpm --filter @trackr/web test:e2e`       | Playwright tests of the demo in local Chrome (build first; uses `.env.local`) |
