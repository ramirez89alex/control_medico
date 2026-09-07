-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN     "factura_columnas" TEXT[] DEFAULT ARRAY['concepto', 'cantidad', 'precio', 'importe']::TEXT[],
ADD COLUMN     "factura_pie" TEXT,
ADD COLUMN     "logo_archivo_id" TEXT;
