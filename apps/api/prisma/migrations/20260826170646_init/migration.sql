-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('admin', 'dentista', 'recepcion', 'paciente');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('programada', 'llegado', 'hecha', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoPresupuesto" AS ENUM ('borrador', 'enviado', 'aceptado', 'rechazado');

-- CreateTable
CREATE TABLE "clinicas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nif" TEXT,
    "direccion" TEXT,
    "cp" TEXT,
    "ciudad" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "colegiado" TEXT,
    "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prefijo" TEXT NOT NULL DEFAULT '34',
    "idioma" TEXT NOT NULL DEFAULT 'es',
    "horario" JSONB NOT NULL,
    "finCuotas" INTEGER NOT NULL DEFAULT 12,
    "finTIN" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "nombre" TEXT NOT NULL,
    "paciente_id" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones_auditoria" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "detalle" JSONB,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "nacimiento" TIMESTAMP(3),
    "dni" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "alergias" TEXT,
    "medicacion" TEXT,
    "antecedentes" TEXT,
    "aviso" TEXT,
    "origen" TEXT,
    "doctor_id" TEXT,
    "consentDatosAceptado" BOOLEAN NOT NULL DEFAULT false,
    "consentTratamientoAceptado" BOOLEAN NOT NULL DEFAULT false,
    "consentImagenesAceptado" BOOLEAN NOT NULL DEFAULT false,
    "consentComercialAceptado" BOOLEAN NOT NULL DEFAULT false,
    "consent_firma_archivo_id" TEXT,
    "consentFecha" TIMESTAMP(3),
    "acceso_codigo_hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentistas" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'Odontólogo',
    "especialidad" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3B4076',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentistas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gabinetes" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "uso" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gabinetes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citas" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "nombre_libre" TEXT,
    "fecha" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "duracion_min" INTEGER NOT NULL DEFAULT 30,
    "gabinete_id" TEXT,
    "dentista_id" TEXT,
    "motivo" TEXT,
    "estado" "EstadoCita" NOT NULL DEFAULT 'programada',
    "confirmada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "citas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historia_clinica" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acto" TEXT NOT NULL,
    "piezas" TEXT,
    "nota" TEXT NOT NULL,
    "audio_archivo_id" TEXT,
    "autor_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "historia_clinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validez_dias" INTEGER NOT NULL DEFAULT 30,
    "descuento_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" "EstadoPresupuesto" NOT NULL DEFAULT 'borrador',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineas_presupuesto" (
    "id" TEXT NOT NULL,
    "presupuesto_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "pieza" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "pvp" DOUBLE PRECISION NOT NULL,
    "coste" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "lineas_presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "archivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_paciente_id_key" ON "usuarios"("paciente_id");

-- CreateIndex
CREATE INDEX "usuarios_clinica_id_idx" ON "usuarios"("clinica_id");

-- CreateIndex
CREATE INDEX "sesiones_auditoria_clinica_id_fecha_idx" ON "sesiones_auditoria"("clinica_id", "fecha");

-- CreateIndex
CREATE INDEX "sesiones_auditoria_entidad_entidad_id_idx" ON "sesiones_auditoria"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "pacientes_clinica_id_idx" ON "pacientes"("clinica_id");

-- CreateIndex
CREATE INDEX "pacientes_clinica_id_deleted_at_idx" ON "pacientes"("clinica_id", "deleted_at");

-- CreateIndex
CREATE INDEX "dentistas_clinica_id_idx" ON "dentistas"("clinica_id");

-- CreateIndex
CREATE INDEX "gabinetes_clinica_id_idx" ON "gabinetes"("clinica_id");

-- CreateIndex
CREATE INDEX "citas_clinica_id_fecha_idx" ON "citas"("clinica_id", "fecha");

-- CreateIndex
CREATE INDEX "citas_clinica_id_deleted_at_idx" ON "citas"("clinica_id", "deleted_at");

-- CreateIndex
CREATE INDEX "historia_clinica_clinica_id_paciente_id_idx" ON "historia_clinica"("clinica_id", "paciente_id");

-- CreateIndex
CREATE INDEX "presupuestos_clinica_id_paciente_id_idx" ON "presupuestos"("clinica_id", "paciente_id");

-- CreateIndex
CREATE INDEX "lineas_presupuesto_presupuesto_id_idx" ON "lineas_presupuesto"("presupuesto_id");

-- CreateIndex
CREATE INDEX "archivos_clinica_id_idx" ON "archivos"("clinica_id");

-- CreateIndex
CREATE INDEX "archivos_paciente_id_idx" ON "archivos"("paciente_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_auditoria" ADD CONSTRAINT "sesiones_auditoria_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_auditoria" ADD CONSTRAINT "sesiones_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentistas" ADD CONSTRAINT "dentistas_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gabinetes" ADD CONSTRAINT "gabinetes_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_gabinete_id_fkey" FOREIGN KEY ("gabinete_id") REFERENCES "gabinetes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas" ADD CONSTRAINT "citas_dentista_id_fkey" FOREIGN KEY ("dentista_id") REFERENCES "dentistas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historia_clinica" ADD CONSTRAINT "historia_clinica_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historia_clinica" ADD CONSTRAINT "historia_clinica_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_presupuesto" ADD CONSTRAINT "lineas_presupuesto_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
