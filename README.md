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
`/api/v2` (the deprecated `/api/v1` still answers) and the web build (`frontend/`), on a Hostinger Node.js app; data,
identity and receipt files live on Supabase (PostgreSQL, Auth, Storage). The
iOS app (`ios/`) is hybrid — native capture, the same web inside a
`WKWebView` — and a pure reading engine (`packages/lectura`) turns receipt,
Wallet and SMS text into proposals, run by the API. Diagrams, flows and the
decisions behind them: [`docs/architecture.md`](docs/architecture.md).

```
api/                NestJS 11 + Prisma; prisma/schema.prisma and migrations/
frontend/           React 19 + Vite + TypeScript SPA
packages/lectura/   reading and classification engine (compiled on install)
packages/types/     types shared by web and API
ios/                SwiftUI app (XcodeGen project)
scripts/            merge, migrations, backups, local data
docs/               architecture, ADRs, runbook, standards
```

## Requirements

- Node.js ≥ 20 and npm.
- PostgreSQL 17 locally: `brew install postgresql@17 && brew services start postgresql@17`.
- For iOS: Xcode 16+, XcodeGen, an Apple ID (free personal team is enough).
- `gh` (GitHub CLI) to open PRs and integrate.

## Install

```sql
-- One role with CREATEDB: Prisma creates and drops a shadow database on every diff (P3014 otherwise).
CREATE ROLE coco_migrate LOGIN PASSWORD '<secret>' CREATEDB;
```

```bash
createdb -O coco_migrate coco_dev
createdb -O coco_migrate coco_dev_shadow
createdb -O coco_migrate coco_test

cp api/.env.example         api/.env
cp api/.env.migrate.example api/.env.migrate
cp frontend/.env.example    frontend/.env

npm install                                   # also prepares Tesseract and builds @coco/lectura
npm run prisma:migrate:dev --workspace api    # creates the schema
npm run sembrar:local                         # idempotent seed: user, template, recurring concepts
```

Fill the `__CAMBIAR__` values. `api/.env` points at the local database and at
the **development** Supabase project, never at production: the API refuses to
start outside production against a non-local database. Anything prefixed
`VITE_` ships in the browser bundle, so no secret goes there.

The account registered with `BOOTSTRAP_ADMIN_EMAIL` is born admin and
active; every other account is born pending until an admin approves it.

## Run

| Part | Command                                          | Where                                |
| ---- | ------------------------------------------------ | ------------------------------------ |
| API  | `npm run dev:api`                                | `http://localhost:3000/api/v2`       |
| Web  | `npm run dev:web`                                | `http://localhost:5173`              |
| iOS  | `cd ios && xcodegen generate`, then Run in Xcode | see [`ios/README.md`](ios/README.md) |

`npm run sql -- "SELECT …"` queries the local database. Real data reaches it
only through `scripts/traer-datos-a-local.sh` (see the runbook).

## Test

```bash
npm run typecheck
npm run lint
npx prettier --check .
npx knip
npm test                              # unit tests, every workspace
npm run test:e2e --workspace api      # Supertest against coco_test
npm run build
bash scripts/verify-clean-install.sh  # installs like the server does
```

iOS: `xcodebuild test` (details in [`ios/README.md`](ios/README.md)).

## Deploy

Work on a branch from `Dev`, open a PR against `Dev`, and integrate only with
`bash scripts/merge.sh`: it waits for CI and fast-forwards `Dev`, which the
host builds and deploys. Migrations go first, with
`scripts/desplegar-migraciones.sh`. iOS is installed from Xcode and renewed
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
