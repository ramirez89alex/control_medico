-- Evita duplicados de nombre por clínica (ya limpiados los que se colaron por un
-- `createMany({skipDuplicates:true})` sin restricción única detrás que lo respaldara).
DROP INDEX IF EXISTS "dentistas_clinica_id_idx";
DROP INDEX IF EXISTS "gabinetes_clinica_id_idx";
DROP INDEX IF EXISTS "tarifario_clinica_id_idx";

CREATE UNIQUE INDEX "dentistas_clinica_id_nombre_key" ON "dentistas"("clinica_id", "nombre");
CREATE UNIQUE INDEX "gabinetes_clinica_id_nombre_key" ON "gabinetes"("clinica_id", "nombre");
CREATE UNIQUE INDEX "tarifario_clinica_id_codigo_key" ON "tarifario"("clinica_id", "codigo");
