# Phase 7 audit (step 7.1, Part B)

Date: 2026-10-05. Branch `docs/phase-6-report` at `12245fa`. Nothing in the source tree was changed to produce this audit.

The targets here are the **default decisions** in `docs/plan-completo.md` §7.2–7.13. If Part A (`decisions.md`) changes a decision, the rows it affects get re-scored at the 7.1 stop.

Gap legend:
- **OK**: complies
- **PARTIAL**: partly complies
- **NO**: does not comply
- **BREAKING**: the fix changes something persisted or something that crosses a process boundary

The complete machine-readable rename map is in [`rename-map.json`](./rename-map.json). §2 summarizes it.

---

## 1. Findings per area

### 7.2 Naming

| Point | Today | Target | Gap | Evidence | Step |
|---|---|---|---|---|---|
| File/folder case | Every tracked file under `api/src` and `frontend/src` is kebab-case. iOS uses PascalCase Swift files, which is the Swift convention. | kebab-case | OK (TS) | `git ls-files … \| grep -vE '^[a-z0-9./_-]+$'` returns 0 lines | — |
| File/folder **language** | 249 files and 16 folders have Spanish names: api 38, frontend 96, iOS 89, packages/lectura 7, scripts 19 | English | NO | `rename-map.json#files`. Examples: `movimiento-modal.tsx`, `modules/soportes/`, `features/centros/`, `ios/Coco/Cola/` | 7.2 |
| Nest role suffixes | 5 modules keep their controller and service inside `*.module.ts`: `dashboard` (709 lines), `admin`, `tags`, `preferences`, `categorization`. Same for `interpretacion`. Only 2 `*.repository.ts` files exist. | `.controller/.service/.repository/.dto/.module` | PARTIAL | `grep @Controller api/src` | 7.2 / 7.4 |
| Test placement | Unit tests sit next to the code they test (api `*.spec.ts`, web `*.test.ts(x)`). E2E files are `api/test/*.e2e-spec.ts`. | `api/test/e2e/*.e2e.ts` | PARTIAL | 14 files in `api/test/` | 7.2 |
| One component per file | Several files export many components. Examples: `components/soportes.tsx` (1541 lines: `Soportes`, `Pase`, `PreviaDeArchivo`…) and `ui/modal-partes.tsx`. | One component per file | NO | §4 inventory | 7.4 |
| Barrels | Only `packages/*/src/index.ts` | Only package entry points | OK | `git ls-files \| grep index.ts` | — |
| Identifier language | Unique Spanish identifiers (declarations, params, props): api/src 479, api/test 122, frontend 635, lectura 106, types 59. Exported/public ones: **631**. | English | NO | Top files: `movimiento-modal.tsx` 60, `packages/types` 59, `dashboard.module.ts` 51, `lectura/clasificar.ts` 46, `categories.service.ts` 45, `lib/queries.ts` 44 | 7.2 |
| Comments language | Lines/blocks with Spanish comments: api 739, api/test 181, web 1710, lectura 97, types 65, Swift ≈359 | English | NO | heuristic count of Spanish function words | 7.2 |
| Case conventions | Mostly correct. UPPER_SNAKE constants are used. | camel/Pascal/UPPER | OK | — | 7.5 lint |
| Boolean prefixes | DB and JSON: `recurrente`, `estatico`, `pago_automatico`, `varios_pagos`, `por_revisar`, `disponible`, `repetido`, `fusionado` have no prefix | `is*/has*/needs*` | NO, BREAKING | schema.prisma:396–462, 575 | 7.2 + 7.10 |
| TS `enum`, `I` prefix, `Type` suffix | 0 TS enums; 1 `…Type` alias | Literal unions | OK | grep | — |
| Default exports | 0 in `api/src` and `frontend/src`, outside config | None | OK | grep | — |
| Tables plural snake_case | 13 tables. `audit_log` is singular, and `soportes` is Spanish. | Plural English | NO, BREAKING | DB catalog | 7.10 |
| Columns | snake_case everywhere. 9 Spanish columns in `categories`, 1 in `transactions`, 4 in `soportes`. | English | NO, BREAKING | `rename-map.json#columns` | 7.10 |
| `created_at` + `updated_at`, `timestamptz` | Only 4 of 13 tables have both columns: `accounts`, `transactions`, `users`, `import_batches`. Every timestamp column is `timestamp(3)` without time zone. The one exception is `transactions.captured_at`, which is `timestamptz`. | All tables, `timestamptz NOT NULL` | NO, BREAKING (type change) | `information_schema.columns` | 7.2 (additive) + 7.10 (type) |
| Constraint and index names | FKs and indexes have custom but inconsistent names (`fk_tx_user`, `idx_audit_entity`, `fk_tt_tag`). The 13 PKs still use Prisma defaults (`<table>_pkey`). The 6 `ck_categories_*` checks already conform. | `pk_/fk_<t>_<col>/uq_/ck_/idx_<t>_<cols>` | PARTIAL | 63 renames in `rename-map.json#constraints` | 7.2 (no data impact) |
| Postgres enums | `Periodicidad` has Spanish values. All 12 enum *type* names are PascalCase. | English snake_case values and type names | NO, BREAKING | `pg_enum` | 7.10 |
| Migration names | 17 migrations. 11 are Spanish (`periodo`, `mes_de_pago`, `varios_pagos_en_conceptos`…). The last 2 are English. There is also an archived folder `prisma/migraciones-mysql-archivadas/`. | `YYYYMMDDHHMMSS_<verb>_<object>` English | PARTIAL | `ls api/prisma/migrations` | Applied migrations **must not be renamed**: Prisma keys `_prisma_migrations` on the folder name. Apply the rule to new migrations only. |
| API routes | 63 handlers. Spanish segments: `/transactions/historia`, `/transactions/:id/soportes[/:soporteId]`, `/categories/:id/usos`, `/categories/:id/unificar`. There are also verb routes (`capture`, `interpret`, `transfer`, `seed`, `reorder`, `suggest`, `learn`, admin actions). | Plural nouns, no verbs | NO, BREAKING | `rename-map.json#routes`, `#verbRoutesKept` | 7.10 |
| JSON field casing | **All** request and response JSON is snake_case: `per_page`, `created_at`, `category_id`… | camelCase | NO, BREAKING (whole contract) | `packages/types/src/index.ts` | 7.4 (OpenAPI) + 7.10 under `/api/v2` |
| Spanish JSON fields and values | 37 Spanish field names and 21 Spanish literal values (`periodicidad: "mensual"`, `breakdown_level: "centro de costos"`, `granularity: "dia"`, `certeza: "alta"`…) | English | NO, BREAKING | `#jsonFields`, `#jsonValues` | 7.10 |
| Automated check | none | naming-convention, check-file, Spanish-identifier script | NO | no `.github/`, no such rules | 7.2 / 7.5 |

