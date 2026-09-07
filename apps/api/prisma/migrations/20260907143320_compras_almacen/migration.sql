-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('borrador', 'enviado', 'recibido');

-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "dias_entrega" INTEGER NOT NULL DEFAULT 3,
    "pedido_minimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamento" TEXT NOT NULL DEFAULT 'Sin departamento',
    "proveedor_id" TEXT,
    "dia_entrega" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contado" DOUBLE PRECISION,
    "minimo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "objetivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unidad" TEXT NOT NULL DEFAULT 'ud',
    "coste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "historial" JSONB NOT NULL DEFAULT '[]',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previsto" TIMESTAMP(3),
    "estado" "EstadoPedido" NOT NULL DEFAULT 'borrador',
    "nota" TEXT,
    "lineas" JSONB NOT NULL,
    "recibido_fecha" TIMESTAMP(3),
    "albaran_numero" TEXT,
    "albaran_fecha" TIMESTAMP(3),
    "factura_numero" TEXT,
    "factura_fecha" TIMESTAMP(3),
    "factura_importe" DOUBLE PRECISION,
    "factura_vence" TIMESTAMP(3),
    "factura_pagada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_clinica_id_nombre_key" ON "proveedores"("clinica_id", "nombre");

-- CreateIndex
CREATE INDEX "stock_clinica_id_idx" ON "stock"("clinica_id");

-- CreateIndex
CREATE INDEX "stock_clinica_id_departamento_idx" ON "stock"("clinica_id", "departamento");

-- CreateIndex
CREATE INDEX "pedidos_clinica_id_estado_idx" ON "pedidos"("clinica_id", "estado");

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
