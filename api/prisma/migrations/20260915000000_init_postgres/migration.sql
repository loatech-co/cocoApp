-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('cash', 'debit', 'credit', 'bank', 'savings', 'other');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('expense', 'income', 'transfer');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('expense', 'income', 'transfer');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('cleared', 'pending');

-- CreateEnum
CREATE TYPE "TransferDirection" AS ENUM ('out', 'in');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('draft', 'committed', 'discarded');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('pending', 'accepted', 'duplicate', 'skipped');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('image', 'pdf', 'csv', 'manual');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "uuid" CHAR(36) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "sessions_valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(0),
    "last_login_at" TIMESTAMP(0),
    "approved_at" TIMESTAMP(0),
    "approved_by_id" BIGINT,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" CHAR(36) NOT NULL,
    "expires_at" TIMESTAMP(0) NOT NULL,
    "used_at" TIMESTAMP(0),
    "revoked_at" TIMESTAMP(0),
    "user_agent" VARCHAR(255),
    "ip" VARCHAR(45),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "entity" VARCHAR(64) NOT NULL,
    "entity_id" BIGINT,
    "action" VARCHAR(64) NOT NULL,
    "changes_json" JSONB,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'other',
    "currency" CHAR(3) NOT NULL DEFAULT 'COP',
    "institution" VARCHAR(255),
    "last4" CHAR(4),
    "credit_limit" DECIMAL(15,2),
    "cutoff_day" SMALLINT,
    "payment_day" SMALLINT,
    "opening_balance" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" BIGINT,
    "kind" "CategoryKind" NOT NULL DEFAULT 'expense',
    "color" CHAR(7),
    "icon" VARCHAR(64),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "color" CHAR(7),

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" BIGSERIAL NOT NULL,
    "uuid" CHAR(36) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'expense',
    "category_id" BIGINT,
    "description" VARCHAR(255),
    "merchant" VARCHAR(255),
    "notes" TEXT,
    "transfer_group_id" CHAR(36),
    "transfer_direction" "TransferDirection",
    "external_ref" VARCHAR(255),
    "import_batch_id" BIGINT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'cleared',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "category_id" BIGINT,
    "amount" DECIMAL(15,2) NOT NULL,
    "note" VARCHAR(255),

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_tags" (
    "transaction_id" BIGINT NOT NULL,
    "tag_id" BIGINT NOT NULL,

    CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("transaction_id","tag_id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" BIGSERIAL NOT NULL,
    "uuid" CHAR(36) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "source" "ImportSource" NOT NULL DEFAULT 'image',
    "status" "ImportStatus" NOT NULL DEFAULT 'draft',
    "label" VARCHAR(255),
    "ocr_provider" VARCHAR(64),
    "committed_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" BIGSERIAL NOT NULL,
    "batch_id" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'expense',
    "description" VARCHAR(255),
    "status" "ImportRowStatus" NOT NULL DEFAULT 'pending',
    "category_id" BIGINT,
    "confidence" SMALLINT,
    "fingerprint" CHAR(64) NOT NULL,
    "duplicate_of_id" BIGINT,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_rules" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "pattern" VARCHAR(120) NOT NULL,
    "category_id" BIGINT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "pref_key" VARCHAR(64) NOT NULL,
    "pref_value" JSONB NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_uuid" ON "users"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_status" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_refresh_token_hash" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_refresh_user_revoked" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "idx_refresh_family" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "idx_refresh_expires" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "idx_audit_user_created" ON "audit_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_action_created" ON "audit_log"("action", "created_at");

-- CreateIndex
CREATE INDEX "idx_accounts_user_archived" ON "accounts"("user_id", "is_archived");

-- CreateIndex
CREATE INDEX "idx_categories_user_kind_parent" ON "categories"("user_id", "kind", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tags_user_name" ON "tags"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_transactions_uuid" ON "transactions"("uuid");

-- CreateIndex
CREATE INDEX "idx_tx_user_import_batch" ON "transactions"("user_id", "import_batch_id");

-- CreateIndex
CREATE INDEX "idx_tx_user_date" ON "transactions"("user_id", "date");

-- CreateIndex
CREATE INDEX "idx_tx_user_category" ON "transactions"("user_id", "category_id");

-- CreateIndex
CREATE INDEX "idx_tx_account_date" ON "transactions"("account_id", "date");

-- CreateIndex
CREATE INDEX "idx_tx_user_external_ref" ON "transactions"("user_id", "external_ref");

-- CreateIndex
CREATE INDEX "idx_tx_transfer_group" ON "transactions"("transfer_group_id");

-- CreateIndex
CREATE INDEX "idx_splits_transaction" ON "transaction_splits"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_tt_tag" ON "transaction_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_import_batches_uuid" ON "import_batches"("uuid");

-- CreateIndex
CREATE INDEX "idx_import_batch_user_status" ON "import_batches"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_import_row_batch_position" ON "import_rows"("batch_id", "position");

-- CreateIndex
CREATE INDEX "idx_rule_user_priority" ON "category_rules"("user_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "uq_rule_user_pattern" ON "category_rules"("user_id", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pref_user_key" ON "user_preferences"("user_id", "pref_key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "fk_users_approved_by" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "fk_refresh_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "fk_audit_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "fk_accounts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "fk_tags_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fk_tx_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fk_tx_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fk_tx_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "fk_tx_import_batch" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "fk_splits_tx" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "fk_splits_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "fk_tt_tx" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "fk_tt_tag" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "fk_import_batch_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "fk_import_batch_account" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "fk_import_row_batch" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "fk_import_row_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "fk_import_row_duplicate" FOREIGN KEY ("duplicate_of_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_rules" ADD CONSTRAINT "fk_rule_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_rules" ADD CONSTRAINT "fk_rule_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "fk_pref_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

