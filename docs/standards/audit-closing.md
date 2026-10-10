# Phase 7 audit: closing

Date: 2026-10-09. Checked against `Dev` at `50b7d08` and the independent
review of step J-6 (made at `4ee0875`). [`audit.md`](./audit.md) is the
photo of 2026-10-05 and stays as it was; this file says what became of each
of its findings.

States: **done** (with the PR, commit or ADR that closes it), **postponed**
(with its ADR or its place in phase 8 of the plan), **dropped** (with its
ADR). "Phase 8" points at `docs/plan-completo.md`, part 4.

## 7.2 Naming

| Finding                                          | State     | Reference                                                                                                                         |
| ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| File/folder case                                 | Done      | `check-file` in `eslint.config.js` (7.5)                                                                                          |
| File/folder language                             | Postponed | `lint:spanish` baseline: 76 names left in 13 folders (`e2e/`, two docs, two agent files); phase 8                                 |
| Nest role suffixes                               | Done      | 7.4-api; `.controller/.service/.repository/.dto/.module` in every module                                                          |
| Test placement                                   | Done      | `api/test/*.e2e-spec.ts` kept (the convention CONTRIBUTING writes), unit tests beside the code                                    |
| One component per file, barrels, default exports | Done      | `@eslint-react` and `import-x` rules (7.5, 7.2-p)                                                                                 |
| Identifier language                              | Done      | 7.2 slices a to p; `lint:spanish` in CI, no new names                                                                             |
| Comments language                                | Postponed | API and web done (7.2-\*-P); iOS comments and a few API files still Spanish: phase 8                                              |
| Case conventions, boolean prefixes               | Done      | `naming-convention` (7.2), last suppressions removed in J-1                                                                       |
| TS `enum`, `I` prefix, `Type` suffix             | Done      | Literal unions; `naming-convention`                                                                                               |
| Tables, columns                                  | Dropped   | [ADR 0026](../adr/0026-database-names-stay-behind-prisma-map.md): the database keeps its names behind Prisma `@map`               |
| `created_at`, `updated_at`, `timestamptz`        | Postponed | `updated_at` everywhere (`f7e2f1e`); `created_at` on four tables and `timestamptz` go by expand and contract: phase 8, 8.4        |
| Constraint and index names                       | Done      | `f7e2f1e` (`pk_`, `fk_`, `uq_`, `ck_`, `idx_`)                                                                                    |
| Postgres enums                                   | Done      | Values in English; type names stay ([ADR 0026](../adr/0026-database-names-stay-behind-prisma-map.md))                             |
| Migration names                                  | Done      | `scripts/new-migration.sh <verb>_<object>`; applied folders keep their names (they are in `_prisma_migrations`)                   |
| API routes, JSON casing, Spanish fields          | Done      | `/api/v2` in English and camelCase ([ADR 0023](../adr/0023-domain-services-presenters-and-problem-json.md)); v1 retired (7.10-v1) |
| Automated check                                  | Done      | `naming-convention`, `check-file`, `scripts/lint/spanish-identifiers.ts`                                                          |

## 7.3 User-facing text

| Finding                        | State     | Reference                                                                                                                                 |
| ------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Central locale file            | Done      | `frontend/src/locales` ([ADR 0011](../adr/0011-i18next-no-literal-string.md), [0025](../adr/0025-text-catalog-loads-beside-the-entry.md)) |
| Literals in JSX and attributes | Done      | `i18next/no-literal-string`; `locales/attributes.test.ts` (J-3)                                                                           |
| Single Intl module             | Done      | 7.3                                                                                                                                       |
| API error messages             | Postponed | Problem titles in `problem-codes.ts`; the other API messages are spread over about 30 files: phase 8                                      |
| Lint                           | Done      | `i18next/no-literal-string` instead of `react/jsx-no-literals` (D6)                                                                       |

## 7.4 Architecture

