# Coco runbook

How Coco is deployed, rolled back, migrated, backed up and repaired. Each
rule comes first in one line; the reason is underneath. Decisions behind
these rules are in [`docs/adr/`](adr/); the system is described in
[`docs/architecture.md`](architecture.md).

Production: the Hostinger Node.js app `dev-cocoapp.viteri.me` (API and web in
one process), PostgreSQL, Auth and the `soportes` bucket on Supabase. The SSH
target and key path are in `scripts/receipts/backup-from-server.sh`.

**Never develop against production.** The API refuses to start outside
production when the database is not local. Real data reaches a local machine
only through the scripts named here.

---

## Deploy

**A deploy is a fast-forward of `Dev`, and only `scripts/merge.sh` does it.**

```bash
gh pr create --base Dev        # from your work branch, pushed
bash scripts/merge.sh          # waits for every check, refuses on red, fast-forwards Dev
```

Why: the private repository on GitHub's free plan has no enforceable branch
protection; the script is the control ([ADR 0009](adr/0009-trunk-based-with-dev-as-deploy-branch.md)).
hPanel's GitHub integration watches `Dev`, and hbuilds then installs
(`npm install` with `NODE_ENV=production`, no devDependencies), builds, and
restarts the app. Expect 1–2 minutes.

**Migrations go first, in their own step, before the PR whose code needs
them** (see [Migrations](#migrations)).

**There is no manual deploy.** The rsync scripts from before hbuilds
(`deploy:api`, `deploy:web`) were deleted: they overwrote production's `.env`
and ran Node 20, and hbuilds replaced whatever they copied on the next push.

### Verify a deploy

**A deploy is done when production answers with the new code, not when the
push succeeds.** Check, in this order:

1. `curl -s -o /dev/null -w '%{http_code}' https://dev-cocoapp.viteri.me/api/v2/health`
   → `200` (the process answers) and the same against `/api/v2/ready` → `200`
   (the database answers too; `503` if it does not). Both are public.
2. The web bundle name changed: `curl -s https://dev-cocoapp.viteri.me/ | grep -o 'index-[^"]*\.js'`.
3. The behaviour the change touched, from the outside.
4. If something is off, over ONE SSH session: the HEAD of
   `~/domains/dev-cocoapp.viteri.me/hbuilds/current/nodejs`, the hbuilds deploy
   log (`<date>_deploy.log`, "Deployment completed"), the app's `stderr.log`
   (expected empty), and `grep '"level":"error"'` in the API log (below).

Why: twice a deploy "succeeded" in git while the build failed on the server,
and before the unification of API and web a deploy to the wrong folder looked
fine and changed nothing.

**No probe, monitor or check points at a version being retired**: a probe
counts as a client, and the old version would never reach the time without
use it needs to be contracted (the stop table in [`CLAUDE.md`](../CLAUDE.md)).

### The v1 was retired (step 7.10)

- **The API serves only `/api/v2`.** Anything under the old prefix is a `404`
  in `application/problem+json`, like any unknown route; check it after a
  deploy with `curl -s -o /dev/null -w '%{http_code}' <origin>/api/v1/health`
  → `404`.
- **The app's bridge speaks the v2 session** (`accessToken`, `expiresIn`, the
  v2 profile). A build of the iOS app from before 7.10 hands the embedded web
  a session it no longer reads: the web waits for one and shows nothing.
  **Reinstall the app from Xcode after deploying 7.10** (the usual weekly
  renewal does it too). The same goes for the bridge's names, `cocoSession`
  and `cocoEvents` since 7.2-r2: an older build answers on the old ones.
- **`VITE_API_ORIGIN` holds only the origin** (`http://localhost:3000`): the
  generated client adds the versioned path. Empty means the same origin, which
  is what production uses.

## Roll back

**Undo with `git revert` in a new PR through `merge.sh`. Never force-push
`Dev`.**

Why: a force-push rewrites the history the server and CI agree on, and the
next deploy may build something nobody tested. A revert is a normal,
tested deploy.

- A failed build does not need a rollback: hbuilds leaves `current` on the
  previous commit and production keeps running (seen twice). Fix forward.
- A schema change is never rolled back by dropping: migrations are additive
  ([ADR 0008](adr/0008-expand-and-contract-migrations.md)), so the reverted
  code runs on the newer schema.

## Migrations

**Additive, applied to production before the code; anything that breaks goes
by expand and contract.** Dropping anything follows the stop table in
[`CLAUDE.md`](../CLAUDE.md), the only one.

```bash
scripts/new-migration.sh <verb>_<object>   # create and apply LOCALLY
npm run test:e2e --workspace api              # coco_test gets it too
scripts/deploy-migrations.sh              # production: status, confirm, deploy, close the data API
```

- **Read `migrate status` before confirming:** the pending list must be
  exactly the migrations you expect. Never pipe a blind `yes` into the script —
  that confirmation is the only check between a typo and production.
- Names are `YYYYMMDDHHMMSS_<verb>_<object>` in English, with a UTC timestamp
  later than every existing one. One came out with a local time earlier than
  the previous migration and had to be renamed (and its local
  `_prisma_migrations` row fixed) before it was applied anywhere else.
- The script ends with `scripts/close-data-api.sql`; of its three counts,
  `tables_without_rls` and `open_grants` must print `0` and `policies` must
  print `14`, all of them `TO coco_app`
  ([ADR 0007](adr/0007-close-supabase-data-api-by-script.md),
  [ADR 0024](adr/0024-rls-active-in-production.md)). `policies = 0` was right
  before RLS went live (7.11-b); today it means the policies are gone. Never
  apply a migration to production any other way: a new table is born open to
  the public `anon` key until that script runs.
- Prove the old code survives: generate the Prisma client from the deployed
  commit and run it against a local database that already has the migration.
- Structure changes only by migration. `npm run sql` / `npm run sql:supabase`
  are for data; a hand-written `CREATE TABLE` is outside `schema.prisma` and
  the next diff would try to create it again.

## Row-level security

**Production connects as `coco_app`, a role without `BYPASSRLS`; migrations
connect as the owner.** `DATABASE_URL` in `$CONFIG/.env` on the server
(`~/domains/dev-cocoapp.viteri.me/hbuilds/config`) is `coco_app` through the
transaction pooler; `DIRECT_URL` stays the owner. Design and cost:
[ADR 0019](adr/0019-rls-for-user-cross-user-paths-and-cost.md),
[ADR 0024](adr/0024-rls-active-in-production.md). (This section replaces the
working document `docs/rls-rollout.md` that the RLS migrations' comments name.)

Why: the policies are the second lock behind the code's `user_id` filters. A
query that forgets its filter, or one that runs outside `Database.forUser`,
sees no other user's rows.

- **The owner (`postgres` in Supabase) must keep `BYPASSRLS`.** With `FORCE`
  on every table it is bound by the policies otherwise, and every migration
  and backup would see empty tables. Check before any change to roles:
  `npm run sql:supabase -- "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'postgres'"` → `t`.
- **`coco_app` updates only the session columns of `users`.** Role, status
  and approval go through `app_private.set_user_access`, which refuses unless
  the unit runs as an active admin.
- **Rotate its password** with `scripts/db/create-app-role.sh` (idempotent),
  `ADMIN_DATABASE_URL` = the owner's `DIRECT_URL`, `COCO_APP_DB_PASSWORD` from
  the environment, never on a command line; then the same value in
  `DATABASE_URL` on the server. Through Supavisor the user is
  `coco_app.<project-ref>`; host, port (6543) and parameters stay as they were.
- **A restore needs `coco_app` first**: the policies and grants name it.
- **After a migration**, `scripts/close-data-api.sql` prints
  `policies = 14`, and every public table except `_prisma_migrations` is
  forced:
  `SELECT count(*) FILTER (WHERE NOT relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'` → `0`.

### Undo, from the cheapest

1. **Back to the owner** (an empty dashboard after a deploy means the setting
   is not reaching the policies): restore `.env.before-rls` next to the `.env`
   on the server (`cp .env.before-rls .env`, mode 600), and restart
   (`touch ~/domains/dev-cocoapp.viteri.me/hbuilds/current/nodejs/tmp/restart.txt`).
   The policies stay, inert for the owner. Delete `.env.before-rls` after a
   week without incidents (ask).
2. **No FORCE**: `ALTER TABLE public.<table> NO FORCE ROW LEVEL SECURITY;` for
   each table, as the owner.
3. **No policies** (deletes structure: stop table first): drop every policy in
   `public`, `DROP SCHEMA app_private CASCADE`, `GRANT DELETE, UPDATE ON TABLE
public.users TO coco_app`, and delete the four `2026100600*` rows of
   `_prisma_migrations`. RLS stays ENABLED, as ADR 0007 left it.

### Local and CI

- Once per machine: `ADMIN_DATABASE_URL=postgresql://localhost:5432/postgres
COCO_APP_DB_PASSWORD=<local, ≥16> MIGRATION_ROLE=coco_migrate bash scripts/db/create-app-role.sh`.
  Then `api/.env` and `api/.env.test`: `DATABASE_URL` as `coco_app`,
  `DIRECT_URL` as `coco_migrate`.
- The journeys run the API as `coco_app` when `E2E_APP_DATABASE_URL` is set
  (CI sets it); `api-bench.mjs` does with `COCO_BENCH_APP_DATABASE_URL`.
- `scripts/pull-data-to-local.sh` writes through `DIRECT_URL`.

## Backups and restore

**Back up before any migration that is not purely additive, and before any
operation on production data.** A full, tested backup is a precondition of
every deletion in production (step 7.10 included); what a deletion requires
(full backup and a restore tested right before) is in the stop table of
[`CLAUDE.md`](../CLAUDE.md).

```bash
npm run backup              # full backup → $COCO_DATA_DIR/respaldos/coco-<date>.tar.age, restore-tested
bash scripts/restore.sh      # restore the newest one into a throwaway local database and count rows
```

### What a backup holds

One `coco-<date>.tar.age`: a tar encrypted with [age](https://age-encryption.org),
holding

- `db.dump` — `pg_dump` custom format of the `public` schema (the app) and the
  `auth` schema (Supabase users, identities and sessions). Without `auth`, a
  restored `public` gives back the data of accounts nobody can log into;
- `soportes/` — every object of the private `soportes` bucket, each one checked
  by sha256 against `soportes.huella` while downloading;
- `conteos.tsv` — the row count of every table in both schemas;
- `sumas.sha256` and `manifest.json` — the file hashes, versions, totals and
  timings. No secrets and no amounts.

The counts, the bucket listing and the dump come from ONE snapshot (a
read-only `REPEATABLE READ` transaction that exports it to `pg_dump
--snapshot`): counted apart, `auth.refresh_tokens` changes with every token
refresh and the counts would never match. Production is only read: the
`postgres` role of `DIRECT_URL` has `SELECT` on every `auth` table, and the
bucket is downloaded with GET and the service key. The plain copy is built
in a private temporary folder and deleted at the end; only the encrypted file
lands in `respaldos/`.

The run of 2026-10-05: 41 tables and 3,040 rows, 463 objects (31 MB), a 32 MB
file; about 90 s to back up and 15 s to restore and count.

### Where it lives: off the laptop

`$COCO_DATA_DIR` (default `~/Documents/VS Code/Personal/coco-datos/`, with
`datos/` and `respaldos/`) is outside the repository and inside `Documents`,
which iCloud Drive syncs ("Desktop & Documents"; checked on 2026-10-05: the
folder belongs to the iCloud Drive file provider and existing backups report
uploaded). `backup.sh` checks it on every run and warns if the destination
is not under iCloud Drive. Why outside the repository: it is real financial
data; a stray `git add -f`, or a zip of the project, would take it along.

Supabase's free plan keeps backups briefly, has no point-in-time recovery and
does not back up Storage. Ours are the ones that count.

`pull-data-to-local.sh` copies production DATA (not schema) into the local
database, read-only on production; it is the sanctioned way to work with real
data locally.

### The encryption key — OWNER ACTION

Encrypting needs only the public key (`~/.config/coco/respaldo.pub`, or
`$COCO_BACKUP_RECIPIENT`); restoring needs the private one
(`~/.config/coco/respaldo.key`, mode 600, or `$COCO_BACKUP_KEY`). The private
key never goes in the repository, nor next to the backups in iCloud: whoever
holds both holds everything.

An interim key was created on the laptop on 2026-10-05. If the laptop is lost,
so is that key and every backup encrypted with it. **The owner must:**

1. Keep a copy of `~/.config/coco/respaldo.key` in the password manager (a
   secure note), and ideally a paper copy in a drawer. Not in iCloud Drive,
   not in an email.
2. Or replace it with a key born there: `age-keygen -o respaldo.key`, store
   the file in the password manager, and leave only the public line
   (`age-keygen -y respaldo.key > ~/.config/coco/respaldo.pub`) on the laptop.
   Without the private key on the laptop, `backup.sh` tests the plain copy
   before encrypting and says the decryption was not proven.

Backups made with the interim key need it to be read: keep it until they
expire.

### Restore

Restoring into production: see the stop table in [`CLAUDE.md`](../CLAUDE.md).
To check or recover:

```bash
bash scripts/restore.sh [coco-<date>.tar.age | decrypted folder]
```

- **No `--target`:** restores into the local throwaway database
  `coco_restore_test` (or `$COCO_RESTORE_DB`, which must end in
  `_restore_test`), checks every file's sha256, compares the rows of every
  table of `public` and `auth` with `conteos.tsv`, and drops the database.
  Exit code 0 only if everything matches.
- **`--target <url>`:** restores elsewhere after typing the name of the
  target database letter by letter. A production URL (the ref in
  `api/.env.supabase`; without that file, any Supabase URL) is refused unless
  `--i-know-this-is-production` is also passed. **Restoring into production is
  a stop for the owner.**
- Into a Supabase project, `auth` goes in data-only (Supabase owns the schema),
  so it is for a NEW project with an empty `auth`. Then run
  `close-data-api.sql` and point `DATABASE_URL` / `DIRECT_URL` at it
  (see [Rotate secrets](#rotate-secrets)). This path has not been run yet.
- The bucket is not uploaded by `restore.sh`. Decrypt by hand and re-upload:
  `age -d -i ~/.config/coco/respaldo.key coco-<date>.tar.age | tar -xf -`, then
  `scripts/receipts/copy-to-storage.mjs --from coco-<date>/soportes` (it
  verifies every file by sha256).
- The older `coco-<date>.sql` files (public only, plain SQL) restore with
  `createdb coco_restore && psql -v ON_ERROR_STOP=1 -d coco_restore -f <file>`.

### Retention — PROPOSAL, not in force

Deleting a backup follows the stop table in [`CLAUDE.md`](../CLAUDE.md).
`backup.sh` no longer prunes. Proposed policy:

- the 14 most recent daily backups;
- the last backup of each month, for 12 months;
- the last backup before each destructive migration, which never expires.

Candidates to delete once the owner approves: `coco-20260915-121502.sql` and
`supabase-20260915-221412.sql`. The last MariaDB dump (`mariadb-final.sql`)
is the only copy of the pre-Postgres database and is not a candidate.

## Rotate secrets

**The server's `.env` in `~/domains/dev-cocoapp.viteri.me/hbuilds/config/`
is the source of truth; hPanel variables are not.**

Why: `main.ts` loads that file with `override: true`. hPanel injects its own
variables (once a stale MariaDB `DATABASE_URL`, with the quotes inside the
value) and they used to win; changing them in hPanel does nothing now.

1. Create the new value at the provider (Supabase dashboard: database
   password, service-role key, access token; the SSH key in hPanel).
2. Update the server `.env` and your local `api/.env.supabase`. Never write
   the value in a commit, log, issue or handoff; CI runs gitleaks over the
   whole history.
3. Restart: `touch ~/domains/dev-cocoapp.viteri.me/hbuilds/current/nodejs/tmp/restart.txt`
   (the one in `tmp/`; the one at the domain root is watched by nobody), or
   deploy.
4. Verify `/api/v2/ready` and a real login; then revoke the old value.

Supabase Auth's signing keys rotate without a redeploy: the API verifies
against the project's JWKS.

## Environment variables renamed to English (7.2-r3)

Five variables changed name, by expand and contract. Only the names: the
values stay (`si` is still `si`, the bucket is still `soportes`, ADR 0026).

| Old (until 7.10)            | New                      |
| --------------------------- | ------------------------ |
| `SOPORTES_DIR`              | `RECEIPTS_DIR`           |
| `SOPORTES_STORAGE`          | `RECEIPTS_STORAGE`       |
| `SOPORTES_BUCKET`           | `RECEIPTS_BUCKET`        |
| `PERMITIR_BASE_REMOTA`      | `ALLOW_REMOTE_DATABASE`  |
| `PERMITIR_AUTH_DESTRUCTIVA` | `ALLOW_DESTRUCTIVE_AUTH` |

- **Transition.** The API reads the new name and, if it is missing, the old
  one (`RENAMED_ENV` in `api/src/common/env.ts`). At boot it logs a warning
  per variable set only under its old name, or under both with different
  values (the new one wins). Names only, never values. The scripts that read
  the bucket fall back the same way.
- **Server (expanded in 7.2-r3).** `hbuilds/config/.env` has the new names
  next to the old ones, with the same values; the copy from before is
  `.env.before-r3` (mode 600). A deploy whose `api.log` carries no
  `deprecated name` warning is reading the new names.
- **Local.** An `api/.env` with the old names still starts, with the
  warning. Rename the lines when convenient.
- **Contraction (7.10).** Remove the old lines from the server `.env` (a
  deletion on the server: backup first, per `CLAUDE.md`), then delete
  `RENAMED_ENV`, the fallback, the warnings and the scripts' fallback, and
  `.env.before-r3`.

## Renew the iOS build every 7 days

**Reconnect the iPhone and press Run in Xcode before the 7 days end.**

Why: the app is signed with a free personal team; the profile expires after
7 days and the app stops opening. It warns a day before and shows the days
left in Settings. The queue, the keychain and the settings survive because
the bundle id does not change. Steps and limits: [`ios/README.md`](../ios/README.md).

---

## When something fails

### The deploy fails

**Production is intact; read the hbuilds log and fix forward.**

- Most common cause: the production build depends on something only tests
  install. The server installs without devDependencies (no `vitest`), so a
  test helper in a build's `include` breaks it. Reproduce with
  `bash scripts/verify-clean-install.sh`, which installs like the server.
- Second: two `esbuild` versions in the tree (once via `tsx`) made the first
  `npm install` fail. The clean-install check asserts a single one.

### The database does not respond

**`/api/v2/ready` not 200 and the API log shows connection errors: check
Supabase before touching the app.**

1. Supabase dashboard: is the project paused (free plan) or degraded? Resume
   it from the dashboard.
2. Pooler URLs: the app uses the transaction pooler (6543); migrations and
   `pg_dump` need the session one (5432) — a dump through 6543 is cut midway.
3. If the project is lost, restore the last backup into a new project
   ([Restore](#restore)); see the stop table in [`CLAUDE.md`](../CLAUDE.md).

### Supabase Auth is down

**Do nothing to the app; wait it out and say so.**

Login, registration and token refresh fail. Access tokens already issued
(15 minutes) keep working because the API verifies them locally against the
cached JWKS. iOS captures stay in the on-device queue and retry. Never switch
verification off to "let people in".

### The receipts bucket fails

**Transactions still save; only receipt files fail. Nothing is deleted to
fix it.**

- The iOS queue uploads the photo after the transaction and retries; the web
  says the file could not be attached.
- Copies of the files: the server disk (`~/soportes-cocoapp`, kept until the
  owner retires it) and `$COCO_DATA_DIR/respaldos/soportes-*`.
  `scripts/receipts/copy-to-storage.mjs` re-uploads and verifies each file by
  sha256 against `soportes.huella`; `create-bucket.mjs` recreates the private
  bucket (jpeg/png/pdf, 25 MB).

---

## GitHub Actions minutes

The repo is private on the free plan: 2,000 Linux minutes a month, each job
billed rounded UP to the minute (macOS counts 10x). If they run out, no check
runs and `scripts/merge.sh` integrates nothing.

- **What runs where.** On every PR: `hygiene` (gitleaks over the PR's
  commits, commitlint, prettier over the changed files). On a PR that touches
  anything outside `docs/`, `.claude/` and `*.md`: `ci` and `journeys` too.
  Weekly and on demand: `security` (gitleaks over the whole history, audit).
  Nothing runs on the push to `Dev`: merge.sh fast-forwards, so the SHA is the
  one its PR already passed.
- **Measure the month.** The billing endpoint needs the `user` scope
  (`gh auth refresh -s user`, then
  `gh api users/loatech-co/settings/billing/actions`). Without it, sum the
  jobs of `gh api 'repos/loatech-co/cocoApp/actions/runs?created=>=YYYY-MM-01'`,
  each rounded up to the minute.
- **Running low.** Batch small docs changes into one PR, and do not re-push
  a PR just to retrigger: `gh run rerun <id> --failed` re-runs only what
  failed. Keep the spending limit at 0 USD so running out stops and never
  bills.
- **Actions are pinned by SHA** with the version in a comment; Dependabot
  (`github-actions`, monthly) proposes the bumps.

---

## Dependency vulnerabilities

**The gate is `node scripts/ci/audit.mjs`**, in `ci` on every PR and weekly in
`security`. It audits PRODUCTION dependencies only (`npm audit --omit=dev`)
and fails on any high or critical advisory that is not in its `ACCEPTED`
list, where each exception carries its reason and the date it was last
checked. A new advisory in a production dependency blocks every PR until it
is fixed or accepted.

**Hostinger's emails are not the gate.** Its scanner reads the whole
lockfile, DEVELOPMENT dependencies included (jest, vite, orval, storybook),
and still reports advisories GitHub has withdrawn. A mail from Hostinger is
not a CI failure and not, by itself, a risk on the server: the server
installs without devDependencies.

When one arrives:

1. Run `node scripts/ci/audit.mjs`. Red means a production advisory: that
   is the urgent part, and it already blocks the PRs.
2. For each package in the mail, `npm ls <name> --all` says who brings it
   and whether it is dev-only.
3. Fix with the smallest move: a patch bump of the direct dependency, or
   `npm update <name>` when the parent's range already allows the fixed
   version. If a third party PINS the vulnerable version, add an `overrides`
   entry in the root `package.json`, scoped to that parent or to the major
   (`"brace-expansion@1"`), never a bare name that would drag other majors.
4. Without a fix (Prisma's `deepmerge-ts` and `mysql2`), add or refresh the
   `ACCEPTED` entry with its reason and today's date. A withdrawn advisory
   (esbuild GHSA-gv7w-rqvm-qjhr) is documented as a false positive in the
   same file, not accepted.
5. Re-run `bash scripts/verify-clean-install.sh`: there must still be ONE
   esbuild, or the server install breaks.

**npm trap with overrides.** With the lockfile already present, npm 11
ignores a new override for a pinned nested dependency (it stayed on the
old version for `js-yaml` under `@nestjs/swagger`). Write the new version
into that lockfile entry (`version`, `resolved`, `integrity` from
`npm view <name>@<v> dist`), then `npm ci` and `npm install` to confirm it
holds. In a workspace `npm ls` then marks it `invalid`: that is an npm bug
in reading overrides, not a broken tree.

---

## Hosting traps (Hostinger shared plan)

**LiteSpeed runs several processes of the API, not one.** Three started
within seven seconds. Anything kept in memory — a cache, a single-flight, a
scheduler — runs once per process; idempotency lives in the database
([ADR 0005](adr/0005-idempotency-by-external-ref.md)).

**The app's `HOME` is `~/domains/dev-cocoapp.viteri.me`, not the account's.**
So the API log is `~/domains/dev-cocoapp.viteri.me/logs/coco-api/api.log`
(JSON lines with `requestId`, rotated at 5 MB × 5, outside `hbuilds/` so it
survives deploys), and `~` in the app means that folder.

**The process cap counts threads, and the app sits near it.** LVE's `nproc`
limit counts threads; the app's `lsnode` alone had 59. One extra process —
a hung SSH command, a logger with worker threads — and nothing can fork. So:
one SSH session at a time, a `timeout` on every remote command, no
thread-spawning libraries (that is why the logger is ours and not pino).
If SSH answers `fork: Resource temporarily unavailable`, only bash builtins
work: list `/proc` with `for`/`read`/`echo` (no `$(…)`, no pipes, no
binaries), find the zombie and `kill` it with the builtin.

**`lsnode` is not `node`.** `/proc/<pid>/exe` of the app is LiteSpeed's
launcher; to run Node on the server, find it under CloudLinux's paths and
check it with `--version` first. A command run with the wrong binary hangs.

**The `restart.txt` that counts is in `tmp/` of the app root.**

**`npx prisma` does not run on the server** (the `.bin` link is not
executable there): use `node node_modules/prisma/build/index.js …`, and never
behind a pipe, which hides its exit code.

**The repository sits in an iCloud-synced folder.** iCloud has renamed
`node_modules` folders to `… 2` and resurrected deleted files as `… 2.ts`.
Delete those copies; never commit them.

---

## Appendix: user-facing copy glossary

From the copy audit of September 2026 (deleted in step 7.12); applies
to every Spanish text the user sees until step 7.3/7.14 moves it to
`CONTRIBUTING.md`.

| Not said                            | Said                                   |
| ----------------------------------- | -------------------------------------- |
| plata                               | dinero                                 |
| se fue (en) · en qué se fue         | se gastó (en) · en qué se gastó        |
| lote (de importación)               | importación                            |
| cosas · elementos                   | the concrete noun                      |
| Ojo:                                | Ten en cuenta que                      |
| Listo. (as an acknowledgement)      | the concrete result                    |
| tu débito                           | tu tarjeta débito                      |
| Cuentas (for user accounts)         | Usuarios — «Cuentas» are bank accounts |
| Pasan a (as a label)                | Categoría de destino                   |
| añadir · adjuntar · cargar (to add) | **agregar**                            |

Fixed terms: movimiento, concepto, categoría, centro de costos, soporte,
periodo, saldo, importación, bitácora. «Dashboard» is the proper name of the
first screen. «Cargar» stays when it means fetching («No se pudo cargar…»).

Fixed message shapes: `El/La {cosa} no existe.` · `La {cosa} indicada no
existe o no es tuya.` · `La sesión {expiró · fue cerrada · ya no es válida}.
Vuelve a entrar.` · `Tu cuenta {está suspendida · no está habilitada}.
Contacta al administrador.`

## Appendix: the historical load (done, scripts deleted in 7.12)

The 2022–2026 history was loaded from a CSV and its scanned receipts matched
to it by one-off scripts. What still matters if it is ever redone:

- Dates are the PAYMENT date (Coco is a cash ledger); the accrual period went
  to the notes — 14 % of rows were paid in a different month.
- Each loaded row's `external_ref` is
  `sha256(Fecha_Pago | Valor | Centro | Grupo | Concepto | Periodo)`, so a
  rerun duplicates nothing and receipts can be matched exactly by filename
  (`<year>/<MM-Month>/<Concept> - <payment date>[ - n de m].pdf`).
- Receipt files are immutable (uuid names). No sync ever used `--delete`.
- The source CSV and receipts are in `$COCO_DATA_DIR/datos/` and
  `$COCO_DATA_DIR/respaldos/`. The scripts are in git history before step
  7.12 (`scripts/cargar-historico.mjs`, `scripts/soportes/*`).
