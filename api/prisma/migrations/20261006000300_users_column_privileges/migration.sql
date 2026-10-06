-- Step 7.11-b-prod: coco_app updates only the columns of `users` the API
-- really changes. Additive: it narrows privileges and adds one function.
--
-- Until now the `users_directory` policy and a table-wide UPDATE let the
-- application role rewrite any column of any account, so a query bug or an
-- injection could turn anyone into an active admin. The role and the status
-- are what the auth guard trusts on every request; they now change only
-- through `app_private.set_user_access`, which checks that the unit of work
-- runs as an active admin.
--
-- What the API updates with a plain UPDATE (UsersRepository.update):
--   last_login_at, sessions_valid_from (login, revoke all sessions)
--   updated_at (Prisma's @updatedAt, written on every update)

-- ── 1. Column privileges ───────────────────────────────────────────────────
-- A table-wide grant includes every column, so it is taken away first and
-- the three columns are given back one by one.
REVOKE UPDATE ON TABLE public.users FROM coco_app;
GRANT UPDATE (last_login_at, sessions_valid_from, updated_at) ON TABLE public.users TO coco_app;

-- ── 2. The bounded admin path ──────────────────────────────────────────────
-- Approve, suspend, reactivate and change the role. Runs as its owner (who
-- has BYPASSRLS and every privilege on `users`), with a fixed search_path.
--
-- The actor is NOT a parameter: it is the user the unit of work runs as
-- (`app.current_user_id`, set by `Database.forUser`). A caller can only act as
-- itself, and only while that user is an active admin. The business rules
-- (not on yourself, keep one admin) stay in AdminService; this is the lock
-- behind them.
--
-- `approve` also stamps who approved the account and when, as the admin
-- screen did. NULL in `new_status` or `new_role` leaves that column as is.
CREATE OR REPLACE FUNCTION app_private.set_user_access(
  target_id bigint,
  new_status public."UserStatus",
  new_role public."UserRole",
  approve boolean
)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  actor_id bigint := NULLIF(current_setting('app.current_user_id', true), '')::bigint;
BEGIN
  IF actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = actor_id AND u.role = 'admin' AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'set_user_access: the unit of work is not an active admin'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
     SET status         = COALESCE(new_status, status),
         role           = COALESCE(new_role, role),
         approved_at    = CASE WHEN approve THEN (now() AT TIME ZONE 'UTC') ELSE approved_at END,
         approved_by_id = CASE WHEN approve THEN actor_id ELSE approved_by_id END,
         updated_at     = (now() AT TIME ZONE 'UTC')
   WHERE id = target_id;
END
$$;

REVOKE ALL ON FUNCTION app_private.set_user_access(bigint, public."UserStatus", public."UserRole", boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.set_user_access(bigint, public."UserStatus", public."UserRole", boolean) TO coco_app;