### 7.3 User-facing text

| Point | Today | Gap | Evidence | Step |
|---|---|---|---|---|
| Central locale file | No `frontend/src/locales/` and no `Localizable.xcstrings` | NO | `ls` | 7.3 |
| Literals in JSX | 191 JSX text nodes plus 94 literal text attributes (`placeholder`, `title`, `aria-label`, …) across 40 of 69 `.tsx` files. Swift has about 58 `Text("…")`/`Label`/`Button` literals. | NO | AST count (`scratchpad/audit/jsx.cjs`) | 7.3 |
| Single Intl module (`es-CO`) | Intl is used in 2 files (`lib/utils.ts`, `features/admin/bitacora-page.tsx`). Dates go through `lib/fechas.ts`. | PARTIAL | grep `Intl.` | 7.3 |
| API error messages | User-facing Spanish text lives in the API: the `check-constraints.ts` messages and exception texts. | PARTIAL | `common/filters/check-constraints.ts` | 7.3 (decide whether the API returns codes or text) |
| Lint `react/jsx-no-literals` | absent | NO | — | 7.3 |

### 7.4 Architecture

| Point | Today | Gap | Evidence | Step |
|---|---|---|---|---|
| One module per resource with controller/service/repository/dto | 13 modules. Repositories exist only in `accounts` and `categories`. | PARTIAL | §1 7.2 | 7.4 |
| Only repositories talk to Prisma | **15 non-repository files** import `PrismaService`: services, `*.module.ts` files, `health.controller.ts`, `jwt-auth.guard.ts`, `audit.service.ts`, `dashboard/pagos-automaticos.ts`, `auto-charge.task.ts`, `categories.plantilla.ts`. | NO | grep `PrismaService` | 7.4 |
| `common/` never imports `modules/` | 1 violation: `common/guards/jwt-auth.guard.ts:12` imports `modules/auth/supabase-auth.service` | NO | grep | 7.4 |
| Env validation with one schema (zod) | Hand-written checks in `common/entorno.ts` (`leerDelEntorno`, `porQueNoArrancar`). zod is not an API dependency. | PARTIAL | entorno.ts:30–114 | 7.4 |
| Error hierarchy, single filter | A single `@Catch()` filter exists (`all-exceptions.filter.ts`) and emits `{error:{code,message,details}}`. There is no `DomainError` hierarchy: services throw Nest `HttpException` subclasses. | PARTIAL | — | 7.4 |
| Cursor pagination `{data, meta:{nextCursor}}` | Offset pagination `{data, meta:{page, per_page, total}}` | NO, BREAKING | `PaginationMeta` in types | 7.4 / v2 |
| Web layering `app/ → features/ → shared/` | `app/`, `features/` (8), `components/` (39 files), `lib/` (40). There is no `shared/`. | PARTIAL | tree | 7.4 |
| Features do not import each other | **4** cross-feature imports: admin→auth, cuenta→auth, dashboard→transactions, transactions→categorization. `components/` and `lib/` do not import features (only `app/` does). | NO | grep `@/features/` | 7.4 |
| React Query hooks inside features | All hooks are centralized in `lib/queries.ts` (459 lines). 5 `components/` files use query hooks directly. | NO | grep | 7.4 |
| 300 lines/file, 50 lines/function | 46 files over 300 lines (§4). 115 production functions over 50 lines. | NO | §4 | 7.4 |
| OpenAPI contract, `packages/types` removed | No `@nestjs/swagger`. `packages/types` (680 lines) is hand-written. | NO | package.json | 7.4 |
| Prisma 7 | `prisma` and `@prisma/client` **6.19.3**, generator `prisma-client-js` with preview `driverAdapters`. `api/package.json` declares `@prisma/adapter-pg ^7.10.0` next to client ^6, a mismatch worth checking. There is no `prisma.config.ts`. | NO | `api/package.json`, schema.prisma:1–4 | 7.4 |
| `packages/lectura` → `packages/receipt-parser` | `@coco/lectura` is pure TS. It has **no tests of its own**: its tests live in `frontend/src/lib/*.test.ts`. | NO (rename) | ls | 7.4 |
| dependency-cruiser, max-lines | absent | NO | — | 7.4 |

