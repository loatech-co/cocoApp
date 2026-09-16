-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "palabras_clave" TEXT[] DEFAULT ARRAY[]::TEXT[];
