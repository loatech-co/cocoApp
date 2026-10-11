# 0033 — Backups carry the privileges; the restore applies the ones the target can take

- Status: accepted. Amended 2026-10-11 (round 4, R4-SB)
- Date: 2026-10-10
- Deciders: the director of the round-3 audit, step R3-B

## Context and problem statement

`backup.sh` dumped `public`, `auth` and `app_private` with `--no-privileges`,
and `restore.sh` restored them the same way. The GRANTs and REVOKEs that
narrow `coco_app` (no `DELETE` on `users`, `UPDATE` on three of its columns,
nothing on `audit_log` beyond `SELECT`/`INSERT`, nothing on
`_prisma_migrations`; migrations `20261006000000`, `…200` and `…300`) were
not in the backup, and nothing checked them after a restore. A restore into a
new project left `coco_app` with no grant at all; a restore over an existing
one left whatever the surviving `ALTER DEFAULT PRIVILEGES` gave back:
everything (audit round 3, finding B1).

Simply dropping `--no-privileges` on both sides does not work: a production
dump also carries grants to Supabase's roles (`service_role` on every table,
`supabase_auth_admin` and friends on `auth`), and `ALTER DEFAULT PRIVILEGES
FOR ROLE postgres`. On the local Postgres where every backup is test-restored
none of those roles exist, and `pg_restore --exit-on-error` would stop at the
first one.

## Decision

1. **The dump carries every privilege.** `extract.mjs` runs `pg_dump` with
   `--no-owner` only. A backup takes everything and judges nothing.
2. **The restore applies what the target can take.** `restore.sh` restores
   the objects with `--no-privileges`, then the `ACL` entries of `public` and
   `app_private` (from `pg_restore -l`, applied with `pg_restore -L … -f -`)
   through `scripts/restore/filter-privileges.mjs`, which keeps a GRANT or
   REVOKE only if its grantee is `PUBLIC` or a role of the target
   (`pg_roles`) and reports the rest. `auth` keeps none (they are the
   platform's) and the dump's `DEFAULT ACL` entries stay out: they hang off
   the owner role, which `--no-owner` already leaves behind. The restore then
   runs the two `ALTER DEFAULT PRIVILEGES … TO coco_app` of migration
   `20261006000000` itself, as the role it connects with (the owner of every
   restored object): that migration is already in `_prisma_migrations` and
   never runs again, so without this the first table the next migration
   created would be born without a grant (round 4, B1).
3. **The restore verifies the privileges of `coco_app`**
   (`scripts/restore/check-app-role.sql`) and exits `1` if they are wider or
   narrower than the migrations left them: tables and columns, every
   sequence, `USAGE` on both schemas and no `CREATE` on `public`, `EXECUTE`
   on the three policy helpers and not on `guard_users_access`, and the
   default privileges above, read from `pg_default_acl` of the owner of
   `public.users` (round 4, B2), and row-level security forced on every
   table of `public` with the policy count `verify-data-api-closed.sh`
   expects (round 5, B3). A dump without privileges (every backup before
   this ADR) restores its data and fails this check. Functions are looked up
   with `to_regprocedure`, so one a pending migration has not created yet is
   not an error: a narrowed function that is missing passes (nothing to
   narrow), a granted one that is missing fails. Otherwise no backup taken
   while a migration waited in production could pass its restore test, and
   that migration asks for a tested backup first (round 5, B1).
4. **A Supabase project is not a target of `restore.sh`.** The script refuses
   it; the runbook keeps the manual recipe for a new project, marked as never
   rehearsed. `--i-know-this-is-production` is gone with it: restoring into
   production is an owner stop (`CLAUDE.md`). The target URL never travels
   on a command line: `--target` reads it from `COCO_RESTORE_TARGET_URL` (or
   a variable named after the flag), drops it from the script's environment,
   and hands it to the one process that splits it into `PG*` variables (round
   5, S18 and B5). The password reaches libpq through a 0600 `PGPASSFILE` in
   the work folder, not as `PGPASSWORD` in the environment of every child
   (round 6, S24).
5. **`backup.sh` keeps `.partial` until the restore test passes** and the
   throwaway database of `restore.sh` is dropped from its exit trap, also on
   failure (findings B4 and B2).

## Consequences

- The first production backup after this ADR is the first real run of the
  filter: if its restore test stops at `role "…" does not exist`, a grant was
  given by a role other than the owner (pg_dump wraps it in
  `SET SESSION AUTHORIZATION`) and the filter does not cover it; the backup
  stays `.partial`-then-removed and nothing looks valid.
- Locally, the `service_role` grants of production are listed and skipped;
  on a target that has the role they come back. Neither case touches what
  `coco_app` may do.
- Older backups are still complete for data; the runbook says how to use one.
- The `CREATE` on `public` row is the one check that cannot be rehearsed
  locally against production's real `nspacl` (the filter keeps grants `TO
PUBLIC`): if the first real backup after round 4 fails there, the runbook
  ("Restore") says what the owner revokes in production.
- Connections never travel as a URL on a command line: `pg_dump`, `psql` and
  `pg_restore` get the `PG*` variables (`scripts/db/pg-env.mjs`), because
  argv is visible in `ps` and the URL carries the password (round 4, S10).

Rehearsed on 2026-10-10 against a local source database with seed rows, a
temporary role granted everything (present at backup time, dropped before a
second restore: 14 statements skipped), a tampered manifest (exit 1, database
dropped) and a restore test made to fail inside `backup.sh` (no archive left).
Again on 2026-10-11 (round 4): a full backup verified with the wider check
(37 privilege statements, defaults included); `USAGE` on `app_private`
revoked in the source → the restore test names it and no archive is left;
relative paths; an `-incompleto` file newer than the real backup ignored.
