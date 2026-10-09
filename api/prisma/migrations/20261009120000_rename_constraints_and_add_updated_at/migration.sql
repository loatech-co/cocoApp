-- Step 7.2-r5 (ADR 0026): constraint and index names to the convention, and
-- `updated_at` on the tables that lacked it.
--
-- Nothing here moves data. Tables and columns keep their (partly Spanish)
-- names behind `@@map` / `@map`; only the names of the constraints and indexes
-- change, and those are read by nobody but the `map:` arguments of
-- `schema.prisma`, which change in the same commit. The CHECK constraints
-- (`ck_categories_*`) already follow the convention and are not touched: the
-- exceptions filter keys its 422 messages by their names.
--
-- Convention: `pk_<table>`, `fk_<table>_<column>`, `uq_<table>_<columns>`,
-- `idx_<table>_<columns>`, with the ENGLISH table and column names of the
-- Prisma models (`soportes` → `receipts`, `audit_log` → `audit_logs`).
--
-- RLS, the policies and the grants name tables, columns and roles, never a
-- constraint or an index, so they stay as they were. The new columns are
-- covered by the table-level grants to `coco_app`; the only column-level grant
-- (`users`) is on a table that already had `updated_at`.
--
-- One transaction: a rename that fails (a name that is not there) leaves the
-- database exactly as it was, instead of half renamed. Renames and an
-- `ADD COLUMN` with a constant default are catalog changes (no rewrite), but
-- they take an ACCESS EXCLUSIVE lock; the timeout makes the migration give up
-- rather than queue every request behind a long-running query.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- Primary keys: Postgres renames the index behind the constraint too.
ALTER TABLE "accounts" RENAME CONSTRAINT "accounts_pkey" TO "pk_accounts";
ALTER TABLE "audit_log" RENAME CONSTRAINT "audit_log_pkey" TO "pk_audit_logs";
ALTER TABLE "categories" RENAME CONSTRAINT "categories_pkey" TO "pk_categories";
ALTER TABLE "category_rules" RENAME CONSTRAINT "category_rules_pkey" TO "pk_category_rules";
ALTER TABLE "import_batches" RENAME CONSTRAINT "import_batches_pkey" TO "pk_import_batches";
ALTER TABLE "import_rows" RENAME CONSTRAINT "import_rows_pkey" TO "pk_import_rows";
ALTER TABLE "soportes" RENAME CONSTRAINT "soportes_pkey" TO "pk_receipts";
ALTER TABLE "tags" RENAME CONSTRAINT "tags_pkey" TO "pk_tags";
ALTER TABLE "transaction_splits" RENAME CONSTRAINT "transaction_splits_pkey" TO "pk_transaction_splits";
ALTER TABLE "transaction_tags" RENAME CONSTRAINT "transaction_tags_pkey" TO "pk_transaction_tags";
ALTER TABLE "transactions" RENAME CONSTRAINT "transactions_pkey" TO "pk_transactions";
ALTER TABLE "user_preferences" RENAME CONSTRAINT "user_preferences_pkey" TO "pk_user_preferences";
ALTER TABLE "users" RENAME CONSTRAINT "users_pkey" TO "pk_users";

-- Indexes, unique ones included (Prisma creates them as indexes, not as
-- constraints).
ALTER INDEX "idx_accounts_user_archived" RENAME TO "idx_accounts_user_id_is_archived";
ALTER INDEX "idx_audit_entity" RENAME TO "idx_audit_logs_entity_entity_id";
ALTER INDEX "idx_audit_user_created" RENAME TO "idx_audit_logs_user_id_created_at";
ALTER INDEX "idx_audit_action_created" RENAME TO "idx_audit_logs_action_created_at";
ALTER INDEX "idx_categories_user_kind_parent" RENAME TO "idx_categories_user_id_kind_parent_id";
ALTER INDEX "idx_rule_user_priority" RENAME TO "idx_category_rules_user_id_priority";
ALTER INDEX "uq_rule_user_pattern" RENAME TO "uq_category_rules_user_id_pattern";
ALTER INDEX "idx_import_batch_user_status" RENAME TO "idx_import_batches_user_id_status";
ALTER INDEX "idx_import_row_batch_position" RENAME TO "idx_import_rows_batch_id_position";
ALTER INDEX "uq_soportes_uuid" RENAME TO "uq_receipts_uuid";
ALTER INDEX "uq_soportes_storage_key" RENAME TO "uq_receipts_storage_key";
ALTER INDEX "idx_soportes_tx_orden" RENAME TO "idx_receipts_transaction_id_position";
ALTER INDEX "idx_soportes_user" RENAME TO "idx_receipts_user_id";
ALTER INDEX "uq_soportes_tx_huella" RENAME TO "uq_receipts_transaction_id_content_hash";
ALTER INDEX "uq_tags_user_name" RENAME TO "uq_tags_user_id_name";
-- Expression index (`lower(name)`), outside schema.prisma: Prisma cannot
-- describe it, and `migrate diff` does not see it.
ALTER INDEX "uq_tags_user_name_ci" RENAME TO "uq_tags_user_id_lower_name";
ALTER INDEX "idx_splits_transaction" RENAME TO "idx_transaction_splits_transaction_id";
ALTER INDEX "idx_tt_tag" RENAME TO "idx_transaction_tags_tag_id";
ALTER INDEX "idx_tx_user_import_batch" RENAME TO "idx_transactions_user_id_import_batch_id";
ALTER INDEX "idx_tx_user_date" RENAME TO "idx_transactions_user_id_date";
ALTER INDEX "idx_tx_user_category" RENAME TO "idx_transactions_user_id_category_id";
ALTER INDEX "idx_tx_account_date" RENAME TO "idx_transactions_account_id_date";
ALTER INDEX "idx_tx_transfer_group" RENAME TO "idx_transactions_transfer_group_id";
ALTER INDEX "idx_tx_user_period" RENAME TO "idx_transactions_user_id_period";
ALTER INDEX "uq_tx_user_external_ref" RENAME TO "uq_transactions_user_id_external_ref";
ALTER INDEX "uq_pref_user_key" RENAME TO "uq_user_preferences_user_id_pref_key";

