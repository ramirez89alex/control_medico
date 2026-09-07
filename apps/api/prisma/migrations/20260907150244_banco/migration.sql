-- AlterTable
ALTER TABLE "cobros" ADD COLUMN     "conciliado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "movimientos_banco" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "conciliado_tipo" TEXT,
    "conciliado_id" TEXT,
    "conciliado_nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "movimientos_banco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_banco_clinica_id_fecha_idx" ON "movimientos_banco"("clinica_id", "fecha");

-- AddForeignKey
ALTER TABLE "movimientos_banco" ADD CONSTRAINT "movimientos_banco_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
