-- CreateEnum
CREATE TYPE "EstadoCampana" AS ENUM ('preparada', 'en_curso', 'terminada');

-- CreateEnum
CREATE TYPE "EstadoIdea" AS ENUM ('nueva', 'en_estudio', 'en_marcha', 'descartada', 'hecha');

-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN     "meses_revision" INTEGER NOT NULL DEFAULT 6;

-- CreateTable
CREATE TABLE "campanas" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'Email',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publico" TEXT NOT NULL DEFAULT 'general',
    "asunto" TEXT,
    "cuerpo" TEXT,
    "estado" "EstadoCampana" NOT NULL DEFAULT 'preparada',
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "respuestas" INTEGER NOT NULL DEFAULT 0,
    "citas" INTEGER NOT NULL DEFAULT 0,
    "coste" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campanas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" TEXT NOT NULL,
    "clinica_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autor" TEXT,
    "estado" "EstadoIdea" NOT NULL DEFAULT 'nueva',
    "votos" INTEGER NOT NULL DEFAULT 0,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanas_clinica_id_fecha_idx" ON "campanas"("clinica_id", "fecha");

-- CreateIndex
CREATE INDEX "ideas_clinica_id_idx" ON "ideas"("clinica_id");

-- AddForeignKey
ALTER TABLE "campanas" ADD CONSTRAINT "campanas_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_clinica_id_fkey" FOREIGN KEY ("clinica_id") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
