-- Backfill-safe: se añade con un valor aleatorio por defecto para las filas ya existentes
-- (la app siempre manda su propio codigo_corto al crear una fila nueva, este default solo
-- cubre el backfill de esta migración).
ALTER TABLE "enlaces_pago" ADD COLUMN "codigo_corto" TEXT NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 8);

ALTER TABLE "enlaces_pago" ALTER COLUMN "codigo_corto" DROP DEFAULT;

CREATE UNIQUE INDEX "enlaces_pago_codigo_corto_key" ON "enlaces_pago"("codigo_corto");
