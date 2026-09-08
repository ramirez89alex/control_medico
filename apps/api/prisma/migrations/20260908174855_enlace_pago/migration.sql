-- CreateEnum
CREATE TYPE "EstadoEnlacePago" AS ENUM ('pendiente', 'pagado', 'expirado', 'cancelado');

-- CreateTable
CREATE TABLE "enlaces_pago" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "presupuesto_id" TEXT,
    "importe" DOUBLE PRECISION NOT NULL,
    "concepto" TEXT,
    "stripe_session_id" TEXT NOT NULL,
    "stripe_url" TEXT NOT NULL,
    "estado" "EstadoEnlacePago" NOT NULL DEFAULT 'pendiente',
    "cobro_id" TEXT,
    "creado_por_usuario_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagado_en" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "enlaces_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enlaces_pago_stripe_session_id_key" ON "enlaces_pago"("stripe_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "enlaces_pago_cobro_id_key" ON "enlaces_pago"("cobro_id");

-- CreateIndex
CREATE INDEX "enlaces_pago_clinica_id_estado_idx" ON "enlaces_pago"("clinica_id", "estado");

-- CreateIndex
CREATE INDEX "enlaces_pago_clinica_id_paciente_id_idx" ON "enlaces_pago"("clinica_id", "paciente_id");

-- AddForeignKey
ALTER TABLE "enlaces_pago" ADD CONSTRAINT "enlaces_pago_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlaces_pago" ADD CONSTRAINT "enlaces_pago_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlaces_pago" ADD CONSTRAINT "enlaces_pago_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlaces_pago" ADD CONSTRAINT "enlaces_pago_cobro_id_fkey" FOREIGN KEY ("cobro_id") REFERENCES "cobros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
