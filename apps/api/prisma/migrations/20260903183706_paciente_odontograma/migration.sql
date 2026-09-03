-- AlterTable
ALTER TABLE "pacientes" ADD COLUMN     "notas_odontograma" TEXT,
ADD COLUMN     "odontograma" JSONB NOT NULL DEFAULT '{}';
