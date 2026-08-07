-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `transfer_direction` ENUM('out', 'in') NULL;
