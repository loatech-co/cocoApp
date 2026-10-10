# 0027 — The app role creates only pending users, or the first admin

- Status: accepted (code merged; the migration waits for the owner to apply it in production)
- Date: 2026-10-09
- Deciders: the owner (cierre J), step J-5

## Context and problem statement

Since 20261006000300 `coco_app` cannot UPDATE `role` or `status` of `users`:
those change only through `app_private.set_user_access`, which demands an
active admin. INSERT stayed table-wide, because the sign-up writes both
columns: the `BOOTSTRAP_ADMIN_EMAIL` account is born admin and active. A query
bug or an injection through the app could therefore still INSERT a new active
admin, which the auth guard trusts on every request.

The fix had to deploy with code that runs the same whether the migration is
applied or not, because applying it to production is the owner's call.

## Decision

A `BEFORE INSERT OR UPDATE` trigger on `public.users`,
`app_private.guard_users_access()` (migration
`20261010003334_guard_users_insert`), that acts only when `current_user` is
`coco_app`:

- **INSERT** passes for `role = 'user'`, `status = 'pending'`, never approved
  (the normal sign-up), or for `role = 'admin'`, `status = 'active'`, no
  approver, **only while `users` has no admin at all**, in any status (the
  bootstrap). An advisory lock serializes two simultaneous bootstraps.
  Anything else raises `42501`.
- **UPDATE** never changes `role`, `status`, `approved_at` or
  `approved_by_id`. The column privileges already refuse it; the trigger is
  the second lock if a grant is ever widened.

The owner (migrations, fixtures, data fixes) and `set_user_access` (SECURITY
DEFINER, runs as its owner) are not affected. No line of the API changed.

## Considered options

- **Column privileges on INSERT** (no `role`, `status`, `approved_at`): the
  bootstrap writes them, so it would need a definer function and a code
  change that breaks while the migration is not applied.
- **A SECURITY DEFINER `create_user` function**: same problem, plus a third
  definer to audit.
- **Bootstrap email stored in the database**: explicit, but one more piece of
  production configuration for a path that is used once; "no admin exists"
  closes it the moment it has been used.

## Consequences

- In production, which already has an admin, `coco_app` cannot create one at
  all. A fresh database still accepts exactly one, and the app only attempts
  it for `BOOTSTRAP_ADMIN_EMAIL`.
- If `BOOTSTRAP_ADMIN_EMAIL` names a NEW address while an admin exists, its
  sign-up fails after Supabase created the credential (a profile-less account).
  Promote through the admin screen instead.
- Applying and undoing it in production: runbook, "Guard on `users` inserts
  (J-5)".
