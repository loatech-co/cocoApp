# 0033 — Backups carry the privileges; the restore applies the ones the target can take

- Status: accepted
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
   platform's) and `DEFAULT ACL` entries stay out: they hang off the owner
   role, which `--no-owner` already leaves behind, and the RLS migration owns
   them.
3. **The restore verifies the privileges of `coco_app`** and exits `1` if
   they are wider or narrower than the migrations left them. A dump without
   privileges (every backup before this ADR) restores its data and fails this
   check.
4. **A Supabase project is not a target of `restore.sh`.** The script refuses
   it; the runbook keeps the manual recipe for a new project, marked as never
   rehearsed. `--i-know-this-is-production` is gone with it: restoring into
   production is an owner stop (`CLAUDE.md`).
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

Rehearsed on 2026-10-10 against a local source database with seed rows, a
temporary role granted everything (present at backup time, dropped before a
second restore: 14 statements skipped), a tampered manifest (exit 1, database
dropped) and a restore test made to fail inside `backup.sh` (no archive left).
