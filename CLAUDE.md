# Fluid-calendar

Use the open source project to host on this computer my calendar that I will use has a PWA. You can use similar strategy as for sync notes on this computer if not handle by open-source project. I will use it from my phone and computer on other networks. 

Guidance for Claude Code when working in this repository.

## Project

**FluidCalendar** — open-source, self-hostable intelligent calendar with auto-scheduling, task management, and CalDAV/Google/Outlook sync. Goal: a self-hosted alternative to Motion.

⚠️ **The upstream README explicitly states the project is in active development and currently buggy.** Treat this as a moving target: prefer narrow, well-scoped changes; always run lint, typecheck, and tests after edits; flag anything that looks half-finished rather than guessing at intent.

Repo: https://github.com/dotnetfactory/fluid-calendar — License: MIT

## Tech Stack

- **Framework:** Next.js 15 (App Router) with Turbopack dev server
- **Language:** TypeScript (~98% of codebase)
- **Database:** PostgreSQL via **Prisma** ORM
- **Auth:** NextAuth.js (`@auth/core`)
- **Calendar UI:** FullCalendar
- **Styling:** Tailwind CSS + shadcn/ui (see `components.json`)
- **Testing:** Jest (unit) + Playwright (e2e)
- **Tooling:** ESLint, Prettier, Husky, lint-staged
- **Container:** Docker + Docker Compose (Postgres bundled)
- **Node version:** see `.nvmrc` — use `nvm use` before working

## Repository Layout

```
src/                  # Application code
  app/                # Next.js App Router (pages, API routes, layouts)
  components/         # React components (shadcn/ui-based)
  lib/
    scheduler/        # Core auto-scheduling engine — CRITICAL, edit carefully
  saas/               # SAAS-only code, gated by ENABLE_SAAS_FEATURES flag
prisma/
  schema.prisma       # Single source of truth for the data model
  migrations/         # Generated migrations — do not hand-edit applied ones
public/               # Static assets, PWA manifest, service worker assets
scripts/              # Maintenance / sync scripts (e.g. sync-repos.sh)
tests/                # Test suites
docker/
  production/         # Production Docker assets
  development/        # Dev compose stack (used by `npm run docker:dev`)
docs/                 # Project documentation
```

Top-level config worth knowing: `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `tsconfig.worker.json` (background workers have separate TS config), `playwright.config.ts`, `jest.config.js`, `eslint.config.mjs`, `.prettierrc`.

## Common Commands

Run from repo root. Use `npm` (project ships `package-lock.json`).

```bash
# First-time setup: install deps, generate Prisma client, run migrations
npm run setup

# Dev server (Turbopack) on http://localhost:3000
npm run dev

# Production build / start
npm run build
npm run start

# Lint
npm run lint

# Tests
npm run test:unit        # Jest
npm run test:e2e         # Playwright

# Prisma
npm run prisma:generate  # regenerate client after schema.prisma changes
npm run prisma:migrate   # create + apply a new dev migration
npm run prisma:studio    # GUI on the database

# Docker dev stack (Postgres + app)
npm run docker:dev
npm run docker:dev:build
npm run docker:dev:down
npm run docker:logs
npm run docker:clean     # full reset incl. volumes — DESTROYS DATA

# Nuke build artefacts and node_modules
npm run clean
```

## Database Workflow

1. Edit `prisma/schema.prisma`.
2. Run `npm run prisma:migrate` — Prisma will prompt for a migration name and apply it to the local dev DB.
3. Run `npm run prisma:generate` if the client wasn't auto-regenerated.
4. Update any seed data or affected types in `src/`.
5. **Never** edit a migration file that has already been applied/committed; create a follow-up migration instead.

For inspecting data locally, `npm run prisma:studio` opens a browser GUI.

## Environment

- Copy `.env.example` → `.env`. Required at minimum: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
- Google / Outlook OAuth credentials can be set via env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`) **or** through the in-app Settings → System UI (the UI takes precedence; env is fallback).
- For self-hosted-only work, ignore `ENABLE_SAAS_FEATURES` — leave it unset.

## Conventions for Edits

- **TypeScript strict.** Don't introduce `any` to silence errors; reach for `unknown` + narrowing or fix the type properly.
- **App Router patterns.** Server Components by default; mark Client Components with `"use client"` only when needed (state, effects, browser APIs, FullCalendar interactions).
- **API routes** live under `src/app/api/.../route.ts`.
- **shadcn/ui components** are vendored under `src/components/ui/`. Add new ones via the shadcn CLI rather than hand-rolling, so `components.json` stays consistent.
- **SAAS code stays in `src/saas/`** and must be feature-flagged. Keep the open-source build working without `ENABLE_SAAS_FEATURES`.
- **Scheduler logic** in `src/lib/scheduler/` is the project's core IP — changes there need accompanying unit tests in `tests/`.
- **PWA assets** (`public/manifest.json`, service worker, icons) — coordinate any change with `next.config.ts` since Next handles SW generation.

## Before Considering a Task Done

1. `npm run lint` — passes.
2. `npx tsc --noEmit` — passes (no `npm run typecheck` script exists; run `tsc` directly).
3. `npm run test:unit` — passes; add tests for new logic, especially in `src/lib/scheduler/`.
4. `npm run build` — succeeds (catches App Router/RSC mistakes that `dev` hides).
5. If the change touches Prisma schema, the API surface, or a user flow, add/update a Playwright test under `tests/` and run `npm run test:e2e` against a fresh Docker stack.

## Things to Leave Alone Unless Asked

- `prisma/migrations/*` already applied on `main`.
- `package-lock.json` — let npm regenerate it; don't hand-edit.
- `.husky/` hooks.
- Generated Prisma client output.
- `scripts/sync-repos.sh` — used to sync OSS ↔ private SAAS repo, irrelevant for self-host work.

## Helpful Context Files

- `README.md` — install and OAuth provider setup (Google + Microsoft) walkthroughs.
- `CHANGELOG.md` — recent feature/bugfix history.
- `TODO.md` and `@TODO.md` — open work the maintainer has flagged.
- `.cursor/rules/` and `main-rule.mdc` — existing AI-assistant rules from the maintainer; worth a glance for any local conventions not captured here.
