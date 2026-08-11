# Learn AI

A daily AI-literacy product for Australian professionals. One production run per publishing
day produces a brief — one news item, one practical technique, one five-minute video — which
fans out to the website, a PWA, email, social, and a video library that later becomes course
material. Members are grouped automatically into organisation cohorts by email domain, and
every piece of content passes through a human review gate before it reaches an audience.

## Local setup

```
git clone https://github.com/xempie/learnai.git
cd learnai
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` serves `apps/web` at http://localhost:3000.

Requires Node 22+ (via `corepack`, which reads the `packageManager` field). No database is
required yet — schema and migrations land in T02.

## Scripts

Run from the repo root; each fans out across all workspaces (`apps/*`, `packages/*`).

| Script               | Purpose                                 |
| -------------------- | --------------------------------------- |
| `pnpm dev`           | Start the `web` app in development mode |
| `pnpm lint`          | Lint all workspaces                     |
| `pnpm typecheck`     | Type-check all workspaces               |
| `pnpm test`          | Run the Vitest suite                    |
| `pnpm test:coverage` | Run the Vitest suite with coverage      |
| `pnpm format`        | Format the repo with Prettier           |
| `pnpm format:check`  | Check formatting without writing        |
| `pnpm build`         | Build all workspaces                    |

## Monorepo layout

```
apps/web        Next.js App Router frontend (TypeScript, Tailwind)
packages/*       Shared packages (none yet)
```

## Build spec

This repo is built against [`LEARN_AI_V1_BUILD_SPEC.md`](./LEARN_AI_V1_BUILD_SPEC.md), the
authoritative specification for V1. See `AGENTS.md` for the working rules used to execute it.
