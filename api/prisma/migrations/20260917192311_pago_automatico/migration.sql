-- DropIndex
DROP INDEX "idx_tx_user_external_ref";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "pago_automatico" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "uq_tx_user_external_ref" ON "transactions"("user_id", "external_ref");

