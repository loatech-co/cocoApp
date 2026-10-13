-- ADR 0036: the periods in which a recurring concept stops renewing.
--
-- Additive: a new table nothing reads yet. The code deployed before it never
-- touches it, so the order «migration first, then the code» holds.
--
-- The CREATE TABLE, indexes and foreign keys below come from
-- scripts/new-migration.sh; the CHECK constraints and the row-level security
-- are written by hand, because Prisma generates neither.

-- CreateTable
CREATE TABLE "recurrence_pauses" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "category_id" BIGINT NOT NULL,
    "from_month" DATE NOT NULL,
    "resume_month" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_recurrence_pauses" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_recurrence_pauses_user_id_category_id_from_month" ON "recurrence_pauses"("user_id", "category_id", "from_month");

-- CreateIndex
CREATE INDEX "idx_recurrence_pauses_category_id" ON "recurrence_pauses"("category_id");

-- AddForeignKey
ALTER TABLE "recurrence_pauses" ADD CONSTRAINT "fk_recurrence_pauses_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrence_pauses" ADD CONSTRAINT "fk_recurrence_pauses_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── The shape of a period (the API checks it first, with its own sentence) ──
-- Months are stored as day 1, and a period is half-open
-- [from_month, resume_month): the resume month is the first one active again.
ALTER TABLE "recurrence_pauses"
  ADD CONSTRAINT "ck_recurrence_pauses_from_month_first_day"
    CHECK (EXTRACT(DAY FROM "from_month") = 1),
  ADD CONSTRAINT "ck_recurrence_pauses_resume_month_first_day"
    CHECK ("resume_month" IS NULL OR EXTRACT(DAY FROM "resume_month") = 1),
  ADD CONSTRAINT "ck_recurrence_pauses_resume_after_from"
    CHECK ("resume_month" IS NULL OR "resume_month" > "from_month");

-- ── Row-level security, like every user table (ADR 0019, 0024) ─────────────
-- The row is its user's, and it may only point at a category of that same
-- user (the check of 20261006000200_rls_foreign_references). The policy count
-- goes from 14 to 15: scripts/db/expected-policies.sh.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurrence_pauses TO coco_app;
GRANT USAGE, SELECT ON SEQUENCE public.recurrence_pauses_id_seq TO coco_app;

ALTER TABLE public.recurrence_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_pauses FORCE ROW LEVEL SECURITY;
CREATE POLICY recurrence_pauses_owner ON public.recurrence_pauses FOR ALL TO coco_app
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint))
  WITH CHECK (
    user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::bigint)
    AND app_private.is_own_category(category_id));
