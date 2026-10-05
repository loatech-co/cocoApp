# 0020 — Prisma 7: generated client in `api/src`, CommonJS, config next to the API

- Status: accepted
- Date: 2026-10-05 (step 7.4, decision D12)
- Deciders: the owner, phase 7
- Source: the official upgrade guide,
  https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7 (read 2026-10-05)

## Context and problem statement

The API was on Prisma 6.19.3 with `prisma-client-js` and the `driverAdapters`
preview, already talking to Postgres through `@prisma/adapter-pg` (the Rust
engine panicked when the host suspended the process). Prisma 7 makes that the
only model and changes how the client is generated, configured and imported.
D12 fixes the version line (`^7`, never the 8 release candidates) and keeps the
API in CommonJS. What remained open was where each piece lives in this
monorepo and what the scripts and the server need.

## Decision outcome

- **Versions.** `prisma`, `@prisma/client` and `@prisma/adapter-pg` at
  `^7.10.0` (7.10.0 resolved). `^7` excludes the 8.x tags npm marks as `latest`.
- **Generator** `prisma-client`, `output = "../src/generated/prisma"`,
  `moduleFormat = "cjs"`. The guide's `"type": "module"` step is **not**
  followed: Nest compiles to CommonJS (D12). The client is TypeScript inside
  `api/src`, so `nest build` compiles it into `api/dist/generated/prisma` and
  it ships with the build: the server no longer generates anything, and
  `node_modules/.prisma` is gone. The folder is gitignored and excluded from
  lint, coverage and knip's reach by being generated.
- **Generation runs** in `api`'s `postinstall` (Prisma 7 no longer generates on
  install, Prisma 6 did) and in `prebuild`, so a fresh clone and hbuilds' build
  both have it. Neither needs a database.
- **`api/prisma.config.ts`**, next to `api/package.json`, because the guide puts
  it "at the root of your project (where your `package.json` is)" and the CLI
  runs from the `api` workspace. The plan said repo root; the API's root is the
  one the guide means. It does `import 'dotenv/config'` (Prisma 7 no longer
  loads `.env`); dotenv never overrides, so `dotenv -e .env.migrate -- prisma …`
  still wins. `url` is `DIRECT_URL ?? DATABASE_URL`, which is what `directUrl`
  did for the CLI in Prisma 6; `shadowDatabaseUrl` comes from
  `SHADOW_DATABASE_URL`. The datasource block in `schema.prisma` keeps only
  the provider. The file is type-checked (`tsconfig.json`) but left out of the
  build (`tsconfig.build.json`) so `dist/main.js` stays where hPanel expects it.
- **Imports** point at `src/generated/prisma/client` (relative). `@prisma/client`
  stays as the runtime the generated code imports.
- **Scripts.** `migrate diff` lost `--shadow-database-url` (now in the config)
  and `--to-schema-datamodel` (now `--to-schema`); `--from-url` is
  `--from-config-datasource`. `desplegar-migraciones.sh` gates on the exit code
  of `migrate status`: 0 is up to date and stops; non-zero continues only if the
  output lists pending migrations. The operational `.mjs` scripts build their
  client through `scripts/db/prisma-client.mjs` (adapter required) and run
  under `tsx`, because the generated client is TypeScript.
- **Node ≥ 22.12** in `engines` (Prisma's floor is 20.19; D12 sets 22.12 for
  Hostinger) and `alt-nodejs22` in `desplegar-api.sh`.

### Consequences

- The schema does not change: `migrate status` is up to date and
  `migrate diff --from-config-datasource --to-schema` reports no difference on
  a database migrated from scratch.
- RLS (`forUser`, `set_config` inside `$transaction`) works unchanged: every
  e2e suite, `row-level-security` included, passes as `coco_app`.
- The Prisma 7 CLI is heavier (Studio, `prisma dev`) and, being a production
  dependency for `migrate deploy`, lands on the server. It pins `mysql2` 3.15.3
  and still `deepmerge-ts` 7.1.5: both accepted in `scripts/ci/audit.mjs` with
  their exit conditions; an npm `overrides` for `mysql2` did not take.
- Removed by the guide and unused here: client middleware (`$use`), metrics,
  automatic seeding, the engine environment variables.
