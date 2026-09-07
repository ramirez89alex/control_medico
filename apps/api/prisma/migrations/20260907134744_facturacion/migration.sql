-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN     "serie" TEXT NOT NULL DEFAULT 'F';

-- CreateTable
CREATE TABLE "facturas" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "cobro_id" TEXT,
    "numero" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lineas" JSONB NOT NULL,
    "base" DOUBLE PRECISION NOT NULL,
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exenta" BOOLEAN NOT NULL DEFAULT true,
    "total" DOUBLE PRECISION NOT NULL,
    "conciliada" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facturas_cobro_id_key" ON "facturas"("cobro_id");

-- CreateIndex
CREATE INDEX "facturas_clinica_id_fecha_idx" ON "facturas"("clinica_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_clinica_id_numero_key" ON "facturas"("clinica_id", "numero");

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_cobro_id_fkey" FOREIGN KEY ("cobro_id") REFERENCES "cobros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
