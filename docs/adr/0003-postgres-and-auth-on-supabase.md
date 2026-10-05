# 0003 — PostgreSQL and identity on Supabase

- Status: accepted; supersedes the database and identity layers of
  [0002](0002-portable-first-stack.md)
- Date: 2026-09-15
- Deciders: the owner

## Context and problem statement

Coco started on the host's shared MariaDB with its own authentication
(argon2 hashes, JWTs signed with a local secret). The shared database had the
limits 0002 listed, no managed backups, and running our own password storage
is a liability with no product value. Supabase's free plan offers a managed
PostgreSQL and a hosted auth service (GoTrue) at zero cost.

## Decision outcome

**Data lives in PostgreSQL on Supabase; credentials live in Supabase Auth.**
The API stays the only door: the browser never talks to Supabase.

What the app keeps, because Supabase does not model it: approval of every
account by an admin (accounts are born `pending`), roles and status read from
the database on every request rather than from the token, immediate
revocation (`users.sessions_valid_from`), the audit log, and the password
policy (known-breach check, not derived from name or email).

- Signatures are verified against the project's JWKS (ES256) with `jose`; the
  API holds no signing secret and a key rotation needs no redeploy.
- The refresh token lives in an httpOnly, `SameSite=Strict` cookie set by the
  API. `supabase-js` would keep it in `localStorage`, readable by any injected
  script; for financial data that weighs more than convenience.
- The revocation mark is compared with the token's `iat`, which has second
  precision: it is truncated to the second when an account is created and set
  to the next second when sessions are revoked.

## Consequences

- Good: managed Postgres and auth at zero cost; no password hashes of ours.
- Two engine differences changed code that must not be undone blindly:
  text comparison is case-sensitive in Postgres, so tag get-or-create searches
  case-insensitively and a unique index on `lower(name)` catches races; and
  Postgres rounds timestamps where MariaDB truncated, so timestamps keep
  millisecond precision.
- Bad: login no longer resists timing attacks — the equivalent hash for an
  unknown email used to run here and now runs inside Supabase. Registration
  still calls Supabase whether or not the email exists and answers the same.
- Bad: the audit log can no longer tell "unknown email" from "wrong password".
- Bad: Supabase publishes the `public` schema as a REST API; closing it is an
  operational duty ([0007](0007-close-supabase-data-api-by-script.md)).
- There is no way back to MariaDB: it was emptied after Postgres was
  confirmed; its last dump is kept in `$COCO_DATA_DIR/respaldos/`.
