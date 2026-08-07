-- AlterTable
ALTER TABLE `audit_log` MODIFY `changes_json` JSON NULL;

-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `import_batch_id` BIGINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `user_preferences` MODIFY `pref_value` JSON NOT NULL;

-- CreateTable
CREATE TABLE `import_batches` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `source` ENUM('image', 'pdf', 'manual') NOT NULL DEFAULT 'image',
    `status` ENUM('draft', 'committed', 'discarded') NOT NULL DEFAULT 'draft',
    `label` VARCHAR(255) NULL,
    `ocr_provider` VARCHAR(64) NULL,
    `committed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `uq_import_batches_uuid`(`uuid`),
    INDEX `idx_import_batch_user_status`(`user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_rows` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `batch_id` BIGINT UNSIGNED NOT NULL,
    `position` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `type` ENUM('expense', 'income', 'transfer') NOT NULL DEFAULT 'expense',
    `description` VARCHAR(255) NULL,
    `status` ENUM('pending', 'accepted', 'duplicate', 'skipped') NOT NULL DEFAULT 'pending',
    `category_id` BIGINT UNSIGNED NULL,
    `confidence` TINYINT UNSIGNED NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `duplicate_of_id` BIGINT UNSIGNED NULL,

    INDEX `idx_import_row_batch_position`(`batch_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category_rules` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `pattern` VARCHAR(120) NOT NULL,
    `category_id` BIGINT UNSIGNED NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_rule_user_priority`(`user_id`, `priority`),
    UNIQUE INDEX `uq_rule_user_pattern`(`user_id`, `pattern`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_tx_user_import_batch` ON `transactions`(`user_id`, `import_batch_id`);

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `fk_tx_import_batch` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `fk_import_batch_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_batches` ADD CONSTRAINT `fk_import_batch_account` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_rows` ADD CONSTRAINT `fk_import_row_batch` FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_rows` ADD CONSTRAINT `fk_import_row_category` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `import_rows` ADD CONSTRAINT `fk_import_row_duplicate` FOREIGN KEY (`duplicate_of_id`) REFERENCES `transactions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category_rules` ADD CONSTRAINT `fk_rule_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category_rules` ADD CONSTRAINT `fk_rule_category` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

