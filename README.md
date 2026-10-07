# Trackr

Trackr is an automatic job application tracker. Connect your browser and inbox once, and your job search organizes itself: applications are captured when you submit them, recruiting emails are classified and matched to the right application, and statuses update with a full, explainable history.

> **Status:** early development (Phase 1, Foundation). See the [delivery phases](docs/product-spec.md#17-delivery-phases).

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
- **Integrations:** Chrome extension (Manifest V3), Gmail API
- **Tooling:** pnpm workspaces, ESLint, Prettier, Vitest

## Repository layout

```
apps/
  web/          Next.js application (UI, server actions, API routes, services)
packages/       Shared, framework-free packages (added as needed)
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

## Scripts

| Command                                  | Description                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                               | Start the web app in development mode                                  |
| `pnpm build`                             | Build all workspace packages                                           |
| `pnpm lint`                              | Lint all workspace packages                                            |
| `pnpm typecheck`                         | Type-check all workspace packages                                      |
| `pnpm test`                              | Run all test suites                                                    |
| `pnpm db:migrate`                        | Apply database migrations to `DATABASE_URL`                            |
| `pnpm db:seed --email <email> [--reset]` | Add demo applications to an account (`--reset` replaces existing ones) |
| `pnpm format`                            | Format the repository with Prettier                                    |
| `pnpm check`                             | Run formatting check, lint, typecheck and tests                        |
