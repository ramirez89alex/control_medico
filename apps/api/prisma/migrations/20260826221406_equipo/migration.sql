-- AlterTable
ALTER TABLE "dentistas" ADD COLUMN     "calendario" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "colegiado" TEXT,
ADD COLUMN     "contrato" TEXT,
ADD COLUMN     "dias" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "dni" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fecha_alta" TIMESTAMP(3),
ADD COLUMN     "gabinete_id" TEXT,
ADD COLUMN     "horas_semana" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "telefono" TEXT;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "dentistas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentistas" ADD CONSTRAINT "dentistas_gabinete_id_fkey" FOREIGN KEY ("gabinete_id") REFERENCES "gabinetes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
