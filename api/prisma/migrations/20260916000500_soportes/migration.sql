-- CreateTable
CREATE TABLE "soportes" (
    "id" BIGSERIAL NOT NULL,
    "uuid" CHAR(36) NOT NULL,
    "user_id" BIGINT NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 1,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "huella" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soportes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_soportes_uuid" ON "soportes"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "uq_soportes_storage_key" ON "soportes"("storage_key");

-- CreateIndex
CREATE INDEX "idx_soportes_tx_orden" ON "soportes"("transaction_id", "orden");

-- CreateIndex
CREATE INDEX "idx_soportes_user" ON "soportes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_soportes_tx_huella" ON "soportes"("transaction_id", "huella");

-- AddForeignKey
ALTER TABLE "soportes" ADD CONSTRAINT "fk_soportes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soportes" ADD CONSTRAINT "fk_soportes_transaction" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