-- Foreign keys.
ALTER TABLE "accounts" RENAME CONSTRAINT "fk_accounts_user" TO "fk_accounts_user_id";
ALTER TABLE "audit_log" RENAME CONSTRAINT "fk_audit_user" TO "fk_audit_logs_user_id";
ALTER TABLE "categories" RENAME CONSTRAINT "fk_categories_user" TO "fk_categories_user_id";
ALTER TABLE "categories" RENAME CONSTRAINT "fk_categories_parent" TO "fk_categories_parent_id";
ALTER TABLE "category_rules" RENAME CONSTRAINT "fk_rule_user" TO "fk_category_rules_user_id";
ALTER TABLE "category_rules" RENAME CONSTRAINT "fk_rule_category" TO "fk_category_rules_category_id";
ALTER TABLE "import_batches" RENAME CONSTRAINT "fk_import_batch_user" TO "fk_import_batches_user_id";
ALTER TABLE "import_batches" RENAME CONSTRAINT "fk_import_batch_account" TO "fk_import_batches_account_id";
ALTER TABLE "import_rows" RENAME CONSTRAINT "fk_import_row_batch" TO "fk_import_rows_batch_id";
ALTER TABLE "import_rows" RENAME CONSTRAINT "fk_import_row_category" TO "fk_import_rows_category_id";
ALTER TABLE "import_rows" RENAME CONSTRAINT "fk_import_row_duplicate" TO "fk_import_rows_duplicate_of_id";
ALTER TABLE "soportes" RENAME CONSTRAINT "fk_soportes_user" TO "fk_receipts_user_id";
ALTER TABLE "soportes" RENAME CONSTRAINT "fk_soportes_transaction" TO "fk_receipts_transaction_id";
ALTER TABLE "tags" RENAME CONSTRAINT "fk_tags_user" TO "fk_tags_user_id";
ALTER TABLE "transaction_splits" RENAME CONSTRAINT "fk_splits_tx" TO "fk_transaction_splits_transaction_id";
ALTER TABLE "transaction_splits" RENAME CONSTRAINT "fk_splits_category" TO "fk_transaction_splits_category_id";
ALTER TABLE "transaction_tags" RENAME CONSTRAINT "fk_tt_tx" TO "fk_transaction_tags_transaction_id";
ALTER TABLE "transaction_tags" RENAME CONSTRAINT "fk_tt_tag" TO "fk_transaction_tags_tag_id";
ALTER TABLE "transactions" RENAME CONSTRAINT "fk_tx_user" TO "fk_transactions_user_id";
ALTER TABLE "transactions" RENAME CONSTRAINT "fk_tx_account" TO "fk_transactions_account_id";
ALTER TABLE "transactions" RENAME CONSTRAINT "fk_tx_category" TO "fk_transactions_category_id";
ALTER TABLE "transactions" RENAME CONSTRAINT "fk_tx_import_batch" TO "fk_transactions_import_batch_id";
ALTER TABLE "user_preferences" RENAME CONSTRAINT "fk_pref_user" TO "fk_user_preferences_user_id";
ALTER TABLE "users" RENAME CONSTRAINT "fk_users_approved_by" TO "fk_users_approved_by_id";

-- `updated_at` where it was missing. Born `timestamptz(3)`, the type every
-- timestamp moves to in phase 8 (ADR 0026, point 4). The default fills the
-- existing rows with the moment of the migration, a "last touched no later
-- than" that is true; from then on Prisma's `@updatedAt` writes it.
--
-- Not on `audit_log` (append-only: a row is never updated) nor on
-- `import_rows` (a staging row lives as long as its import is pending).
ALTER TABLE "categories" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "category_rules" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "soportes" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "tags" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "transaction_splits" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "transaction_tags" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user_preferences" ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;
