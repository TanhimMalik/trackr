# Trackr

Trackr is an automatic job application tracker. Connect your browser and inbox once, and your job search organizes itself: applications are captured when you submit them, recruiting emails are classified and matched to the right application, and statuses update with a full, explainable history.

> **Status:** early development. See the roadmap in `docs/` as it lands.

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
