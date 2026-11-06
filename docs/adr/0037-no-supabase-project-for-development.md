# 0037 — No Supabase project for development

- Status: accepted
- Date: 2026-11-06
- Deciders: the owner

## Context and problem statement

Step 4.2 of the plan created a second Supabase project, `cocoApp-dev`, so the
local environment would never touch production's auth. It served three
things: the manual auth checks of phase 4, the spike on a second session for
the iOS `WKWebView`, and the optional end-to-end receipt check against a real
bucket (`RECEIPTS_STORAGE=supabase`, step 6.9).

Since then the local environment runs entirely on its own: Postgres local and
the fake GoTrue of `npm run dev:auth` (`scripts/dev-auth.mjs`). The free plan
paused `cocoApp-dev` for inactivity, and nothing noticed: no script, test or
process reads its keys.

## Decision

`cocoApp-dev` was deleted on 2026-11-06, and its keys file
(`api/.env.supabase-dev`, never committed) with it. The only Supabase project
is production's.

## Consequences

- Local development and every test run against local Postgres and
  `npm run dev:auth`; the README already says there is no development
  project.
- `RECEIPTS_STORAGE=supabase` has no safe target outside production. The
  receipt e2e runs on disk; checking the Storage adapter against a real
  bucket again means creating a project first.
- `ALLOW_DESTRUCTIVE_AUTH` stays off locally: its escape hatch in
  `api/src/common/env.ts` is for the day a development project exists again.
- If a buyer ever needs one (plan, phase 8), it is recreated with the CLI and
  this ADR is superseded.
