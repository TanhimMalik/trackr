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

### Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

The app runs at http://localhost:3000.

## Scripts

| Command          | Description                                     |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | Start the web app in development mode           |
| `pnpm build`     | Build all workspace packages                    |
| `pnpm lint`      | Lint all workspace packages                     |
| `pnpm typecheck` | Type-check all workspace packages               |
| `pnpm test`      | Run all test suites                             |
| `pnpm format`    | Format the repository with Prettier             |
| `pnpm check`     | Run formatting check, lint, typecheck and tests |