### 7.5 Code quality

| Point | Today | Gap | Evidence | Step |
|---|---|---|---|---|
| Single root `eslint.config.js` | 4 per-workspace configs: `api`, `frontend`, `packages/types`, `packages/lectura`. None at the root. | NO | `ls` | 7.5 |
| Preset | `tseslint.configs.recommendedTypeChecked` everywhere, with `no-floating-promises` and `no-misused-promises` as errors. Five `no-unsafe-*` rules are **turned off** in a test override in api and frontend. Frontend also uses `react-hooks` recommended. There is no `strict-type-checked`, `stylistic`, `react`, `jsx-a11y`, `import-x` or `check-file`. | PARTIAL | api/eslint.config.js:36–57, frontend/eslint.config.js:109–132 | 7.5 |
| Prettier as the only formatter | Prettier is installed in api and frontend with default options. There is no config file and no root format script. | PARTIAL | — | 7.5 |
| `.editorconfig`, `knip`, `lefthook`, `commitlint`, `lint-staged` | all absent | NO | `ls` | 7.5 |
| TS flags | `strict` is on everywhere. `noImplicitOverride` is set in api, types and lectura but **not frontend**. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are **absent everywhere**. | PARTIAL | tsconfig.json ×4 | 7.5 (expect many errors when enabled) |
| `any` / `@ts-ignore` | 0 explicit `any`, 0 `@ts-ignore`/`@ts-expect-error`, 7 `eslint-disable` | OK | grep | — |
| Conventional Commits | 240 of 241 commits follow the format. Only about 18 of the last 100 have a workspace scope. 71 of the last 100 subjects are Spanish. | PARTIAL | `git log` | 7.5 |

### 7.6 Git and CI/CD

| Point | Today | Gap | Evidence | Step |
|---|---|---|---|---|
| Trunk-based, `main` only | `Dev` exists and is the integration branch. There are 20 local branches and many stale remote branches (`fase-0…5`, `paso-react-hooks`…). Hostinger deploys via `scripts/desplegar-*.sh` (rsync/ssh), not from `main`. | NO | `git branch -a` | 7.6 |
| Ruleset / compensating controls | none; no `scripts/merge.sh` | NO | — | 7.6 |
| CI (`.github/workflows`) | **no `.github/` directory at all**: no CI, no Dependabot, no gitleaks | NO | `ls` | 7.6 |
| release-please / CHANGELOG | absent | NO | — | 7.6 |
| PR and issue templates | absent | NO | — | 7.6 |

### 7.7 Tests

| Workspace | Files | Cases | Coverage |
|---|---|---|---|
| api unit (`jest`, `src/**/*.spec.ts`) | 29 | **346 pass** | **lines 40.5 %**, branches 37.7 %, functions 32.2 %, statements 41.1 % (`npx jest --coverage`) |
| api e2e (`test/*.e2e-spec.ts`, against `coco_test`) | 14 | ≈185 `it` | not measured (it shares the DB with other runs) |
| frontend (`vitest`) | 49 | **412 pass** | **not measurable**: `@vitest/coverage-v8` is not installed |
| packages/lectura, packages/types | 0 | 0 | — (lectura is covered indirectly by frontend tests) |
| iOS (`CocoTests`) | 28 | ≈188 `func test…` | not measured |

