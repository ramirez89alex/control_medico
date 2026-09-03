-- CreateTable
CREATE TABLE "materiales" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'ud',
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_consumos" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "historia_clinica_id" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "coste" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_consumos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "materiales_clinica_id_idx" ON "materiales"("clinica_id");

-- CreateIndex
CREATE INDEX "material_consumos_clinica_id_paciente_id_idx" ON "material_consumos"("clinica_id", "paciente_id");

-- CreateIndex
CREATE INDEX "material_consumos_clinica_id_material_id_idx" ON "material_consumos"("clinica_id", "material_id");

-- AddForeignKey
ALTER TABLE "materiales" ADD CONSTRAINT "materiales_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_consumos" ADD CONSTRAINT "material_consumos_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_consumos" ADD CONSTRAINT "material_consumos_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_consumos" ADD CONSTRAINT "material_consumos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_consumos" ADD CONSTRAINT "material_consumos_historia_clinica_id_fkey" FOREIGN KEY ("historia_clinica_id") REFERENCES "historia_clinica"("id") ON DELETE SET NULL ON UPDATE CASCADE;
