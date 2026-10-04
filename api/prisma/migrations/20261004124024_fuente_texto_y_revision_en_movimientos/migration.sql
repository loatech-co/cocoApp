-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('web', 'ios_manual', 'ios_photo', 'wallet', 'sms');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "captured_at" TIMESTAMPTZ(3),
ADD COLUMN     "por_revisar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "raw_text" TEXT,
ADD COLUMN     "source" "TransactionSource" NOT NULL DEFAULT 'web';

