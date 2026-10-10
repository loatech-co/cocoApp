-- Step J-5: coco_app can no longer create an admin, nor an account that is
-- born active or approved (ADR 0027).
--
-- 20261006000300 took UPDATE of `role` and `status` away from the app role,
-- but INSERT stayed table-wide: the sign-up writes those columns, because the
-- BOOTSTRAP_ADMIN_EMAIL account is born admin and active. So a query bug or an
-- injection through the app could still INSERT a brand-new active admin.
--
-- Additive and with no change in the code: a BEFORE trigger on `users` that
-- only acts when the statement runs AS coco_app. The owner (migrations,
-- fixtures, data fixes) and `app_private.set_user_access` (SECURITY DEFINER,
-- so it runs as its owner) are not affected. The code deployed before and
-- after this migration is the same, which is what lets it be applied to
-- production whenever the owner decides.
--
-- What coco_app may INSERT:
--   1. role 'user', status 'pending', never approved: the normal sign-up.
--   2. role 'admin', status 'active', no approver, and ONLY while the table
--      has no admin at all (any status): the bootstrap of the first admin.
--      The app does it only for BOOTSTRAP_ADMIN_EMAIL; the database closes
--      the path for good as soon as one admin exists. An advisory lock
--      serializes two simultaneous bootstraps so both cannot see zero.
-- Anything else is refused with 42501 (insufficient_privilege).
--
-- What coco_app may UPDATE: never role, status, approved_at or
-- approved_by_id. The column privileges of 20261006000300 already refuse it
-- first; the trigger is the second lock if a future grant widens them.
--
-- Not SECURITY DEFINER: it only reads NEW, OLD and whether an admin exists,
-- which coco_app can already read (`users_directory`). Firing a trigger does
-- not check EXECUTE, so it is taken from PUBLIC like every app_private
-- function. `OR REPLACE` because the shadow database of `migrate diff` keeps
-- `app_private` between runs; the trigger lives on `public.users`, which the
-- shadow database rebuilds every time.
--
-- Undo: DROP TRIGGER guard_users_access ON public.users;
--       DROP FUNCTION app_private.guard_users_access();
--       and delete this migration's row from _prisma_migrations.

CREATE OR REPLACE FUNCTION app_private.guard_users_access()
  RETURNS trigger
  LANGUAGE plpgsql
  VOLATILE
  SET search_path = ''
AS $$
BEGIN
  IF current_user <> 'coco_app' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id THEN
      RAISE EXCEPTION 'guard_users_access: the app role cannot change the role, the status or the approval'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT, 1: the normal sign-up.
  IF NEW.role = 'user' AND NEW.status = 'pending'
     AND NEW.approved_at IS NULL AND NEW.approved_by_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- INSERT, 2: the first admin, and only while there is none.
  IF NEW.role = 'admin' AND NEW.status = 'active' AND NEW.approved_by_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('app_private.guard_users_access'));
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.role = 'admin') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'guard_users_access: the app role can only create a pending user, or the first admin'
    USING ERRCODE = '42501';
END
$$;

REVOKE ALL ON FUNCTION app_private.guard_users_access() FROM PUBLIC;

CREATE TRIGGER guard_users_access
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_users_access();
