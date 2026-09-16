-- CreateEnum
CREATE TYPE "Periodicidad" AS ENUM ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "dia_de_pago" SMALLINT,
ADD COLUMN     "periodicidad" "Periodicidad",
ADD COLUMN     "recurrente" BOOLEAN NOT NULL DEFAULT false;

