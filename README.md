# Coco — personal finances

Coco is a single ledger for one's financial life: transactions, fixed costs,
budgets, debts and goals, with receipts read from photos and PDFs. Two
principles govern it:

- **The transaction ledger is the core.** Balances, budgets, debts and goals
  are derived from it; no stored balance has to be kept in sync by hand.
- **It informs and suggests; it never blocks.** A transaction can exist
  without a category, and that never stops it from being saved.

## Architecture

A modular monolith: one NestJS process (`api/`) serves the JSON API under
`/api/v2` (v1 was retired in step 7.10) and the web build
(`frontend/`), on a Hostinger Node.js app; data, identity and receipt files
live on Supabase (PostgreSQL, Auth, Storage). The iOS app (`ios/`) is hybrid — native capture, the same web inside a
`WKWebView` — and a pure reading engine (`packages/receipt-parser`) turns receipt,
Wallet and SMS text into proposals, run by the API. Diagrams, flows and the
decisions behind them: [`docs/architecture.md`](docs/architecture.md).

```
api/                NestJS 11 + Prisma; prisma/schema.prisma and migrations/
frontend/           React 19 + Vite + TypeScript SPA
packages/receipt-parser/   reading and classification engine (compiled on install)
ios/                SwiftUI app (XcodeGen project)
scripts/            merge, migrations, backups, local data
docs/               architecture, ADRs, runbook, standards
```

## Requirements

- Node.js ≥ 22.12 and npm (Prisma 7, ADR 0020).
- PostgreSQL 17 locally: `brew install postgresql@17 && brew services start postgresql@17`.
  Homebrew's server lets your OS user in as superuser, which is what the setup script uses.
- For the Playwright journeys: Ghostscript (`brew install ghostscript`).
- For iOS: Xcode 16+, XcodeGen, an Apple ID (free personal team is enough).
- `gh` (GitHub CLI) to open PRs and integrate.

## Install

Everything runs on this machine. Nothing below reads or writes production:
the database is the local Postgres and authentication is a local auth server.

```bash
npm install                                   # also prepares Tesseract and builds the packages
bash scripts/setup-local-db.sh                # roles, databases and env files (idempotent)
npm run prisma:migrate:dev --workspace api    # creates the schema in coco_dev
npm run db:test:push --workspace api          # and in coco_test, for the API e2e suite
```

`scripts/setup-local-db.sh` creates:

| What                                                             | Why                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Role `coco_migrate` (CREATEDB, BYPASSRLS)                        | Owns the schema and runs the migrations; Prisma creates and drops a shadow database (P3014) |
| Role `coco_app` (LOGIN, no BYPASSRLS)                            | The API connects as it, under row-level security, as in production (ADR 0019)               |
| `coco_dev`, `coco_dev_shadow`, `coco_test`                       | Development, Prisma's shadow, and the API e2e suite (which empties its tables)              |
| `api/.env`, `api/.env.migrate`, `api/.env.test`, `frontend/.env` | From the `*.example` templates, with the local values filled in                             |

The passwords are local-only (`local-only-migrate-password`,
`local-only-coco-app-password`), the same ones the templates carry. A role
that already exists keeps its password and an env file that already exists is
kept; if your roles have other passwords, edit the env files. A Postgres on
another port: `ADMIN_DATABASE_URL=postgresql://$USER@127.0.0.1:5433/postgres
bash scripts/setup-local-db.sh`, and the env files take that port.

The API refuses to start outside production against a non-local database.
Anything prefixed `VITE_` ships in the browser bundle, so no secret goes there.

### The first user

There is no Supabase project for development, and the production one holds
real accounts. So locally `SUPABASE_URL` points at `npm run dev:auth`: the
fake GoTrue the Playwright journeys use, on `127.0.0.1:9999`, which keeps its
accounts in `api/.dev-auth.json` (ignored by git). Against it, sign-up works;
against a remote `SUPABASE_URL` it is refused unless `ALLOW_DESTRUCTIVE_AUTH=si`.

1. Start the three processes (see [Run](#run)).
2. Open `http://localhost:5173` and sign up with `admin@local.coco`, the
   `BOOTSTRAP_ADMIN_EMAIL` of the local `api/.env`: that account is born admin
   and active. Every other account is born pending until an admin approves it.
3. Seed it: `npm run seed:local` (idempotent: template, recurring concepts).

## Run

| Part | Command                                          | Where                                |
| ---- | ------------------------------------------------ | ------------------------------------ |
| Auth | `npm run dev:auth`                               | `http://127.0.0.1:9999`              |
| API  | `npm run dev:api`                                | `http://localhost:3000/api/v2`       |
| Web  | `npm run dev:web`                                | `http://localhost:5173`              |
| iOS  | `cd ios && xcodegen generate`, then Run in Xcode | see [`ios/README.md`](ios/README.md) |

`npm run sql -- "SELECT …"` queries the local database. Real data reaches it
only through `scripts/pull-data-to-local.sh` (see the runbook).

## Test

The same checks CI runs:

```bash
npm run typecheck
npm run lint
npx prettier --check .
npx knip
npm run depcruise
npm test                                         # unit tests, every workspace
npm run test:coverage --workspace frontend       # web coverage thresholds
npm run test:cov --workspace api                 # API unit + e2e coverage, as coco_app on coco_test
npm run test:e2e --workspace api                 # the API e2e suite alone
npm run build
npx size-limit                                   # bundle budget, after the build
npm run build-storybook --workspace frontend
bash scripts/verify-clean-install.sh             # installs like the server does
```

The Playwright journeys build the API and the web, and run them against a
fake GoTrue and their own `coco_e2e_pw_test` database, which they create and
empty:

```bash
npx playwright install chromium
export E2E_DATABASE_URL=postgresql://coco_migrate:local-only-migrate-password@127.0.0.1:5432/coco_e2e_pw_test
export E2E_APP_DATABASE_URL=postgresql://coco_app:local-only-coco-app-password@127.0.0.1:5432/coco_e2e_pw_test
npm run e2e:build
npm run e2e
```

Old journey databases pile up across worktrees:
`bash scripts/setup-local-db.sh --clean` drops every `coco_e2e_*_test`.

iOS: `xcodebuild test` (details in [`ios/README.md`](ios/README.md)).

## Deploy

Work on a branch from `Dev`, open a PR against `Dev`, and integrate only with
`bash scripts/merge.sh`: it waits for CI and fast-forwards `Dev`, which the
host builds and deploys. Migrations go first, with
`scripts/deploy-migrations.sh`. iOS is installed from Xcode and renewed
every 7 days. Verification, rollback, backups and incidents:
[`docs/runbook.md`](docs/runbook.md).

## Rules that never break

- **Money is `DECIMAL(15,2)` in the database and `Prisma.Decimal` in
  TypeScript, never `number`**, and travels through the API as a decimal
  string. A float cannot represent `0.10`; hundreds of rows drift by cents.
- **`user_id` comes from the verified token, never from the client.** Every
  query filters by it; someone else's resource answers 404, never 403.
- **No secrets in git**: only `.env.example` files are versioned.
- **Schema before code**, additive by default ([ADR 0008](docs/adr/0008-expand-and-contract-migrations.md)).

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — conventions and the PR checklist.
- [`CLAUDE.md`](CLAUDE.md) — interface rules and the working mode.
- [`docs/architecture.md`](docs/architecture.md) — C4 diagrams and flows.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`docs/runbook.md`](docs/runbook.md) — operations.
- [`docs/standards/`](docs/standards/) — phase 7 research and decisions.
- [`ios/README.md`](ios/README.md) — the iPhone app.
