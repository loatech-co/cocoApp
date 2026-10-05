# Contributing

How code gets into this repo. Each section is one rule: what it is, the tool
that enforces it, where the CI checks it, and a correct and an incorrect
example.

**The rule about rules: each tool has its rule written here and its CI check
the same day.** A convention that lives only in someone's head, or a tool that
runs locally but not in CI, is not a convention. If you add or change a tool,
this file and `.github/workflows/ci.yml` change in the same PR.

Later phase-7 steps append their sections below (naming, user-facing text,
architecture, tests…).

| Rule                                            | Tool                              | Local               | CI (`verify` job)        |
| ----------------------------------------------- | --------------------------------- | ------------------- | ------------------------ |
| [Formatting](#formatting)                       | Prettier + `.editorconfig`        | `npm run format`    | `npx prettier --check .` |
| [Lint](#lint)                                   | ESLint 10, one `eslint.config.js` | `npm run lint`      | `npm run lint`           |
| [TypeScript strictness](#typescript-strictness) | `tsc`                             | `npm run typecheck` | `npm run typecheck`      |
| [No dead code](#no-dead-code)                   | knip                              | `npm run knip`      | `npm run knip`           |
| [Git hooks](#git-hooks)                         | lefthook + lint-staged            | on every commit     | (the same checks above)  |
| [Commit messages](#commit-messages)             | commitlint                        | on every commit     | `commitlint` on the PR   |
| [Architecture](#architecture)                   | dependency-cruiser + table check  | `npm run depcruise` | `npm run depcruise`      |
| [Errors](#errors)                               | ESLint `no-restricted-syntax`     | `npm run lint`      | `npm run lint`           |
| [Environment](#environment)                     | zod, at boot                      | `npm test`          | `npm test`               |
| [Size limits](#size-limits)                     | ESLint `max-lines*`               | `npm run lint`      | `npm run lint`           |

## Setup

```bash
npm install          # also installs the git hooks (lefthook)
npm run typecheck && npm run lint && npm test
```

---

## Formatting

Prettier is the only source of formatting (`.prettierrc.json`): 100 columns,
single quotes, semicolons, trailing commas. `.editorconfig` covers what
Prettier does not format (shell, SQL, Prisma, Swift). ESLint has no opinion on
formatting (`eslint-config-prettier`), so the two never fight.

Do not hand-format, and do not reformat code you are not changing in the same
commit as a behaviour change: a pure reformat goes in its own `style:` commit
and its SHA goes into `.git-blame-ignore-revs`.

```ts
// Correct — what Prettier writes
const total = movimientos.reduce((suma, m) => suma.plus(m.amount), CERO);

// Incorrect — double quotes, no semicolon, manual alignment
const total = movimientos.reduce((suma, m) => suma.plus(m.amount), CERO);
const nombre = 'Aseo';
```

Run `npm run format` to fix everything, or let the pre-commit hook do it for
the files you stage. To make `git blame` skip the big reformat locally:
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Lint

One ESLint 10 flat config at the root, `eslint.config.js`. Workspaces do not
have their own; the root config has one block per workspace that only adds its
environment (Node + Jest for `api`, browser + React for `frontend`). Every
workspace's `npm run lint` runs with `--max-warnings 0`: a warning is an error.

What is on:

- `typescript-eslint` **strict-type-checked** and **stylistic-type-checked**.
  The type-aware rules (`no-floating-promises`, `no-misused-promises`,
  `no-unsafe-*`, `no-unnecessary-condition`, `no-non-null-assertion`) are the
  reason this repo uses ESLint and not Biome.
- `@eslint-react` (recommended, type-checked) and `react-hooks` (all of its
  recommended rules, including the React Compiler ones: `set-state-in-effect`,
  `refs`, `purity`…).
- `import-x`: imports ordered packages → internal aliases (`@/`, `@coco/`) →
  relative, alphabetized, one blank line between groups; no duplicate imports;
  **no default exports** except in tool config files that require one
  (`eslint.config.js`, `vite.config.ts`, `vitest.config.ts`…).
- `eslint-config-prettier` last.

Three options differ from the presets, each written with its reason in the
config: numbers are allowed in template literals; an arrow function shorthand
may return a void call (`onClick={() => setOpen(false)}`); and `||` is allowed
on strings, because here `''` means "not given" (`texto?.trim() || null`).
Tests (`*.spec.ts`, `*.test.ts(x)`, `api/test/`, `frontend/src/pruebas/`) may
use `any`-typed values, `!` and empty stubs: in a test, a missing element
failing right there IS the assertion.

When a type-aware rule says a guard is unnecessary, check whether the type is
telling the truth before deleting the guard. Query parameters arrive as
strings, multer leaves `undefined` when nothing was uploaded, and JSON can
carry `null` where a DTO says `string`: fix the type, keep the guard.

Not here, on purpose: `jsx-a11y` (no release supports ESLint 10; accessibility
is checked with axe in the Playwright journeys, step 7.7); naming and file-name
rules — `@typescript-eslint/naming-convention`, `eslint-plugin-check-file` and
`@eslint-react`'s naming rules — which arrive with the renames of step 7.2;
import cycles (dependency-cruiser, see [Architecture](#architecture)).

**Never disable a rule globally.** A per-line disable needs the rule name and a
reason on the same line, and should be rare:

```ts
// Correct — narrow, named, explained
// eslint-disable-next-line @eslint-react/no-array-index-key -- a "…" gap has no identity beyond its position
<span key={i}>…</span>

// Incorrect — blanket, no reason
/* eslint-disable */
```

```ts
// Correct — named export, imports in ordered groups
import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { totalDe } from './totales';

export function Resumen() { … }

// Incorrect — default export, relative import before a package
import { totalDe } from './totales';
import { useState } from 'react';

export default function Resumen() { … }
```

## TypeScript strictness

Every workspace (`api`, `frontend`, `packages/types`, `packages/lectura`)
compiles with `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `noImplicitOverride`. No explicit `any`, no
`@ts-ignore`; `@ts-expect-error` only with a written reason after it.

- **`noUncheckedIndexedAccess`**: `lista[0]` is `T | undefined`. Read the
  element once and narrow it; do not assert it.
- **`exactOptionalPropertyTypes`**: `foo?: string` means "absent or a string",
  not "`undefined` allowed". If a value can be `undefined`, say so in the type
  (`foo?: string | undefined`) for our own types; for a third-party type
  (Prisma, `fetch`, React DOM props) leave the key out instead.
- **`noImplicitOverride`**: a method that overrides one from its base class
  says `override`.

```ts
// Correct
const [primera] = fechas;
if (primera === undefined) return null;
return { iso: primera };

await fetch(url, { method, ...(cuerpo !== undefined && { body: cuerpo }) });

// Incorrect
return { iso: fechas[0]! }; // asserts instead of checking
await fetch(url, { method, body: cuerpo as string }); // casts away undefined
// @ts-ignore
```

## No dead code

`knip` (config in `knip.jsonc`, `npm run knip`) fails when it finds an unused file, export,
dependency or binary that is not listed as an exception. Exceptions live in
`knip.jsonc`, each with the reason next to it (or, for a single export, a
`@public` tag in its doc comment that says who reads it). Delete what is unused
instead of exempting it; exempt only what a tool loads by name or what is kept
on purpose. An export used only inside its own file is not an export: drop the
`export`.

```ts
// Correct — exported because another module imports it
export function totalDe(movimientos: readonly Movimiento[]): Money { … }

// Incorrect — exported "just in case"; nothing imports it
export function totalDeOtraForma(…) { … }
```

## Git hooks

`npm install` installs the hooks with lefthook (`lefthook.yml`, through the
`prepare` script). The install never fails: it is skipped in CI and with
`NODE_ENV=production` (the server's install, which has no devDependencies),
and `|| true` covers a copy without git.

- **pre-commit**: `lint-staged` (`lint-staged.config.js`) runs `eslint --fix`
  on staged TypeScript files of the workspaces and `prettier --write` on every
  staged file; then `tsc --noEmit` runs for each workspace that has a staged
  TypeScript file.
- **commit-msg**: `commitlint` (next section).

Hooks are a convenience, not the gate: CI runs the same checks. Do not skip
them with `--no-verify` to push something CI will reject anyway.

```bash
# Correct
git commit -m "fix(web): keep the filter when the page changes"

# Incorrect — skips the checks you would hit in CI ten minutes later
git commit --no-verify -m "wip"
```

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), checked by
commitlint (`commitlint.config.js`, `@commitlint/config-conventional`). The
commit-msg hook checks each commit locally, and CI checks every commit of a
pull request. In
English, imperative, lower case after the colon, no final period.

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`,
  `ci`, `build`, `revert`.
- Scope (optional): `api`, `web`, `ios`, `types`, `lectura`, `ci`, `deps`,
  `docs`. Use it when the change lives in one workspace.

```text
# Correct
feat(api): reject a split that does not add up to the movement
fix(web): keep the date filter after saving a movement
chore(deps): bump vite to 6.4

# Incorrect
Arreglos varios                 # no type, not English
fix(frontend): …                # unknown scope — it is `web`
feat(api): Added the endpoint.  # past tense, capital, final period
```

## Architecture

Coco is a modular monolith ([ADR 0001](docs/adr/0001-modular-monolith.md)).
`npm run depcruise` checks the rules below with dependency-cruiser
(`.dependency-cruiser.cjs`) and `scripts/ci/table-ownership.mjs`; CI runs it
after knip.

**Layers in the API.** One folder per resource in `api/src/modules/`:
`*.controller.ts` → `*.service.ts` → `*.repository.ts`, plus `*.dto.ts` and
`*.module.ts`. Nothing but Nest wiring lives in `*.module.ts`.

- **Controllers have no logic**: validate (DTO), delegate to one service
  call, respond.
- **Only repositories talk to Prisma.** Only `*.repository.ts` injects
  `PrismaService`. A service or controller may `import type` Prisma's
  generated types (to name the row a repository returns) but never use the
  client at runtime — no queries, no `Prisma.PrismaClientKnownRequestError`.
  A repository that expects a constraint error turns it into a value or a
  domain error (`createUnlessTaken` → `null`, `createWithDetails` →
  `DuplicateError`).
- **Transactions**: a unit of work is ONE repository method that runs
  `prisma.$transaction` itself (`TransactionsRepository.createWithDetails`,
  `updateWithDetails`, `createTransfer`). Services never open a transaction
  and never pass a transaction client around.
- **`common/` never imports `modules/`.** It is shared by every module, so it
  cannot depend on one. Pure helpers several modules use live there
  (`common/categories/categories.tree.ts`).
- **No cycles**, anywhere in the repo.

**A module uses another module only through that module's public service —
never its repository, never its tables.**

Why: a module's service is its contract; its repository and tables are how it
keeps that contract today. When `admin` updated users with its own query and
`auth` later added a rule on status changes, the rule would have been skipped
by every write `auth` did not see. Going through the owner keeps each rule in
one place, keeps each table changeable by one module, and is what would let a
module leave the monolith one day (ADR 0001). In practice:

- import another module's `*.service.ts` (and its `*.module.ts`, to wire it),
  nothing else — dependency-cruiser `api-modules-talk-through-services`;
- query only the tables your module owns — `scripts/ci/table-ownership.mjs`
  maps each Prisma model to its owner. What other modules need from a table is
  a method on the owner's service (`CategoryLookupService`, `LedgerService`,
  `UsersService`, `AuditService`).
- The accesses left when the rule arrived are listed in that script's `KNOWN`
  with their reason (module cycles, single-transaction units of work). That
  list only shrinks.

```ts
// Correct — dashboard reads movements through the owner of the table
constructor(private readonly ledger: LedgerService) {}
const movimientos = await this.ledger.findForSummary(userId, filter);

// Incorrect — another module's repository, or its table directly
constructor(private readonly transactions: TransactionsRepository) {}
await this.prisma.transaction.findMany({ where: { userId } }); // in dashboard/
```

**Web.** `frontend/src/features/<feature>/` do not import each other; what two
features share moves to shared code (D10). The four imports that existed when
the rule arrived, and one cycle in `lib/`, are listed as temporary exceptions
in `.dependency-cruiser.cjs`; the frontend step removes them.

## Errors

Services, repositories, tasks and controllers throw a `DomainError`
(`api/src/common/errors/domain-error.ts`): `NotFoundError`, `ConflictError`,
`ValidationError` (422), `DuplicateError`, `BadRequestError`,
`AuthenticationError`, `ForbiddenError`, `PayloadTooLargeError`,
`UnsupportedMediaTypeError`, `InternalError`, `ServiceUnavailableError`.
`AllExceptionsFilter` is the only place that maps them to HTTP, and the wire
format is a contract: `{ error: { code, message, details } }`, with the
status, `code` and Spanish message each error had before (its spec compares
every domain error with the Nest exception it replaced). Add a subclass only
for a status no existing one covers.

Guards, pipes and param decorators are the HTTP adapter and keep Nest's
exceptions. ESLint fails on `new XxxException(…)` in `*.service.ts`,
`*.controller.ts`, `*.repository.ts` and `*.task.ts`.

```ts
// Correct
if (!tag) throw new NotFoundError('La etiqueta no existe.');

// Incorrect — HTTP leaking into the domain
if (!tag) throw new NotFoundException('La etiqueta no existe.');
```

## Environment

Every variable the API reads is declared once, with its type and whether it
is required, in `api/src/common/config/env.ts` (zod). `main.ts` validates the
environment before anything else and refuses to start with one message that
lists every missing or invalid variable; then the "no remote database outside
production" guard runs. Values go through `leerDelEntorno` first, so quotes
LiteSpeed leaves inside a value and empty strings behave as everywhere else.

A new variable goes into the schema (and `api/.env.example`) in the same PR
that reads it. Required-ness mirrors what the code needs: Supabase Auth's URL
and keys outside `NODE_ENV=test`, the Storage key when receipts go to
Supabase. The spec (`env.spec.ts`) keeps the CI test env, the local env and
the server's quoted env valid.

## Size limits

At most **300 lines per file** and **50 per function**, blank lines and
comments not counted (`max-lines`, `max-lines-per-function`). A long function
splits into named steps; a long file splits by responsibility (a module's
types, its pure helpers, its controller), never into `utils-2.ts`.

- The API has no exceptions.
- Test callbacks (`describe`/`it`) are exempt from the function limit — the
  callback is the scenario — but test files keep the file limit.
- The web and the packages list the files that were over the limits when the
  rules arrived, in `eslint.config.js`, as temporary exceptions for the
  frontend step. A file is never added to those lists.

## Security and operations

### Secrets

**Rule.** A secret lives only in an environment variable validated by
`api/src/common/config/env.ts`. `api/.env.example` lists exactly the variables
of that schema, without values; what only the scripts read goes in
`api/.env.migrate.example`. `gitleaks` scans what is staged on every commit
(lefthook `pre-commit`) and the whole history in CI (`security.yml`).

**Why.** A secret in the code or in a commit is a secret to rotate: removing
it later does not remove it from the history. The pre-commit scan stops it
before it exists, the only moment it costs nothing; CI is the gate for anyone
without gitleaks installed (the hook warns and lets the commit through,
because gitleaks is a Go binary, not an npm package — `brew install
gitleaks`). `env.spec.ts` fails if `.env.example` gains, loses or fills in a
variable, so the template cannot drift from what the API reads.

### Headers, CORS and rate limits

**Rule.** `configureApp` (`api/src/bootstrap.ts`) sets them, and the e2e
suite builds the app with that same function:

- `helmet`: HSTS for two years with `includeSubDomains` and `preload`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `nosniff`, and a
  content security policy where every permit has its reason in a comment.
- CORS: an exact list of origins in `CORS_ORIGINS`, never a wildcard, with
  credentials. Any other origin gets no `Access-Control-Allow-Origin`.
- Rate limits: 120 requests a minute per client by default; `register` 5,
  `login` 10 and `refresh` 30, each with its own `@Throttle`.

Tests: `api/test/security-headers.e2e-spec.ts` (headers, one allowed and one
rejected origin) and `api/test/rate-limit.e2e-spec.ts` (login, register,
refresh). A change to any of these values changes its test in the same PR.

**Why.** The refresh token travels in a cookie, so CORS with credentials and
a wildcard would hand the session to any site. Login and register spend a
19 MiB argon2 hash and a call to Supabase per attempt: without a cap, a few
requests a second exhaust the server. The limiter is off in the rest of the
suite; without its own test it could be switched off for good and nobody
would notice.

### Logs

**Rule.** No personal data and no amounts in a log line: no emails, names,
amounts, descriptions, receipt text, tokens or query strings. Log ids
(internal user id, request id, record ids) and outcomes. The access line and
the exceptions filter write the path without its query string.
`api/src/common/logging/no-personal-data.spec.ts` gives both a request that
carries an email, an amount and a description in its query and its body, and
fails if any of them reaches a line.

**Why.** Logs are copied, rotated, shared to debug and kept longer than the
data, outside the database's access rules. The query string is where search
terms travel. An id is enough to find the record again with the right
permissions; a log never needs the value itself.

### Probes

**Rule.** Two public routes, neither authenticated nor revealing anything:

- `GET /api/v1/health` — the process is alive. Never touches the database.
- `GET /api/v1/ready` — the process can serve: the database answers
  `SELECT 1`; `503` otherwise.

Both are exempt in `user-isolation.e2e-spec.ts`, with their reason.

**Why.** An unreachable database and a dead process are different failures
with different fixes: restarting the API does not bring the database back.
With one route for both, a database outage looked like a crashed API.
