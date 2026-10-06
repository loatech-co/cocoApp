# Coco runbook

How Coco is deployed, rolled back, migrated, backed up and repaired. Each
rule comes first in one line; the reason is underneath. Decisions behind
these rules are in [`docs/adr/`](adr/); the system is described in
[`docs/architecture.md`](architecture.md).

Production: the Hostinger Node.js app `dev-cocoapp.viteri.me` (API and web in
one process), PostgreSQL, Auth and the `soportes` bucket on Supabase. The SSH
target and key path are in `scripts/soportes/backup-from-server.sh`.

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

**`npm run deploy:api` and `npm run deploy:web` are not the deploy.** They
are the manual rsync scripts from before hbuilds and the MariaDB move; hbuilds
replaces whatever they copy on the next push. Do not use them.

### Verify a deploy

**A deploy is done when production answers with the new code, not when the
push succeeds.** Check, in this order:

1. `curl -s -o /dev/null -w '%{http_code}' https://dev-cocoapp.viteri.me/api/v2/health`
   → `200` (the process answers) and the same against `/api/v2/ready` → `200`
   (the database answers too; `503` if it does not). Both are public; it is
   what `scripts/desplegar-api.sh` checks when it finishes.
2. The web bundle name changed: `curl -s https://dev-cocoapp.viteri.me/ | grep -o 'index-[^"]*\.js'`.
3. The behaviour the change touched, from the outside.
4. If something is off, over ONE SSH session: the HEAD of
   `~/domains/dev-cocoapp.viteri.me/hbuilds/current/nodejs`, the hbuilds deploy
   log (`<date>_deploy.log`, "Deployment completed"), the app's `stderr.log`
   (expected empty), and `grep '"level":"error"'` in the API log (below).

Why: twice a deploy "succeeded" in git while the build failed on the server,
and before the unification of API and web a deploy to the wrong folder looked
fine and changed nothing.

**No probe, monitor or check points at the v1.** Every request to `/api/v1`
leaves a `v1_used` line in the API log, and a probe counted as a client would
never let the v1 reach the seven days without use it needs to be contracted.

### v1 usage

`node scripts/ops/v1-usage.mjs` counts the `v1_used` lines of
`~/domains/dev-cocoapp.viteri.me/logs/coco-api/api.log` and its rotated files,
per day and per route, and says how many days the v1 has gone unused and since
when there is a log (rotation keeps about 30 MB: if that does not cover seven
days, it says so). It is the evidence for contracting the v1.

It opens **one** read-only SSH connection (`BatchMode`, with a time limit) and
runs a single `awk` there, because of the account's process limit. With
`--file api.log …` it reads local files; with `--json` it prints for machines.

### The web moved to the v2 (step 7.4 for the web)

- **After the deploy that moved the web to `/api/v2`, every user signs in
  once.** The refresh cookie of the v2 lives at `Path=/api/v2/auth`; the old
  one, at the v1's path, never reaches the v2, so the first visit after that
  deploy lands on the login. Nothing is lost: it is one sign-in per browser.
- **`VITE_API_BASE_URL` is now `VITE_API_ORIGIN`**, and it holds only the
  origin (`http://localhost:3000`), without `/api/v1`: the generated client
  adds the versioned path. Rename it in every local `frontend/.env`; empty
  means the same origin, which is what production uses.

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
by expand and contract; dropping anything is a stop for the owner.**

```bash
scripts/nueva-migracion.sh <verb>_<object>   # create and apply LOCALLY
npm run test:e2e --workspace api              # coco_test gets it too
scripts/desplegar-migraciones.sh              # production: status, confirm, deploy, close the data API
```

- **Read `migrate status` before confirming:** the pending list must be
  exactly the migrations you expect. Never pipe a blind `si` into the script —
  that confirmation is the only check between a typo and production.
- Names are `YYYYMMDDHHMMSS_<verb>_<object>` in English, with a UTC timestamp
  later than every existing one. One came out with a local time earlier than
  the previous migration and had to be renamed (and its local
  `_prisma_migrations` row fixed) before it was applied anywhere else.
- The script ends with `scripts/cerrar-el-api-de-datos.sql`; its three counts
  (tables without RLS, policies, open grants) must print `0`
  ([ADR 0007](adr/0007-close-supabase-data-api-by-script.md)). Never apply a
  migration to production any other way: a new table is born open to the
  public `anon` key until that script runs.
- Prove the old code survives: generate the Prisma client from the deployed
  commit and run it against a local database that already has the migration.
- Structure changes only by migration. `npm run sql` / `npm run sql:supabase`
  are for data; a hand-written `CREATE TABLE` is outside `schema.prisma` and
  the next diff would try to create it again.

## Backups and restore

**Back up before any migration that is not purely additive, and before any
operation on production data.** A full, tested backup is a precondition of
every deletion in production (step 7.10 included).

```bash
npm run respaldar              # full backup → $COCO_DATA_DIR/respaldos/coco-<date>.tar.age, restore-tested
bash scripts/restaurar.sh      # restore the newest one into a throwaway local database and count rows
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
uploaded). `respaldar.sh` checks it on every run and warns if the destination
is not under iCloud Drive. Why outside the repository: it is real financial
data; a stray `git add -f`, or a zip of the project, would take it along.

Supabase's free plan keeps backups briefly, has no point-in-time recovery and
does not back up Storage. Ours are the ones that count.

`traer-datos-a-local.sh` copies production DATA (not schema) into the local
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
   Without the private key on the laptop, `respaldar.sh` tests the plain copy
   before encrypting and says the decryption was not proven.

Backups made with the interim key need it to be read: keep it until they
expire.

### Restore

```bash
bash scripts/restaurar.sh [coco-<date>.tar.age | decrypted folder]
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
  `cerrar-el-api-de-datos.sql` and point `DATABASE_URL` / `DIRECT_URL` at it
  (see [Rotate secrets](#rotate-secrets)). This path has not been run yet.
- The bucket is not uploaded by `restaurar.sh`. Decrypt by hand and re-upload:
  `age -d -i ~/.config/coco/respaldo.key coco-<date>.tar.age | tar -xf -`, then
  `scripts/soportes/copy-to-storage.mjs --from coco-<date>/soportes` (it
  verifies every file by sha256).
- The older `coco-<date>.sql` files (public only, plain SQL) restore with
  `createdb coco_restore && psql -v ON_ERROR_STOP=1 -d coco_restore -f <file>`.

### Retention — PROPOSAL, not in force

**Nothing is deleted without the owner.** `respaldar.sh` no longer prunes.
Proposed policy:

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
   ([Restore](#restore)) — with the owner.

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
  `scripts/soportes/copy-to-storage.mjs` re-uploads and verifies each file by
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