Gaps against the targets:

| Point | Gap | Notes | Step |
|---|---|---|---|
| Coverage of 80 % api/packages and 70 % web | NO | The api config excludes `**/*.module.ts`, so `dashboard.module.ts` (709 lines of logic), `admin`, `tags`, `preferences` and `categorization` are invisible to coverage. The real figure is lower. The only threshold is 90 % on `common/money/`. | 7.7 |
| Playwright journeys | NO | none | 7.7 |
| Factories | PARTIAL | `crearUsuario` helper only | 7.7 |
| Prisma mocks | PARTIAL | not audited exhaustively; e2e tests use a real Postgres | 7.7 |
| Design-rule tests are kept | OK | `button.llamadas`, `radio`, `superficie`, `cabecera-de-pagina`, `foco`, `campo` | 7.7 |
| `it` names in English, present tense | NO | most are Spanish | 7.7 |

### 7.8 Feature flags

There is no flag system, no OpenFeature dependency and no `packages/flags`. The only server toggles are env vars (`SOPORTES_STORAGE`, `CHECK_BREACHED_PASSWORDS`). `/auth/me` returns no flags.

**Gap: NO. Step: 7.8.**

### 7.9 Performance (baseline)

See §3. All three budgets currently pass in absolute terms except the bundle, which is just over:
- API p95 ≤ 300 ms: OK
- Bundle ≤ 200 kB gzip: entry ≈ 206 KB including CSS and HTML; the JS alone is 192 KB
- Lighthouse ≥ 90: borderline, at 88–94

No `size-limit` and no Lighthouse CI exist.

**Gap: PARTIAL. Step: 7.9.**

### 7.10 Expand/contract

The breaking inventory is in §2. Nothing is in flight: there is no dual-write and no `Deprecation` header. Phase 6 left these for the final contract step:
- the `import_batches` and `import_rows` tables (their endpoints are already removed)
- receipt files on the server disk

**Gap: N/A (procedure). Step: 7.10.**

### 7.11 Security and operations

| Point | Today | Gap | Evidence | Step |
|---|---|---|---|---|
| RLS with an `app` role | API connects as the owner. 0 `ENABLE ROW LEVEL SECURITY` and 0 policies in migrations. Isolation relies on the e2e `user-isolation` test only. | NO | grep migrations | 7.11 |
| `user_id` index on every user table | Most have one. `tags` is covered only by `uq_tags_user_name` and `uq_tags_user_name_ci`. `user_preferences` is covered by `uq_pref_user_key`. | OK-ish | catalog | 7.11 |
| Validated env, `.env.example` | Hand-written validation exists. `api/.env.example`, `api/.env.migrate.example` and `frontend/.env.example` are tracked. | PARTIAL | — | 7.4 / 7.11 |
| gitleaks | none | NO | — | 7.6 |
| helmet, CORS, throttling | Present: `bootstrap.ts`, `@nestjs/throttler`, `rate-limit.e2e-spec.ts` | OK (needs docs) | — | 7.12 |
| Structured logs with request id | Present from phase 6 (8 request-id references). No log call found that interpolates amount or email. There is no test asserting that. | PARTIAL | grep | 7.11 |
| `/health` and `/ready` | A single public `/health` checks the DB. There is no `/ready`. | PARTIAL | health.controller.ts | 7.11 |
| Secrets hygiene note | `api/.env.migrate` (untracked) holds Supabase service-role and access tokens next to local DB URLs. It is not a leak, but it is a sharp edge. | — | — | 7.11 runbook |

### 7.12 Documentation