| Finding                                               | State   | Reference                                                                                               |
| ----------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| Module per resource, only repositories touch Prisma   | Done    | 7.4-api (#14); `scripts/ci/table-ownership.mjs`                                                         |
| `common/` never imports `modules/`                    | Done    | `dependency-cruiser` in CI                                                                              |
| Env validation with zod                               | Done    | `api/src/common/config/env.ts`                                                                          |
| Error hierarchy, one filter                           | Done    | `DomainError` and problem+json ([ADR 0023](../adr/0023-domain-services-presenters-and-problem-json.md)) |
| Cursor pagination                                     | Dropped | [ADR 0012](../adr/0012-page-pagination-by-default.md): page pagination by default                       |
| Web layering, features apart, React Query in features | Done    | 7.4-web-a to d; `depcruise`                                                                             |
| 300 lines per file, 50 per function                   | Done    | `max-lines` rules; two temporary package exceptions written in `eslint.config.js` (`receipt-parser`)    |
| OpenAPI contract, `packages/types` gone               | Done    | [ADR 0013](../adr/0013-orval-fetch-client.md); #43                                                      |
| Prisma 7                                              | Done    | [ADR 0020](../adr/0020-prisma-7.md)                                                                     |
| `packages/receipt-parser`                             | Done    | 7.2-b                                                                                                   |

## 7.5 Code quality

All seven findings are **done** in step 7.5 (#12): one root `eslint.config.js`
with strict type-checked presets, Prettier as the only formatter,
`.editorconfig`, `knip`, `lefthook`, `commitlint`, `lint-staged`, the four
strict TypeScript flags in every workspace, no `any` or `@ts-ignore`.

## 7.6 Git and CI/CD

| Finding                   | State     | Reference                                                                                          |
| ------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| Trunk-based, `main`       | Postponed | [ADR 0009](../adr/0009-trunk-based-with-dev-as-deploy-branch.md): the hPanel switch is the owner's |
| Ruleset or compensating   | Done      | `scripts/merge.sh` (every check green, fast-forward, waits for every run since `4ee0875`)          |
| CI                        | Done      | `ci.yml` (one workflow with areas since J-7), `security.yml`, `perf.yml`                           |
| release-please, CHANGELOG | Postponed | [ADR 0028](../adr/0028-release-please-waits-for-the-owner.md)                                      |
| PR and issue templates    | Done      | `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/`                                      |

## 7.7 Tests

| Finding                     | State | Reference                                                                                                      |
| --------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| Unit and e2e suites         | Done  | J-6 review: API 503 unit and 316 e2e, web 821, receipt-parser 57, flags 17, iOS 250                            |
| Coverage 80 % API, 70 % web | Done  | API 80 / 80 (measured 96.75 / 87.75); web 70 / 66 ([ADR 0029](../adr/0029-web-branch-coverage-floor-at-66.md)) |
| Playwright journeys         | Done  | `e2e/` with axe, 36 runs desktop and mobile ([ADR 0014](../adr/0014-axe-in-playwright.md))                     |
| Factories                   | Done  | `api/test/factories`                                                                                           |
| Prisma mocks                | Done  | e2e against a real Postgres; CONTRIBUTING, "Tests"                                                             |
| Design-rule tests kept      | Done  | Renamed with their files in 7.2-j to l, still in the suite                                                     |
| Test names in English       | Done  | 7.2-\*-P                                                                                                       |

## 7.8 to 7.13

| Finding                                  | State     | Reference                                                                                                                                                                                                                                           |
| ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.8 Feature flags (API and web)          | Done      | [ADR 0015](../adr/0015-openfeature-server-sdk.md); `scripts/ci/flags-expiry.mjs`                                                                                                                                                                    |
| 7.8 Feature flags in iOS                 | Postponed | No `FeatureFlags` in the app yet: phase 8                                                                                                                                                                                                           |
| 7.9 Bundle over 200 KB, dashboard cost   | Done      | 193.6 of 200 kB ([ADR 0016](../adr/0016-lighthouse-cli-script.md), [0017](../adr/0017-dashboard-reads-bounded-history.md), [0018](../adr/0018-screens-load-on-demand.md))                                                                           |
| 7.10 Expand and contract                 | Postponed | v1 retired (7.10-v1); the contraction is its own step: plan, 8.7                                                                                                                                                                                    |
| 7.11 RLS with an app role                | Done      | [ADR 0010](../adr/0010-rls-with-application-role.md), [0019](../adr/0019-rls-for-user-cross-user-paths-and-cost.md), [0024](../adr/0024-rls-active-in-production.md), [0027](../adr/0027-app-role-creates-only-pending-users-or-the-first-admin.md) |
| 7.11 gitleaks, helmet, logs, probes      | Done      | `security.yml`; JSON logs with `requestId`; `/health` and `/ready`                                                                                                                                                                                  |
| 7.11 Secrets hygiene                     | Postponed | Rotating keys is an owner action (runbook, "Owner actions")                                                                                                                                                                                         |
| 7.12 Documentation                       | Done      | README, architecture, ADR, runbook, CONTRIBUTING, `ios/README.md`; CHANGELOG per [ADR 0028](../adr/0028-release-please-waits-for-the-owner.md)                                                                                                      |
| 7.12 Root `CLAUDE.md`                    | Done      | 64 lines plus `.claude/rules/` per zone (7.14)                                                                                                                                                                                                      |
| 7.13 iOS lint, structure, catalog, names | Done      | swift-format and SwiftLint, `Features/` `Core/` `Shared/`, `Localizable.xcstrings`, [ADR 0021](../adr/0021-ios-english-without-compatibility-exceptions.md)                                                                                         |

## The eight surprises of section 5

1. camelCase contract: done as `/api/v2`. 2. Dashboard cost: done, ADR 0017.
2. Entry bundle: done, under budget. 4. Duplicate tesseract files: done,
   nothing under `frontend/public/` but the favicon and the login background.
3. Coverage under-reported: done, `*.module.ts` holds no logic, and the API,
   the web and `receipt-parser` measure coverage against a threshold. 6. Prisma adapter mismatch: done with
   Prisma 7. 7. No CI: done in 7.6. 8. Applied migration folders keep their
   names: done, ADR 0026.
