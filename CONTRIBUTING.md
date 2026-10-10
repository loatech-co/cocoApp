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
| [Commit messages](#commit-messages)             | commitlint                        | on every commit     | `commitlint` (`hygiene`) |
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
- `i18next/no-literal-string` (`jsx-text-only`) in `frontend/src`: a text
  with letters written as a JSX child fails. See
  [User-facing text](#user-facing-text).
- `eslint-config-prettier` last.

Three options differ from the presets, each written with its reason in the
config: numbers are allowed in template literals; an arrow function shorthand
may return a void call (`onClick={() => setOpen(false)}`); and `||` is allowed
on strings, because here `''` means "not given" (`texto?.trim() || null`).
Tests (`*.spec.ts`, `*.test.ts(x)`, `api/test/`, `frontend/src/test-support/`) may
use `any`-typed values, `!` and empty stubs: in a test, a missing element
failing right there IS the assertion.

When a type-aware rule says a guard is unnecessary, check whether the type is
telling the truth before deleting the guard. Query parameters arrive as
strings, multer leaves `undefined` when nothing was uploaded, and JSON can
carry `null` where a DTO says `string`: fix the type, keep the guard.

Not here, on purpose: `jsx-a11y` (no release supports ESLint 10; accessibility
is checked with axe in the Playwright journeys, step 7.7); `@eslint-react`'s
naming rules, which arrive with the renames of step 7.2; import cycles
(dependency-cruiser, see [Architecture](#architecture)). Naming has its own
section: [Naming](#naming).

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

import { Button } from '@/shared/ui/atoms/button';

import { totalDe } from './totales';

export function Resumen() { … }

// Incorrect — default export, relative import before a package
import { totalDe } from './totales';
import { useState } from 'react';

export default function Resumen() { … }
```

## Naming

`docs/plan-completo.md` §7.2 is the rule; three checks hold it, all in
`npm run lint`:

- **`paths/kebab-case-paths`** (`scripts/lint/kebab-case-paths.js`): files and folders in `kebab-case` under
  `api/{src,test}`, `frontend/src` and `packages/*/src`. The role suffix and
  `.test`/`.spec`/`.stories` are middle extensions and are not checked.
- **`@typescript-eslint/naming-convention`**: `camelCase` values and functions,
  `PascalCase` types and components, `UPPER_CASE` module constants, no `I`
  prefix and no `Type` suffix on types, and booleans with a prefix (`is`,
  `has`, `can`, `should`…). Object keys and destructured names are not
  checked: they are often a wire or a database name (`category_id`).
- **`scripts/lint/spanish-identifiers.ts`** (`npm run lint:spanish`): no
  declared name, file or folder in Spanish under `api/`, `frontend/`,
  `packages/`, `scripts/`, `e2e/` and `ios/`. Strings, comments and test titles
  are not read (visible text is the catalog's, [User-facing text](#user-facing-text)).

```ts
// Correct
const isLoading = true;
export function createTransaction(input: CreateTransactionInput) { … }

// Incorrect — no prefix on a boolean, Spanish name, `Type` suffix
const cargando = true;
export function crearMovimiento(input: MovimientoInputType) { … }
```

**No baselines left.** What broke these rules when they arrived was recorded
and let through while step 7.2 renamed, and both records are now empty and
deleted: `scripts/lint/spanish-identifiers.baseline.json` in J-6c, ESLint's bulk
suppressions for `naming-convention` in 7.2-p (web) and J-1 (api). Any Spanish
name fails `npm run lint`. Never `--suppress-rule` again: a new name is fixed,
not suppressed.

## TypeScript strictness

Every workspace (`api`, `frontend`, `packages/receipt-parser`)
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
  on staged TypeScript files of the workspaces, from each workspace (as `npm run lint` does), and `prettier --write` on every
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
commit-msg hook checks each commit locally, and CI (the `hygiene` job of `ci.yml`,
which runs on every pull request, docs-only ones included) checks every commit
of a pull request. In
English, imperative, lower case after the colon, no final period.

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`,
  `ci`, `build`, `revert`.
- Scope (optional): `api`, `web`, `ios`, `receipt-parser`, `flags`, `ci`,
  `deps`, `docs`. Use it when the change lives in one workspace.

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
- **Only repositories talk to Prisma, and through `Database.forUser`.** A
  repository injects `Database` (`api/src/prisma/database.ts`) and runs every
  query on the client `forUser(userId, tx => …)` hands it; `PrismaService`
  itself is injected only by the exceptions listed, with their reason, in
  `database.rule.spec.ts`. A service or controller may `import type` Prisma's
  generated types (to name the row a repository returns) but never use the
  client at runtime — no queries, no `Prisma.PrismaClientKnownRequestError`.
  A repository that expects a constraint error turns it into a value or a
  domain error (`createUnlessTaken` → `null`, `createWithDetails` →
  `DuplicateError`).
- **Transactions**: a unit of work is ONE repository method whose whole body
  runs in one `forUser` (`TransactionsRepository.createWithDetails`,
  `updateWithDetails`, `createTransfer`). Services never pass a transaction
  client around. The one thing a service may do is wrap several repository
  calls in `db.forUser(userId, () => …)` so they share one transaction
  instead of opening one each (`DashboardService.resumen`); nested calls for
  the same user reuse it. Inside such a wrapper a constraint error aborts the
  whole transaction, so a repository that catches one (`createUnlessTaken`)
  must not be called there.
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

## Web architecture

`frontend/src` has three layers, and an import only goes down:

| Layer                | What lives there                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`               | Boot, routes, providers and the shell (rail, bottom bar, account sheet, shortcuts palette, navigation).                                 |
| `features/<domain>/` | One folder per domain, not per screen: `pages/`, `components/`, `api/` (React Query hooks), `hooks/`, `model/` (business logic, types). |
| `shared/`            | `ui/` (the design system), `lib/` (infrastructure: dates, formatting, focus, native bridge), `api/` (client, session, common queries).  |

The features are `admin`, `auth`, `bank-accounts`, `cost-centers`, `profile` and
`transactions`. The full criterion, with examples from Coco, is in
`.claude/rules/web/structure.md`, and the inventory of `shared/ui` in
`.claude/rules/web/inventory.md`; it is updated in the same PR
that creates or changes a component.

**Features never import each other.**

Why: what two features share is shared by definition, and a hidden link
between two domains is the one nobody remembers when changing either. It moves
up to `shared/` (the category tree to `shared/api/categories.ts`, the password
policy to `shared/ui/atoms`).

**Nothing imports `app/`, and `shared/` never imports `features/`.**

Why: each layer can then be read, tested and moved knowing only the layers
below it.

**`shared/ui` draws what it is given: no React Query, no api client, no
session.**

Why: a component that fetches can only be used where that data exists, and
can only be tested with a server. A domain component that needs data lives in
`features/<domain>/components/` and gets it from that feature's `api/` hooks.

**A component's level is the lowest its imports allow.**

| Level        | May use                        | Example                                   |
| ------------ | ------------------------------ | ----------------------------------------- |
| `atoms/`     | no other `shared/ui` component | `Button`, `Input`, `Field`, `BottomSheet` |
| `molecules/` | atoms                          | `Menu` (Button + BottomSheet), `Calendar` |
| `organisms/` | molecules and atoms            | `Select` (Menu + Field), `Modal`          |
| `templates/` | organisms, molecules and atoms | none yet                                  |

Why: a level decided by opinion is argued once per component; a level decided
by imports is checked by a machine. `shared/ui/foundations/` holds what every
level may use and is not a component: class tokens (`FLOATING_SURFACE`)
and the field context (`useInsideField`, `FIELD_FOCUS`).

`npm run depcruise` fails CI on any of these, and on any cycle. There are no
exceptions.

```ts
// Correct — a feature page composes shared UI with its own data hook
import { useAccounts } from '@/features/bank-accounts/api/accounts';
import { Card } from '@/shared/ui/atoms/card';

// Incorrect — a shared component fetching, or one feature reaching into another
import { useTransactions } from '@/features/transactions/api/transactions'; // in shared/ui/
import { TransactionModal } from '@/features/transactions/components/transaction-modal'; // in features/cost-centers/
```

### API client

The web talks to `/api/v2` through a client Orval generates from
`api/openapi.v2.json` (D11): typed `fetch` functions and the schema types, in
`frontend/src/shared/api/generated/`. Hooks are NOT generated: each feature
writes its React Query hooks in its `api/`, calling those functions.

```ts
// Correct — the feature's hook calls the generated function
import { accountsList } from '@/shared/api/generated/accounts-v2/accounts-v2';
import type { Account } from '@/shared/api/generated/model';
queryFn: () => allPages((page) => accountsList(page));

// Incorrect — a hand-written path and a hand-written type for the response
apiFetch<{ display_name: string }[]>('/accounts');
```

- **The generated folder is committed and never edited.** Why: Hostinger's
  hbuilds builds without devDependencies, so it cannot run Orval; and making
  Orval a production dependency would ship its whole tree to the server for a
  file that only changes with the contract. Regenerate with
  `npm run generate:api --workspace frontend` in the same PR that changes
  `api/openapi.v2.json`; CI regenerates it and fails on any difference.
- **Every request goes through `apiRequest`** (`shared/api/api-client.ts`, the
  Orval `mutator`): token, renew-before-expiry, one retry after a 401, and the
  `{ error }` envelope as an `ApiClientError`. Only two things skip it, on
  purpose: the auth calls in `session.ts` (renewing is what the door is built
  on) and the upload in `apiUpload` (it needs upload progress).
- **Every v2 list is paginated.** A screen that needs the whole set —the
  category tree, the accounts— uses `allPages` (`shared/api/pages.ts`); a
  table passes its own `page` and `perPage` (at most 200).
- **Contracts that speak another dialect are translated at the edge, once.**
  The dashboard's `breakdownLevel` and `granularity` become the Spanish words
  the screen shows (`dashboard-charts.tsx`). Nothing inside a feature knows.
  The iOS bridge delivers the v2 session as the API gave it to the app, and
  the web stores it as it comes (`session.ts`).
- **What is not in the OpenAPI document** —the bridge, the app's User-Agent
  mark, the receipt limits both clients follow— lives in
  `shared/lib/native-contract.ts`. `receipts.contract.spec.ts` (api) and the
  iOS `ContractsTests` read that file by path, so its literals are
  load-bearing. It replaced
  `packages/types`, which no longer exists.
- `shared/ui` imports neither the generated client nor the native contract,
  not even types (`web-ui-knows-no-contract`): a component gets a sign or a
  label, not an API object.
- The API origin is `VITE_API_ORIGIN` (empty = same origin, which production
  needs for the `SameSite=Strict` refresh cookie); the paths already carry
  `/api/v2`.

### Rigid pieces, flexible composition

**Outside `shared/ui`, a screen composes components: no raw `<button>`,
`<input>`, `<textarea>`, `<select>`, `<dialog>` or `<table>`, and no arbitrary
Tailwind colour, radius or measure (`bg-[#…]`, `rounded-[…]`, `w-[…]`,
`text-[13px]`).**

Why: a control drawn in a screen is a copy, and copies drift. Before this rule
there were two switches (4px apart, different knob in dark mode), two
breadcrumbs, two search headers and three error alerts with their list of
details, each written by hand. A class from the call is how four button
heights ended up in one toolbar.

**The flexibility lives in the component, never in the call.** A new need is a
variant of the component, the way `size` works on `Button` or `width` on
`Menu`, not a `className` added where it is used. The call may place a piece
(a margin, a grid cell); it does not dress it.

**Something new goes in this order:** combine what exists → add a variant to
the component → create a component at the lowest level its imports allow,
with its story in the catalogue.

**An exception is registered with its reason in one place, or it does not
exist.** For these two rules that place is `DESIGN_EXCEPTIONS` in
`eslint.config.js`; the lint also fails on an entry nobody uses any more. The
touch floor (`mobile:min-h-[42px]`) keeps its own registry in
`shared/ui/touch-floor.test.ts`, and a radius over 10px in
`shared/ui/radius.test.ts`.

A `var(--token)` is not arbitrary (it reads the theme), and a step of the
scale is not either: `min-h-55` is 220px, `size-4.5` is 18px. A value the theme
does not have is added to `index.css` with its reason (`leading-hero`,
`pb-safe`).

```tsx
// Correct — the piece decides how it looks; the screen picks a variant
<TextButton tono="primario" onClick={limpiar}>{t('transactions.classificationFilter.clear')}</TextButton>
<Menu ancho="sm" … />

// Incorrect — a control drawn in the screen, and a measure from the call
<button className="rounded-sm font-medium text-primary hover:underline">Limpiar</button>
<Menu ancho="w-[min(22rem,calc(100vw-2rem))]" … />
```

### User-facing text

**Every text a person reads lives in `frontend/src/locales/es.json`, under an
English key, and is read with `t` from `shared/lib/i18n.ts`** (step 7.3, D5).
The keys are typed from the JSON itself: `t('nope')` does not compile, and
neither does a missing interpolation.

```tsx
// Correct — the key says where it lives; the value fills its gap
<p>{t('accounts.creditAvailable', { amount: formatCOP(cuenta.availableCredit) })}</p>

// Incorrect — a literal in the component, and a sentence glued around a value
<p>Cupo disponible: {formatCOP(cuenta.availableCredit)}</p>
```

- Keys go under their domain (`transactions`, `centers`, `accounts`, `admin`,
  `auth`, `profile`), the shell under `shell`, `shared/ui` under `ui`, client
  errors under `errors`, and what several screens repeat under `common`.
- Singular and plural are two keys, not i18next's `count`.
- The `detail` of a problem+json is shown as the API wrote it; it is never
  looked up in the catalog.
- **Money and dates go through `shared/lib/format.ts`**, the one module that
  calls `Intl` (always `es-CO`), month and weekday names included.

The checks: `i18next/no-literal-string` in `jsx-text-only` mode (D6), whose
exceptions live in `TEXT_EXCEPTIONS` in `eslint.config.js`, each with its
reason; and `frontend/src/locales/catalog.test.ts`, which fails if a text of
the inventory taken before the move (`es.inventory.json`) changed or was lost,
or if a key is no longer used. Changing a text on purpose means changing it in
both files in the same commit.

The catalog, i18next and react-i18next load in their own chunk, awaited at the
top of `i18n.ts`: they do not count against the initial bundle, and nothing
renders before the texts are there ([ADR 0025](docs/adr/0025-text-catalog-loads-beside-the-entry.md)).

## Errors

Services, repositories, tasks and controllers throw a `DomainError`
(`api/src/common/errors/domain-error.ts`): `NotFoundError`, `ConflictError`,
`ValidationError` (422), `DuplicateError`, `BadRequestError`,
`AuthenticationError`, `ForbiddenError`, `PayloadTooLargeError`,
`UnsupportedMediaTypeError`, `InternalError`, `ServiceUnavailableError`.
`AllExceptionsFilter` is the only place that maps them to HTTP, and the wire
format is a contract: `application/problem+json` (RFC 9457), `{ type, title,
status, detail, code, errors? }`, for every error —one before routing too, like
an unknown route. `code` is stable, in English and one per business rule;
`detail` is the Spanish sentence; `errors[]` names each field at fault.

A rule a client may want to react to gets its own code: add it to
`common/errors/problem-codes.ts` (the only list; iOS and the web switch on it)
and throw with it, `new ValidationError('…', { code: 'splits_unbalanced' })`.
Each subclass only accepts the codes of its own status. A published code is
never renamed. Add a subclass only for a status no existing one covers.

Guards, pipes and param decorators are the HTTP adapter: they may keep Nest's
exceptions, or throw a `DomainError` when the rule has a code of its own (the
session guard does, for `account_suspended` and its siblings). ESLint fails on `new XxxException(…)` in `*.service.ts`,
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
production" guard runs. Values go through `readEnv` first, so quotes
LiteSpeed leaves inside a value and empty strings behave as everywhere else.

A new variable goes into the schema (and `api/.env.example`) in the same PR
that reads it. Required-ness mirrors what the code needs: Supabase Auth's URL
and keys outside `NODE_ENV=test`, the Storage key when receipts go to
Supabase. The spec (`env.spec.ts`) keeps the CI test env, the local env and
the server's quoted env valid.

Renaming a variable is expand and contract, because the server's `.env` is
not deployed with the code: add the pair to `RENAMED_ENV`
(`api/src/common/env.ts`) so `readEnv` falls back to the old name with a
warning at boot, add the new name on the server with the same value, and
remove the old one (and the pair) in a later step. The 7.2-r3 renames and
their state are in `docs/runbook.md`.

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

## Component catalogue

**Every new `shared/ui` component arrives with its story in the same PR.**

Why: the catalogue is where the owner reviews the design of a component, and
a component without a story is reviewed only through the screen that happens
to use it, in the one state that screen shows. The story is the only place
where its sizes, disabled, error, visible focus and both themes sit side by
side.

- Storybook lives in `frontend/.storybook/`; run it with
  `npm run storybook --workspace frontend`.
- The story sits next to its component (`button.tsx` → `button.stories.tsx`)
  and its title is the component's level: `Atoms/`, `Molecules/`,
  `Organisms/` or `Templates/`.
- A story shows every variant and state the component has. Visible focus uses
  the `pseudo` parameter aimed at the element that takes the focus
  (`pseudo: { focusVisible: ['input'] }`), never at the whole story.
- Stories never fetch: no React Query, no api client, no session, and made-up
  data only. The catalogue builds offline in CI
  (`npm run build-storybook --workspace frontend`) when `shared/ui`, its
  config or the dependencies change.
- Storybook is a devDependency: stories and its config are excluded from the
  production build (`frontend/tsconfig.build.json`).
- A component that still has no story is marked in the inventory,
  `.claude/rules/web/inventory.md`.

## Frontend tests and coverage

Component tests use Testing Library and check what a person or a screen
reader gets, not how it is built: role, accessible name, `aria-*` states,
clicks, keys (Escape, Enter), clicking outside. Every component in
`frontend/src/shared/ui` has one, next to it (`menu.tsx` → `menu.test.tsx`).
New tests are named in English: `describe` with the unit, `it` with the
behaviour in the present tense (`it('closes with Escape')`). The design-rule
tests that read the source (button size, radius, surfaces, field, focus,
page header) are part of the standard: they are extended, never duplicated
or switched off.

Coverage runs with `@vitest/coverage-v8` (`npm run test:coverage --workspace
frontend`), and the CI `verify` job fails under the thresholds in
`frontend/vitest.config.ts`:

| Scope                    | Lines | Branches |
| ------------------------ | ----- | -------- |
| `frontend/src`           | 70 %  | 66 %     |
| `frontend/src/shared/ui` | 98 %  | 96 %     |

The plan's target for `frontend/src` is **70 %** of lines and branches; lines
reached it in step J-2. The branch gap is in `features/` (transactions and
cost-centers above all). **Thresholds only
go up**: a PR that adds coverage raises them to the new floor; lowering one
needs an ADR with the reason.

## Security and operations

### Secrets

**Rule.** A secret lives only in an environment variable validated by
`api/src/common/config/env.ts`. `api/.env.example` lists exactly the variables
of that schema, without values; what only the scripts read goes in
`api/.env.migrate.example`. `gitleaks` scans what is staged on every commit
(lefthook `pre-commit`), the commits of every pull request in CI
(the `hygiene` job of `ci.yml`) and the whole history weekly (`security.yml`).

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

### Row-level security

**Rule.** The API connects as `coco_app`: no `BYPASSRLS`, not the owner of
any table. Every table with a user's rows has a policy keyed on
`app.current_user_id`, which `Database.forUser` sets transaction-local as the
first statement of each unit of work. A new table ships with its policy in
the same migration (`row-level-security.e2e-spec.ts` fails on a public table
without one). Local, CI and the e2e suites run as `coco_app` too; fixtures
and cleanup use the owner's client (`startApp().prisma`).

**Why.** The `user_id` filter in each repository is the first lock, and
`user-isolation.e2e-spec.ts` checks it route by route. The policy is the
second: a query that forgets the filter still sees only the rows of the user
its unit runs as, and one outside any unit sees none. Transaction-local
because the API goes through the pooler in transaction mode, where two loose
statements can land on different connections. ADR 0019 has the design, the
one query that crosses users and the measured cost.

### Probes

**Rule.** Two public routes, neither authenticated nor revealing anything:

- `GET /api/v2/health` — the process is alive. Never touches the database.
- `GET /api/v2/ready` — the process can serve: the database answers
  `SELECT 1`; `503` otherwise.

Both are exempt in `user-isolation.e2e-spec.ts`, with their reason.

**Why.** An unreachable database and a dead process are different failures
with different fixes: restarting the API does not bring the database back.
With one route for both, a database outage looked like a crashed API.

## Tests

### The pyramid

**Rule.** Four layers, each for what only it can see:

| Layer                      | Where                                                         | Runs against                                            |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Unit                       | `api/src/**/*.spec.ts`, `packages/*/src/**/*.spec.ts`         | Pure logic, in memory                                   |
| Repository and integration | `api/test/*.e2e-spec.ts`                                      | The local Postgres test database                        |
| API end to end             | `api/test/*.e2e-spec.ts`, one flow per resource, `supertest`  | The whole app, built by `configureApp` as in production |
| Web                        | Component tests (Testing Library) and the Playwright journeys | See the frontend                                        |

**Why.** A rule about money, dates or recurrence is cheapest to pin down as a
pure function, and a hundred cases run in a second. What a query returns, a
constraint rejects or a guard lets through only shows against a real database
and the real app: a mock of them would test the mock.

### No Prisma mocks

**Rule.** Nothing that reaches the database is mocked. Repositories, and
anything else that talks to Prisma, are tested against the local test
database. Mocking a repository or another service in the unit test of a
service is fine; mocking `PrismaService` is not.

**Why.** Prisma's own guidance for data-layer code is integration tests
against a real database. The bugs worth catching there are a missing
`user_id` in a `where`, a `SET NULL` that orphans rows, a unique index that
turns a retry into a 409; a mocked client returns whatever the test told it
to and catches none of them.

### Test data comes from factories

**Rule.** Rows are built with the factories in `api/test/factories/`
(`makeAccount`, `makeConcept`, `makeTransaction`), and objects with the ones
next to each package's tests (`packages/receipt-parser/src/testing/`). A test writes
only the fields it is about: `makeTransaction(prisma, user.id, { amount: '100' })`.
Users come from `startApp().createUser()`, which also opens their
session.

**Why.** A fixture with every field spelled out hides the one that matters,
and twenty copies of it drift apart. A factory keeps the valid defaults in one
place, so a new required column changes one file.

### No test depends on another

**Rule.** Every test sets up what it needs and passes alone (`-t`) or
shuffled (`--randomize`). Suites with state shared across tests (a rate
limiter, the list of covered routes) rebuild it per test or declare it outside
the tests. The e2e app listens once per suite (`startApp`): never hand
`supertest` a server that is not listening.

**Why.** A test that passes only after another one hides a bug in the order,
not in the code, and fails the day someone runs it alone. The `socket hang
up` that came and went in `auth.e2e-spec.ts` was supertest opening a server
per request: when the OS handed back a port already used, Node's keep-alive
pool sent the next request down a socket the old server had closed.

### One test database per worktree

**Rule.** When several worktrees run tests at once, each one points
`DATABASE_URL` and `DIRECT_URL` in its `api/.env.test` at its own database,
whose name ends in `_test` (the guard in `api/test/helpers/app.ts` refuses
anything else), and runs `npm run db:test:push --workspace api` once.
`DATABASE_URL` connects as `coco_app` and `DIRECT_URL` as the owner
(`coco_migrate`); `scripts/db/create-app-role.sh` with
`MIGRATION_ROLE=coco_migrate` sets both roles up once per machine.

**Why.** `clean()` empties every table, so two runs against the same
database break each other. The failures look like flaky tests (rows vanishing
mid-test, a 401 for a user created a line earlier) and send whoever sees them
after a bug that is not there.

### Coverage

**Rule.** CI fails below 80 % of lines or of branches in `api/src` (unit and
e2e measured together: `npm run test:cov --workspace api`) and in
`packages/receipt-parser` (its `npm test` always measures). `src/common/money` keeps
90 %. A threshold only goes up.

**Why.** The number is a floor, not a goal: it catches a module landing
without tests. What to test is still decided by risk —money, pending payments,
recurrence, classification, capture and idempotency first—, and a test written
only to move the number is not a test.

### Names

**Rule.** `describe` names the unit; `it` states the behavior in the present
tense, in English: `it('rejects a concept that is both auto-paid and multi-payment')`.

**Why.** Read in a row, the titles are the specification of the unit, and a
failure reads as the sentence that stopped being true.

## API contract (OpenAPI)

**Rule.** The API describes itself: `@nestjs/swagger@11` builds one OpenAPI
document per contract version from the controllers and DTOs, and the result
is committed as `api/openapi.v2.json` (the only version served since 7.10). A
change to a route, a DTO or a response shape regenerates it in the same PR:

```sh
npm run openapi --workspace api
```

The script builds the API and opens it in Nest's preview mode —no provider is
instantiated, so it needs no database and no secrets— and writes one file per
version. CI runs it again and fails if it differs from the committed one, and
keeps it as the `openapi` artifact. Swagger UI is served at `/api/docs/v2`
outside production only.

**How a route is described.**

- Inputs come from the DTOs: the Swagger CLI plugin (`api/nest-cli.json`)
  reads their types, their `class-validator` rules and their comments. A DTO
  rarely needs a decorator. It only reads files named `*.dto.ts` and
  `*.response.ts`, so an input class lives in one of those, never inside a
  controller.
- Responses are classes in `api/src/contract/v<n>/*.response.ts`, in the wire
  format (a bigint goes out as a number). `shapes.spec.ts` makes it a compile
  error if one stops matching the view its service returns.
- Each controller says, with the decorators in
  `contract/v2/openapi.decorators.ts`: `@ApiAuthenticated()` or `@ApiPublic()`;
  `@ApiDataV2(Model, { isPage, status })` for the `{ data, meta }` envelope;
  `@ApiNoContent()` for a 204; and `@ApiErrors(…)` for the statuses it answers
  with an error (`application/problem+json`, with the codes of each status
  listed).

**Why.** One source of truth: the clients generate their types from these files
(Orval in fetch mode, D11), so a document that drifts from the code is a client
that compiles against an API that does not exist. `api/test/openapi.e2e-spec.ts`
fails if Express registers a route no file describes (or the other way round),
if a document holds a route of another version, if a route documented as
authenticated answers without a token, or if a route without a token is not on
its list of public ones.

## API versions

**Rule.** A breaking change to the contract is a new version next to the old
one, never an edit of it (7.2, 7.10). Today there is one:

- **v2** (`/api/v2`) is the contract: English and camelCase on the wire,
  English literals (`high`, `quarterly`, `cost_center`), and every list a page,
  `{ data, meta: { page, perPage, total } }` with `?page=` and `?perPage=` (50
  by default, 200 at most; D9). Messages meant for the user stay in Spanish.
  Errors are `application/problem+json` (below, «Errors»).
- **v1** was retired on 2026-10-06 (7.10). Any path under it, like any
  unknown route, is a `404` problem.

**Retiring a version** is expand and contract (ADR 0008): the new one ships
next to the old, the old answers with `Deprecation` and `Link: <successor>;
rel="successor-version"` and logs each use with its route template, every
client moves, and the old one is deleted once its log has shown **one hour
with zero uses after the last client moved** (owner's decision, 2026-10-06; it
was seven days). Monitors and deploy checks never point at a version being
retired: a probe would count as a client.

**How a version is written.** One service per module and a presenter per
version (ADR 0023):

- out: the service returns the DOMAIN, in English (`*.domain.ts`, or the types
  next to the service); closed sets of words go through `common/vocabulary.ts`.
  `src/presenters/v2/*` builds the body; `contract/v2/shapes.spec.ts` ties the
  response classes to what the presenters build.
- in: the DTOs live in `dto/v2/` and the service takes English domain types
  (`NewAccount`, `TransactionRequest`, `DashboardFilters`…), never a DTO. Where
  the DTO already has the domain's shape the controller passes it as it is;
  where it does not (a bigint, a renamed field), the controller builds the
  input with `defined<Draft<T>>({ … })` (`common/defined.ts`): an absent field
  stays absent (never `undefined`) and a misspelt name does not compile.
- a list the service returns whole is cut with `paginate(items, query)`
  (`contract/v2/pagination.ts`); one the service already pages in SQL (the
  transactions, the admin lists) keeps its own meta.

**Why.** Two copies of the same logic drift: one learns a rule and the other
does not. With one service and a presenter per version, retiring a version is
deleting its controllers, DTOs, `contract/v<n>` and `presenters/v<n>` —which
is what 7.10 did with v1. `user-isolation.e2e-spec.ts` attacks every route,
and a route outside `/api/v2/` fails it.

## Feature flags

A flag exists to ship something dark or to a few users first, and it is
**deleted** when that rollout ends. It is not configuration.

- **Declare it** in `packages/flags/src/registry.ts`: snake_case name,
  description, owner and `removeBy` date. A name outside the registry does not
  compile, and the API refuses to start if `FEATURES` lists one.
- **Turn it on for everyone** with `FEATURES=flag_a,flag_b` in the API's
  environment (`api/.env.example`).
- **Turn it on (or off) for one user** with a `user_preferences` row, key
  `feature:<name>`, boolean value. It wins over `FEATURES` both ways. The
  preferences endpoint does not accept these keys: a user cannot set their own.
- **Read it** only through OpenFeature. API: `FlagsService.isEnabled`
  (`modules/flags`). Web: `useFlag` (`shared/api/flags.tsx`); OpenFeature
  lives in `flags-engine.ts`, loaded after the first paint to stay out of the
  initial bundle, and every flag reads off until it arrives — never import it
  statically. iOS: the `features` array of `GET /auth/me`. The
  clients read the list the API resolved; none decides on its own.
- **Remove it** by `removeBy`. CI (`scripts/ci/flags-expiry.mjs`) warns once
  the date passes and fails 30 days later. Moving the date needs a reason in
  the PR.

## Versioning

**Versions are never bumped by hand: release-please derives them from the
commits on `Dev` and the release is merging its PR.**

On every push to `Dev` (the deploy branch, D8), `release-please`
(`.github/workflows/release-please.yml`, `release-please-config.json`) reads
the Conventional Commits since the last tag and keeps one PR open, titled
`chore: release X.Y.Z`. That PR bumps the root `package.json`, records the
version in `.release-please-manifest.json` and writes `CHANGELOG.md`. Merging
it — through `scripts/merge.sh`, like any PR — tags `vX.Y.Z` and publishes the
GitHub release with the same notes.

- One version for the whole app (API, web and packages ship together); the
  tag carries no component name.
- While the version is `0.x`: `fix` and `perf` bump the patch, `feat` and a
  breaking change (`!` or a `BREAKING CHANGE:` footer) bump the minor.
- The CHANGELOG lists features, bug fixes, performance and reverts. `refactor`,
  `docs`, `test`, `build`, `ci`, `chore` and `style` stay out: they do not
  change what the app does. It is generated, so it is never edited by hand and
  Prettier skips it.

This is why commit messages are conventional and checked: the type of each
commit is what decides the next version and what the user-facing notes say. A
`fix` written as `chore` disappears from the CHANGELOG; a `feat` written as
`fix` ships a new capability as a patch.

**The token.** A PR opened with the workflow's `GITHUB_TOKEN` does not trigger
other workflows, so `ci.yml` would never run on the release PR and
`scripts/merge.sh` could not integrate it (D21). release-please therefore uses
a **fine-grained personal access token** stored as the repository secret
`RELEASE_PLEASE_TOKEN`: access to this repository only, permissions
**Contents: read and write** and **Pull requests: read and write**, with an
expiry date and a reminder to rotate it. The repository owner creates it (it
cannot be created from a workflow). The job is skipped, and bills nothing,
until the repository variable `RELEASE_PLEASE_ENABLED` is `true`: set it once
the token exists (`gh variable set RELEASE_PLEASE_ENABLED --body true`).

## Performance budgets

Step 7.9. The numbers, how each is checked, and whether it blocks.

| Budget                                         | Limit  | Checked by                                          | Blocks a PR |
| ---------------------------------------------- | ------ | --------------------------------------------------- | ----------- |
| Initial web bundle (entry JS + CSS + HTML, gz) | 200 kB | `npx size-limit` (`.size-limit.cjs`), CI job verify | **Yes**     |
| API p95, every measured endpoint, local        | 50 ms  | `node scripts/perf/api-bench.mjs`                   | No          |
| Lighthouse performance, mobile, median of 5    | 90     | `node scripts/perf/lighthouse.mjs`, workflow `perf` | No          |

- **Bundle.** Measured over exactly what `frontend/dist/index.html` loads
  before the first paint. A screen that is not the first paint goes in
  `app/router.tsx` with `lazy` (ADR 0018); a heavy library used after a click
  (`tesseract.js`, `pdfjs-dist`) is `import()`ed where it is used.
- **API.** The plan's ceiling is 300 ms; the baseline was ten times better, so
  the budget is the 50 ms floor proposed in the audit. Measure on a quiet
  machine: under load the numbers inflate. To compare a change with the code
  before it, build the old API elsewhere and point `COCO_BENCH_API_DIST` at
  it, alternating runs.
- **Lighthouse** is not a gate (D27): a score on a shared runner moves several
  points between runs. Run it by hand before merging anything that touches
  the first paint, or dispatch the `perf` workflow.

Both scripts boot the API in-process against a throwaway local database
(`coco_bench*`, refused otherwise) with a Supabase stub; nothing leaves the
machine and nothing is printed but timings:

```bash
bash scripts/perf/bench-db.sh create --long   # coco_dev copy + 20 years (or: synthetic)
npm run build --workspace api && npm run build --workspace frontend
node scripts/perf/api-bench.mjs
node scripts/perf/lighthouse.mjs              # installs lighthouse on first run
bash scripts/perf/bench-db.sh drop
```

An optimization goes in with its ADR and its numbers before and after.

## Journeys (Playwright)

The critical paths of the web, end to end, in `e2e/journeys/`: signing in
and out, registering an expense by hand and with a receipt, the concept
finder, editing and deleting a movement, pending payments (including a
concept paid in several instalments) and cost centres. Each runs in Chromium
twice: desktop and an iPhone viewport.

```bash
npm run e2e:build                # once, and after changing api/ or frontend/
npx playwright install chromium  # once per machine
npm run e2e                      # all of them; `-- --project mobile` for one viewport
```

- **Its own environment, never a real one.** `e2e/support/server.mjs`
  starts the compiled API, unchanged, serving the built SPA on one origin, as
  production does. Its database is `coco_e2e_pw_test` on the local Postgres
  (`E2E_DATABASE_URL` overrides it); the launcher refuses any database that
  is not local or whose name does not end in `_test`, creates it, migrates it
  and **empties it** on every start. Supabase Auth is a fake GoTrue on
  127.0.0.1 (`e2e/support/fake-gotrue.mjs`) that signs real ES256 tokens.
  The only thing switched off is the rate limiter's counter.
- **Every test has its own user**, registered, approved by the admin and
  seeded through the public API (`e2e/support/seed.ts`), never through
  SQL. No journey depends on another one or on the order.
- **Accessibility rides on the journeys** (D16): `expectAccessible(page, …)`
  runs axe on what is on screen and fails on `serious` or `critical`
  violations. The ones that exist today are listed in `EXCEPCIONES`
  (`e2e/support/axe.ts`), each with its reason; there is no other way to
  tolerate one, and fixing one means deleting its line.
- **Selectors are what a person sees**: roles and accessible names, never
  classes or file structure. A journey that breaks because a label changed is
  telling the truth.
- CI runs them in the `journeys` job of `ci.yml` on every pull request that
  touches `api/`, `frontend/`, `packages/`, `e2e/` or `scripts/db/` (or the
  lockfile, the workflows or a root config); on failure
  the HTML report and the traces are uploaded as an artifact.

## iOS

The app in `ios/` follows its own toolchain; `ios/README.md` has the folder
map. Local: `bash ios/scripts/lint.sh` and `xcodebuild test` (see the README).
CI: the `ios` workflow, **manual only** (`workflow_dispatch`): a macOS minute
counts as ten against the free plan's quota, so it runs before every app
release, and the hooks cover the routine at zero CI minutes.

- **Format: `swift-format`**, the Swift project's official formatter that
  ships with Xcode 16+, configured by `ios/.swift-format` (4 spaces, 120
  columns). It runs in `--strict` lint mode, so any difference fails.
- **Rules: SwiftLint, strict** (`strict: true`: every warning is an error),
  configured by `ios/.swiftlint.yml` and **pinned** (`swiftlint_version`):
  SwiftLint is still 0.x and a new release can add rules that break CI with
  no code change, so it is upgraded on purpose, in its own PR.
  `trailing_comma` and `opening_brace` are off because they are swift-format's
  job; tests (`ios/CocoTests/.swiftlint.yml`) only relax line length (one-line
  JSON fixtures) and type and file length (a test class is a list of cases).
  An inline `swiftlint:disable:next` names the rule and says why above it.
- **The hooks.** `6_lint-ios` (pre-commit) lints commits that touch
  `ios/**/*.swift`. `ios` (pre-push, `ios/scripts/pre-push.sh`) runs
  `swift-format lint --strict` and `xcodebuild test` on the newest iPhone
  simulator when the push carries changes under `ios/`: that is the routine
  gate, since the workflow is manual. Without Xcode, or with another SwiftLint
  version, both warn and let the change through: someone working only on the
  web must not be blocked.
- **Swift 6 language mode** (`SWIFT_VERSION` in `project.yml`): data races
  are compile errors. No `@unchecked Sendable` or `nonisolated(unsafe)`
  without a comment saying why it is safe; shared state goes in an actor or
  an `OSAllocatedUnfairLock`, and test doubles live in `CocoTests`, never in
  the app.
- **The capture queue never swallows an error.** No `try?` on the queue's
  disk: a failure is logged (`AppLog.queue`, the step and the error type,
  never the capture) and shown in Captures. The queue lives in
  `Application Support`, never in the temporary directory. Its budget is a
  hard limit: cancellation reaches the request in flight and the capture
  stays queued as it was. A 2xx whose body cannot be read is `unconfirmed`
  ("done, check it"), never retried. Every queue file carries `version`; one
  that cannot be read goes to `Queue/Quarantine`, intact, and is counted on
  screen.
- **Structure by feature**: `Coco/Features/<Feature>` holds everything for one
  thing a person does; `Coco/Core` is infrastructure (networking, storage,
  Keychain, background tasks, domain contracts); `Coco/Shared` is common UI
  and formatting. `CocoTests` mirrors the same tree.
- **Every identifier in English**, with no compatibility exceptions (ADR
  0002): files, types, members, App Intents and their `@Parameter`s, the
  `CocoWidgets` target and its `kind`s, background task identifiers,
  UserDefaults and Keychain keys, folders and on-disk JSON keys. Text the
  person sees stays in Spanish, including Shortcuts and Siri phrases and
  titles.
- **The app talks only to `/api/v2`**: its JSON keys live in `CodingKeys`
  (and in `CaptureRequest`/`InterpretRequest` for what the app sends),
  pinned by `APIKeysTests`. Never encode an on-disk type straight into a
  request body: translate at the edge, so a contract change is not a queue
  migration.
- **What stays in Spanish without being user text** is a contract with
  something outside `ios/`: the names of the web bridge messages.
- **On-disk formats** use synthesized keys (the property names);
  `StoredFormatTests` pins them along with folders, UserDefaults and Keychain
  keys and task identifiers. Renaming a stored property is a migration, not a
  refactor.
- **`async/await`** across the network layer, **typed errors per domain**
  (`APIError`, `SessionError`, `QueueError`, `KeychainError`,
  `ParameterError`) and **no force-unwrap or `try!` outside tests**
  (`force_unwrapping`, `force_try`).

```swift
// Correct
guard let url = URL(string: "coco://capture/\(destination)") else {
    preconditionFailure("URL de captura inválida para el destino «\(destination)»")
}

// Incorrect — SwiftLint fails on force_unwrapping
let url = URL(string: "coco://capture/\(destination)")!
```