| File | State | Gap |
|---|---|---|
| `README.md` | Exists, 441 lines, Spanish | PARTIAL |
| `docs/architecture.md`, `docs/adr/`, `docs/runbook.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, OpenAPI | none exist | NO |
| `ios/README.md` | Exists | PARTIAL (review) |
| Root `CLAUDE.md` | 606 lines, Spanish, UI rules only. Its table of contents lists 17 rules but the body has 18, so numbering is off from §12. There is no `.claude/rules/`. | NO (target < 200 lines plus per-zone rules) |
| Other docs | `docs/` has Spanish working docs (`plan-completo.md`, `registro-autonomo.md`…). Root `AUDITORIA_RESPUESTAS.md`. | Keep as history or move to `docs/archive/` |

### 7.13 iOS

| Point | Today | Gap | Evidence | Step |
|---|---|---|---|---|
| swift-format and SwiftLint | no `.swift-format`, no `.swiftlint.yml` | NO | `ls ios` | 7.13 |
| Feature structure (`Features/`, `Core/`, `Shared/`) | Folders are by layer, in Spanish: `App`, `Arbol`, `Avisos`, `Bienvenida`, `Captura`, `Cola`, `Dominio`, `Intents`, `Red`, `SegundoPlano`, `Sesion`, `Web`. There is also a `CocoAccesos` widget target. | NO | `project.yml` | 7.13 (folder moves in `rename-map.json` are superseded by the feature layout) |
| async/await, no force unwrap | Networking is async. The heuristic grep finds 0 force unwraps and 0 `try!`/`as!` outside tests. 4 callback/`DispatchQueue` uses remain. | OK-ish | grep | 7.13 |
| Tests without network | 28 test files use stub transports (`TransporteFalso`). | OK | — | — |
| Localization (`Localizable.xcstrings`) | none; about 58 UI literals | NO | — | 7.3 / 7.13 |
| Spanish type/file names | 166 public Swift identifiers and 89 files | NO | `rename-map.json` | 7.2 |

---

## 2. Rename map (summary of `rename-map.json`)

"Breaking" means the item is persisted or crosses a process boundary (DB, HTTP, the WKWebView bridge, deployed env, device storage). Everything else is a compile-time rename.

| Category | Entries | Breaking | Consumers / notes |
|---|---|---|---|
| tables | 4 | 4 | `soportes→receipts`, `audit_log→audit_logs`. The two `import_*` tables are **dropped** in 7.10, not renamed. |
| columns | 17 | 17 | `categories`: `recurrente→is_recurring`, `periodicidad→periodicity`, `dia_de_pago→payment_day`, `mes_de_pago→payment_month`, `estatico→is_static`, `palabras_clave→keywords`, `presupuesto→budget`, `pago_automatico→is_auto_paid`, `varios_pagos→is_multi_payment`. `transactions.por_revisar→needs_review`. `soportes`: `orden→position`, `nombre_archivo→file_name`, `tamano→size_bytes`, `huella→content_hash`. Optional: `changes_json→changes`, `pref_key/pref_value→key/value`. The `ck_categories_*` CHECKs reference these columns and must be recreated. |
| enum types | 12 | 12 (DB only) | `Periodicidad→periodicity`. The other 11 type names change only from PascalCase to snake_case. |
| enum values | 5 | 5 | `mensual/bimestral/trimestral/semestral/anual → monthly/bimonthly/quarterly/semiannual/annual`. Consumers: api, web, CHECK constraint. |
| timestamptz conversions | 14 | 14 (type) | api only |
| missing timestamps (additive) | 13 | 0 | `tags`, `transaction_splits`, `transaction_tags`, `user_preferences` (both columns); `categories`, `category_rules`, `soportes` (`updated_at`); `audit_log` (append-only: document as an exception) |
| constraints/indexes | 63 | 0 | 13 PKs, 24 FKs, 26 idx/uq. DB-internal. `check-constraints.ts` maps `ck_*` names, which don't change. |
| API routes | 9 | 9 | `historia→history` (web); `soportes→receipts` ×4 (web; POST also iOS); `usos→usage` (web); `unificar→merge` (web); multipart `archivos→files` (web, iOS); header `x-coco-cliente: nativo → x-coco-client: native` (iOS) |
| verb routes kept as actions | 9 | — | `capture`, `interpret`, `transfer`, `seed`, `reorder`, `suggest`, `learn`, admin actions, auth. Document them as the allowed exception. |
| JSON field names | 83 | 83 | 37 Spanish fields plus 46 snake→camel. iOS consumes the auth, capture/interpret, categories-tree and receipts fields. Web consumes all. Do this under `/api/v2` (7.2 rule), not hot. |
| JSON literal values | 21 | 21 | periodicity, `breakdown_level`, granularity, `certeza`/`fuente` (iOS switches on `"alta"`/`"media"` in `RellenoDelFormulario.swift:46`), suggestion reason, the stored pref key `cuentas_habilitadas` |
| WKWebView bridge | 12 | 12 | handler names `cocoSesion/cocoEventos`, `tipo`, event names, `window.__coco.{ir,abrirBusqueda,recibirSesion,sesionCerrada}`. Web and iOS must ship together. A rolling window is safe because iOS reinstalls every 7 days, but the web deploys first and must accept both names. |
| SPA routes | 8 | 8 | `/centros-de-costos→/cost-centers`, `/mi-cuenta→/account`, `/administracion→/admin` (iOS `MasView` deep-links all three), `/entrar`, `/registro`, `/cuentas`, `/administracion/bitacora`, and the legacy `/categorias` redirect |
| env vars | 5 | 5 | `SOPORTES_{STORAGE,DIR,BUCKET}→RECEIPTS_*`, `PERMITIR_BASE_REMOTA→ALLOW_REMOTE_DATABASE`, `PERMITIR_AUTH_DESTRUCTIVA→ALLOW_DESTRUCTIVE_AUTH`. Hostinger panel, `.env*`, scripts. Read both names during the transition. |
| client storage keys | 4 | 4 | web `sidenav-plegada`; iOS UserDefaults `bienvenida-vista`, `permiso-de-avisos-pedido`, `co.loatech.coco.conceptosRecientes` (migrate on launch) |
| packages / npm scripts | 8 | 0 | `@coco/lectura→@coco/receipt-parser`, `@coco/types` removed; `sembrar:local`, `respaldar`, `cargar`, `soportes:*` |
| files | 249 | 0 | 16 folders, including `modules/interpretacion→interpretation`, `modules/soportes→receipts`, `features/centros→cost-centers`, `features/cuenta→account-settings`, `pruebas→test`, `packages/lectura→receipt-parser`, iOS folders. **Applied migration folders are excluded** on purpose. |
| public identifiers | 631 | 0 | api 161, web 225, iOS 166, lectura 54, types 25 |
| **Total** | **1,158** | **≈ 200** | |

Glossary applied throughout:
- movimiento → transaction
- soporte → receipt
- centro de costos → cost center
- categoría → category
- concepto → concept
- periodicidad → periodicity
- varios pagos → multi-payment
- pago automático → auto-pay / `is_auto_paid`
- por revisar → needs review
- bitácora → audit log
- atajo → shortcut
- aviso → notice
- puente → bridge
- cola → queue
- llavero → keychain
- doble (test) → stub

The file and identifier names were machine-translated (`scratchpad/audit/translate.mjs`) and then hand-corrected. Each 7.2 sub-step re-reviews its own slice. Six target names repeat across different files or languages (for example `ApiError` in TS and in Swift). That is acceptable because they live in separate modules, but review them.

---

## 3. Baseline measurements (7.9)

### API latency

**Environment:**
- Local Postgres, throwaway DB `coco_bench` (`CREATE DATABASE coco_bench TEMPLATE coco_dev`), dropped afterwards.
- The API was built (`cd api && npm run build`) and booted in-process exactly as `test/helpers/app.ts` does it: Nest testing module, `configureApp`, an in-memory fake Supabase auth, and a throttler store that never blocks. **No remote calls** were made.
- 20 warmup requests, then 200 sequential requests (concurrency 1), timed with `performance.now()`.
- Scripts: `scratchpad/perf/bench.cjs`, `run.sh`, `enlarge.sql`.

**Data:**
- **409 transactions** (2022-01 to 2026-10, 30 categories), which is coco_dev as-is.
- **2,045 transactions**: the same data plus 4 copies shifted back 5, 10, 15 and 20 years.

| Endpoint (ms p50 / p95 / p99 / mean) | 409 rows | 2,045 rows |
|---|---|---|
| GET `/api/v1/dashboard` (current month) | 3.8 / 5.3 / 6.0 / 4.1 | **9.1 / 10.8 / 11.3 / 9.1** |
| GET `/api/v1/dashboard?from=2000-01-01&to=2026-12-31` | 9.1 / 10.5 / 11.8 / 9.1 | 27.9 / 29.8 / 30.3 / 27.8 |
| GET `/api/v1/transactions?page=1&per_page=25&sort=-date` | 1.7 / 2.0 / 3.2 / 1.8 | **1.8 / 2.7 / 3.2 / 1.9** |
| GET `/api/v1/transactions?per_page=200` (106 KB) | 5.5 / 7.1 / 8.1 / 5.7 | 5.8 / 7.1 / 8.2 / 5.8 |
| POST `/api/v1/transactions/capture` (manual body) | 2.8 / 3.1 / 3.3 / 2.8 | **2.9 / 3.4 / 5.0 / 3.0** |
| POST `/api/v1/transactions/capture` (SMS text) | 4.5 / 5.2 / 6.3 / 4.6 | 4.5 / 5.6 / 6.4 / 4.6 |

**Finding:** the current-month dashboard is **2.4× slower** on the larger history even though the month itself is identical. `DashboardService.resumen` loads the *entire* history of every recurring concept with no lower date bound (`api/src/modules/dashboard/dashboard.module.ts:517`, `transaction.findMany({ categoryId in recurrentes, period < mesEnCurso })`) and aggregates it in JS. Cost grows linearly with years of data. This is the first optimization candidate for 7.9. No N+1 pattern was observed.

### Frontend bundle

Command: `cd frontend && npm run build`. Sizes from `gzip -c | wc -c`.

**Initial load:**

| File | gzip |
|---|---|
| entry `assets/index-CWO259io.js` | 192,322 B |
| `index-CWMwJwxS.css` | 12,879 B |
| `index.html` | 697 B |
| **Total** | **≈ 206 KB** |

There are no modulepreloads. A Google Fonts stylesheet is render-blocking.

**Largest lazy assets:**
- tesseract core wasm.js: about 1.46 MB gzip each, in 3 variants
- `pdf.worker`: 475 KB
- `pdf` chunk: 142 KB

**tesseract.js is lazy.** It lives in a 6.8 KB dynamic chunk and fetches its worker and wasm from `/tesseract` at runtime.

**Total of all JS/CSS in `dist`:** 18.5 MB gzip. About 13 MB of that is **stray duplicates** in the gitignored `frontend/public/tesseract/` (`worker.min 2.js`, `… 3.js`, `… 4.js`, likely Finder/iCloud copies). They are copied into `dist` and would ship with `desplegar-frontend.sh`. Without them the total is about 5.2 MB.

### Lighthouse

Lighthouse 12.8.2, mobile, performance category only, headless Chrome, 3 runs each, against `vite preview` proxying `/api` to the bench API. Throttling is simulated.

| Page | Scores | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|
| Login (`/`, no session) | **90 / 94 / 94** | 2.4 s | 2.6–3.2 s | 0–10 ms | 0 |
| Dashboard (session via refresh cookie, 2,045-row DB) | **92 / 88 / 92** | 2.3–2.4 s | 2.9–3.5 s | ≤ 20 ms | 0 |
| Transaction sheet | **not measured** | | | | |

The transaction sheet is a modal opened by a click and has no URL of its own, so measuring it needs a scripted Lighthouse user flow. Add that in 7.9 together with Lighthouse CI.

**Implication for budgets:**
- API p95 is far under 300 ms. Per the plan, the budget becomes the baseline minus 10 % margin. With single-digit ms numbers that is noisy, so propose a floor (for example 50 ms p95 locally) in `decisions.md`.
- The entry bundle (≈ 206 KB) already exceeds the 200 KB budget.
- Lighthouse sits right at the 90 line.

---

## 4. Inventory for later steps

### Files over 300 lines (46)

Production code:

| Lines | File |
|---|---|
| 1809 | `frontend/src/features/transactions/movimiento-modal.tsx` |
| 1541 | `frontend/src/components/soportes.tsx` |
| 1161 | `frontend/src/index.css` |
| 723 | `frontend/src/features/centros/centros-page.tsx` |
| 709 | `api/src/modules/dashboard/dashboard.module.ts` |
| 680 | `packages/types/src/index.ts` |
| 675 | `frontend/src/features/dashboard/dashboard-page.tsx` |
| 569 | `frontend/src/components/tendencia.tsx` |
| 562 | `api/src/modules/transactions/transactions.service.ts` |
| 482 | `frontend/src/app/app-shell.tsx` |
| 467 | `frontend/src/components/selector-de-fecha.tsx` |
| 459 | `frontend/src/lib/queries.ts` |
| 433 | `frontend/src/components/menu.tsx` |
| 426 | `frontend/src/components/buscador-de-concepto.tsx` |
| 424 | `api/src/modules/categories/categories.service.ts` |
| 423 | `api/src/modules/interpretacion/interpretacion.service.ts` |
| 421 | `packages/lectura/src/clasificar.ts` |
| 421 | `api/src/modules/auth/auth.service.ts` |
| 411 | `frontend/src/components/toolbar-filtros.tsx` |
| 408 | `frontend/src/components/atajos.tsx` |
| 401 | `frontend/src/components/dona.tsx` |
| 385 | `api/src/modules/admin/admin.module.ts` |
| 384 | `frontend/src/components/navegacion.tsx` |
| 383 | `frontend/src/components/campos-de-recurrencia.tsx` |
| 374 | `frontend/src/features/centros/concepto-modal.tsx` |
| 359 | `api/src/modules/soportes/soportes.service.ts` |
| 348 | `packages/lectura/src/firmas.ts` |
| 343 | `ios/Coco/Cola/ColaDeCapturas.swift` |
| 343 | `api/src/modules/categories/dto/category.dto.ts` |
| 342 | `frontend/src/components/pagos-pendientes.tsx` |
| 339 | `api/src/modules/auth/supabase-auth.service.ts` |
| 336 | `api/src/modules/transactions/dto/transaction.dto.ts` |
| 335 | `frontend/src/lib/session.ts` |
| 334 | `frontend/src/features/admin/usuarios-page.tsx` |
| 330 | `ios/Coco/Web/PuenteWeb.swift` |
| 329 | `api/src/modules/soportes/soportes.optimizacion.ts` |
| 314 | `frontend/src/components/ui/combo.tsx` |
| 306 | `frontend/src/components/tabla-de-movimientos.tsx` |

Tests:

| Lines | File |
|---|---|
| 1238 | `api/test/nucleo.e2e-spec.ts` |
| 591 | `api/test/auth.e2e-spec.ts` |
| 549 | `api/test/user-isolation.e2e-spec.ts` |
| 516 | `frontend/src/features/transactions/movimiento-modal.dom.test.tsx` |
| 434 | `api/test/soportes.e2e-spec.ts` |
| 399 | `ios/CocoTests/ColaDeCapturasTests.swift` |
| 331 | `api/src/modules/dashboard/pendientes.spec.ts` |
| 325 | `ios/CocoTests/SesionNativaTests.swift` |

Proposed policy: test files and `index.css` get a documented exception, or a higher limit, in 7.4.

### Functions over 50 lines (TS AST)

199 in total: **115 in production code** and 84 in tests (mostly `describe` callbacks). Nested functions are counted separately, so the totals are approximate.

Top 15:

| Lines | Function |
|---|---|
| 1124 | `MovimientoModal` (`movimiento-modal.tsx:101`) |
| 452 | `resumen` (`dashboard.module.ts:216`) |
| 404 | `DashboardPage` |
| 361 | `AppShell` |
| 326 | `ConceptoModal` |
| 313 | `PagosPendientes` |
| 307 | `Menu` |
| 298 | `PreviaDeArchivo` (`soportes.tsx:1241`) |
| 294 | `ToolbarFiltros` |
| 279 | `Tendencia` |
| 276 | `Soportes` |
| 239 | `Pase` (`soportes.tsx:753`) |
| 230 | `Centro` (`centros-page.tsx:195`) |
| 212 | `useSuperficieDeAtajos` |
| 209 | `CamposDeRecurrencia` |

### ESLint per workspace

All four configs are flat configs using `recommendedTypeChecked` plus `eslint-config-prettier`:
- **api**: adds `no-floating-promises` and `no-misused-promises` as errors, and turns off the `no-unsafe-*` rules for tests.
- **frontend**: the same, plus `react-hooks` recommended.
- **packages/types** and **packages/lectura**: base only.

Lint runs with `--max-warnings 0` in api.

### TypeScript strictness

| Flag | api | frontend | types | lectura |
|---|---|---|---|---|
| strict | ✓ | ✓ | ✓ | ✓ |
| noImplicitOverride | ✓ | ✗ | ✓ | ✓ |
| noUnusedLocals / noUnusedParameters | ✓ | ✓ | ✓ | ✓ |
| noUncheckedIndexedAccess | ✗ | ✗ | ✗ | ✗ |
| exactOptionalPropertyTypes | ✗ | ✗ | ✗ | ✗ |

### Other counts

- **Services and other non-repositories importing `PrismaService`:** 15 files. Repositories: 2.
- **Frontend cross-feature imports:** 4. Imports from `components/`/`lib/` into `features/`: 0. Only `app/` imports features: router and shell, 9 imports.
- **Tests and coverage:** see the table in §1 7.7.

### Tool versions

| Tool | Version |
|---|---|
| prisma / @prisma/client | 6.19.3 |
| @nestjs/core | 11.2.5 |
| react | 19.2.8 |
| vite | 6.4.3 |
| @tanstack/react-query | 5.101.4 |
| tailwindcss | 4.3.3 |
| typescript | 5.9.3 |
| eslint | 9.39.5 |

---

## 5. Surprises worth deciding at the 7.1 stop

1. **The JSON contract is snake_case end to end.** Moving to camelCase means 83 renamed fields, consumed by both web and iOS. Under the plan's own rule this is a `/api/v2`, not an in-place expand. Decide whether the camelCase target survives Part A, or whether the contract keeps snake_case and documents it.
2. **Dashboard cost grows with history** (no lower bound at `dashboard.module.ts:517`). This is the one real performance issue found.
3. **The entry bundle is already 206 KB gzip**, over the 200 KB budget. Lazy-loading the Google font CSS and code-splitting the routes are the obvious first moves.
4. **About 13 MB of duplicate tesseract files** in `frontend/public/tesseract/` (gitignored) would be deployed.
5. **Coverage is under-reported**: `*.module.ts` is excluded while 5 modules keep their logic in it. **lectura has no tests of its own.** **No vitest coverage provider** is installed.
6. **`@prisma/adapter-pg ^7.10` is declared next to Prisma 6.19.3**, which deserves a look before the Prisma 7 step.
7. **There is no CI of any kind** (no `.github/`). Since the phase rule requires green CI from step 2 on, 7.6 CI should come first.
8. **Applied migration folders must keep their Spanish names.** Renaming them breaks `_prisma_migrations`.
