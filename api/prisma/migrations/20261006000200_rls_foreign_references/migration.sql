-- Step R-2-rls: a user's row cannot point at another user's row (ADR 0019).
--
-- The policies of 20261006000000 check the row's OWN owner: its user_id, or
-- its parent's for the tables without one. They did not check what the row
-- POINTS AT. A foreign key is checked by Postgres as the table's owner, with
-- no policy in the way, so a split of Ana's movement could name Bruno's
-- concept, a tag of Bruno's could hang from Ana's movement, and so on: twelve
-- references, every one accepted (row-level-security.e2e-spec.ts).
--
-- What that would leak is small —an id, a name through a join— but it is the
-- isolation the audit of 5 Oct 2026 flagged in the splits (OWASP A01), and a
-- unification or a recalculation that later follows those references would
-- move one user's money under another's tree.
--
-- The fix is in WITH CHECK only: it is evaluated on INSERT and UPDATE, row by
-- row, with a primary-key lookup per non-null reference. USING —what every
-- read pays— does not change.
--
-- ALTER POLICY instead of rewriting 20261006000000: that migration is
-- already in the branch's history and in local databases, and an edited
-- migration changes its checksum and forces every one of them to be rebuilt.
-- This one is additive: same policy names, same USING, a narrower check.
--
-- Why not a composite foreign key (user_id, category_id): the child tables
-- without user_id (splits, tags, imported rows) would need the column, its
-- backfill and an expand-and-contract in the code. The check gives the same
-- guarantee with no schema change.
--
-- The subqueries name `user_id` explicitly even though, run as coco_app, the
-- referenced table's own policy would already hide another user's row: the
-- check does not depend on that, and it reads as what it means.
--
-- Referential ACTIONS (ON DELETE SET NULL / CASCADE) are not affected:
-- Postgres runs them as the owner and they never evaluate a policy.

-- ── Tables with user_id ─────────────────────────────────────────────────────
-- A category's parent is another category, and a policy on `categories` that
-- reads `categories` in a subquery is refused by Postgres as infinite
-- recursion (42P17). The lookup goes through a function instead: it runs as
-- the CALLER —not a definer, so the caller's policies still apply inside—
-- and its fixed search_path keeps it from being inlined back into the policy.
CREATE OR REPLACE FUNCTION app_private.is_own_category(category_id bigint)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_id
      AND c.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
$$;

REVOKE ALL ON FUNCTION app_private.is_own_category(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_own_category(bigint) TO coco_app;

ALTER POLICY categories_owner ON public.categories
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)
    AND (parent_id IS NULL OR app_private.is_own_category(parent_id)));

ALTER POLICY category_rules_owner ON public.category_rules
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)
    AND EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = category_rules.category_id
        AND c.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)));

ALTER POLICY import_batches_owner ON public.import_batches
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = import_batches.account_id
        AND a.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))));

ALTER POLICY soportes_owner ON public.soportes
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)
    AND EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = soportes.transaction_id
        AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)));

ALTER POLICY transactions_owner ON public.transactions
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = transactions.category_id
        AND c.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)))
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)))
    AND (import_batch_id IS NULL OR EXISTS (
      SELECT 1 FROM public.import_batches b
      WHERE b.id = transactions.import_batch_id
        AND b.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))));

-- ── Tables without user_id: the parent, and now what they point at ─────────
ALTER POLICY transaction_splits_via_transaction ON public.transaction_splits
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_splits.transaction_id
        AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = transaction_splits.category_id
        AND c.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))));

ALTER POLICY transaction_tags_via_transaction ON public.transaction_tags
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_tags.transaction_id
        AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
    AND EXISTS (
      SELECT 1 FROM public.tags g
      WHERE g.id = transaction_tags.tag_id
        AND g.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)));

ALTER POLICY import_rows_via_batch ON public.import_rows
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.import_batches b
      WHERE b.id = import_rows.batch_id
        AND b.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
    AND (category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = import_rows.category_id
        AND c.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)))
    AND (duplicate_of_id IS NULL OR EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = import_rows.duplicate_of_id
        AND t.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))));

-- ── users: the directory stays open, but the app never deletes an account ───
-- Nothing in the API deletes a user (an admin blocks it); the e2e cleanup and
-- any manual removal go through the owner. Taking DELETE away means a bug
-- or an injection through the app role cannot wipe an account and, by
-- cascade, everything it owns.
REVOKE DELETE ON TABLE public.users FROM coco_app;
