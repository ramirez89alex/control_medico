-- CreateEnum
CREATE TYPE "FormaCobro" AS ENUM ('tarjeta', 'efectivo', 'bizum', 'transferencia', 'enlace_pago', 'financiacion', 'seguro');

-- CreateEnum
CREATE TYPE "TipoCobro" AS ENUM ('pago', 'anticipo');

-- CreateTable
CREATE TABLE "tarifario" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "familia" TEXT,
    "pvp" DOUBLE PRECISION NOT NULL,
    "coste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minutos" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarifario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobros" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "presupuesto_id" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importe" DOUBLE PRECISION NOT NULL,
    "forma" "FormaCobro" NOT NULL,
    "tipo" "TipoCobro" NOT NULL DEFAULT 'pago',
    "concepto" TEXT,
    "numero" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cobros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarifario_clinica_id_idx" ON "tarifario"("clinica_id");

-- CreateIndex
CREATE INDEX "cobros_clinica_id_paciente_id_idx" ON "cobros"("clinica_id", "paciente_id");

-- CreateIndex
CREATE INDEX "cobros_clinica_id_fecha_idx" ON "cobros"("clinica_id", "fecha");

-- AddForeignKey
ALTER TABLE "tarifario" ADD CONSTRAINT "tarifario_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobros" ADD CONSTRAINT "cobros_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
