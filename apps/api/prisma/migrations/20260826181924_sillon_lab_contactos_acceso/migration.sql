-- CreateEnum
CREATE TYPE "EstadoLaboratorio" AS ENUM ('enviado', 'recibido', 'entregado');

-- CreateEnum
CREATE TYPE "TipoContacto" AS ENUM ('proveedor', 'laboratorio', 'interno', 'otro');

-- AlterEnum
ALTER TYPE "EstadoCita" ADD VALUE 'silla';

-- CreateTable
CREATE TABLE "laboratorio" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "nombre_lab" TEXT,
    "tipo" TEXT NOT NULL,
    "trabajo" TEXT,
    "piezas" TEXT,
    "material" TEXT,
    "fecha_envio" TIMESTAMP(3) NOT NULL,
    "dias_entrega" INTEGER NOT NULL DEFAULT 7,
    "fecha_prevista" TIMESTAMP(3) NOT NULL,
    "coste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fecha_cita" TIMESTAMP(3),
    "estado" "EstadoLaboratorio" NOT NULL DEFAULT 'enviado',
    "fases" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "laboratorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoContacto" NOT NULL DEFAULT 'otro',
    "referencia" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accesos_paciente" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "usado_en" TIMESTAMP(3),
    "creado_por_usuario_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accesos_paciente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "laboratorio_clinica_id_estado_idx" ON "laboratorio"("clinica_id", "estado");

-- CreateIndex
CREATE INDEX "contactos_clinica_id_idx" ON "contactos"("clinica_id");

-- CreateIndex
CREATE UNIQUE INDEX "accesos_paciente_token_hash_key" ON "accesos_paciente"("token_hash");

-- CreateIndex
CREATE INDEX "accesos_paciente_paciente_id_idx" ON "accesos_paciente"("paciente_id");

-- AddForeignKey
ALTER TABLE "laboratorio" ADD CONSTRAINT "laboratorio_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratorio" ADD CONSTRAINT "laboratorio_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_paciente" ADD CONSTRAINT "accesos_paciente_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_paciente" ADD CONSTRAINT "accesos_paciente_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
