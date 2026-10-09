# 0007 — Close Supabase's data API with an idempotent script after every migration

- Status: accepted
- Date: 2026-09-16 (recorded in step 7.12)
- Deciders: the owner

## Context and problem statement

Supabase publishes the `public` schema as a REST API and grants `anon` and
`authenticated` full rights on every table it sees. The `anon` key is public
by design. Supabase's advisor flagged all fourteen tables as critical: anyone
with the key could read or empty the database without going through Coco.
Coco never uses that door — the browser talks only to the API, and the API
connects with Prisma as the table owner, which bypasses row-level security.

Step 7.12 asked whether `scripts/close-data-api.sql` should become a
Prisma migration.

## Considered options

- A Prisma migration.
- **Keep the script, run by `scripts/deploy-migrations.sh` after every
  `migrate deploy`.**

## Decision outcome

**Keep it as a script.** It enables RLS with no policy on every table in
`public`, revokes all rights from `anon` and `authenticated`, and revokes the
default privileges so future tables are not born open; then it prints three
counts that must be zero.

- A migration also runs against local Postgres and the CI service, where the
  `anon` and `authenticated` roles do not exist: the `REVOKE` fails and no
  one can migrate. It is hosting configuration, not schema.
- Default privileges cannot turn RLS on for a new table, so part of it must
  run again after every migration that adds one. A migration runs once.
- It is idempotent, so running it every time costs nothing and removes "did
  this migration add a table?" from the checklist.

## Consequences

- Good: no table is ever reachable through the data API, even for a moment
  longer than the deploy.
- Bad: a migration applied without `deploy-migrations.sh` leaves new
  tables open until the script runs; the runbook says never to do that.
- Revisit when RLS with an application role
  ([0010](0010-rls-with-application-role.md)) lands: policies will then
  exist, and the "zero policies" check has to change with it.
