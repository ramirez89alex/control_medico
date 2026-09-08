-- CreateEnum
CREATE TYPE "OrigenEnlacePago" AS ENUM ('personal', 'paciente');

-- AlterTable
ALTER TABLE "enlaces_pago" ADD COLUMN     "origen" "OrigenEnlacePago" NOT NULL DEFAULT 'personal',
ALTER COLUMN "creado_por_usuario_id" DROP NOT NULL;
