-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "recordatorios_enviados" TEXT[] DEFAULT ARRAY[]::TEXT[];
