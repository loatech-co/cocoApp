-- DropIndex
DROP INDEX `idx_users_email` ON `users`;

-- DropIndex
DROP INDEX `uq_users_firebase_uid` ON `users`;

-- AlterTable
ALTER TABLE `user_preferences` MODIFY `pref_value` JSON NOT NULL;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `firebase_uid`,
    ADD COLUMN `approved_at` DATETIME(0) NULL,
    ADD COLUMN `approved_by_id` BIGINT UNSIGNED NULL,
    ADD COLUMN `failed_login_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `last_login_at` DATETIME(0) NULL,
    ADD COLUMN `locked_until` DATETIME(0) NULL,
    ADD COLUMN `password_hash` VARCHAR(255) NOT NULL,
    ADD COLUMN `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    ADD COLUMN `sessions_valid_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `status` ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `family_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `used_at` DATETIME(0) NULL,
    `revoked_at` DATETIME(0) NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip` VARCHAR(45) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_refresh_token_hash`(`token_hash`),
    INDEX `idx_refresh_user_revoked`(`user_id`, `revoked_at`),
    INDEX `idx_refresh_family`(`family_id`),
    INDEX `idx_refresh_expires`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `entity` VARCHAR(64) NOT NULL,
    `entity_id` BIGINT NULL,
    `action` VARCHAR(64) NOT NULL,
    `changes_json` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_audit_user_created`(`user_id`, `created_at`),
    INDEX `idx_audit_entity`(`entity`, `entity_id`),
    INDEX `idx_audit_action_created`(`action`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `uq_users_email` ON `users`(`email`);

-- CreateIndex
CREATE INDEX `idx_users_status` ON `users`(`status`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `fk_users_approved_by` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `fk_refresh_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

