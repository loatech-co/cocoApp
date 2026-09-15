-- AlterTable
ALTER TABLE `import_batches` MODIFY `source` ENUM('image', 'pdf', 'csv', 'manual') NOT NULL DEFAULT 'image';
