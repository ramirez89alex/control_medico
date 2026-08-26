# PowerDent

Reconstrucción de PowerDent como aplicación cliente/servidor real (antes: un único
`PowerDent_Clinica.html` con todo en `localStorage`). Ver el plan completo de la
reconstrucción en la conversación que lo generó; resumen del estado actual abajo.

## Estructura

```
apps/
  api/    Express + TypeScript + Prisma (Postgres)
  web/    React + Vite + TypeScript
packages/
  shared/ Tipos y lógica de negocio pura compartidos entre api y web
```

## Requisitos

- Node.js 20+
- Docker (Postgres + MinIO para desarrollo local)

## Puesta en marcha

```bash
npm install

# Postgres + MinIO (S3-compatible) locales
docker compose up -d

# copia y ajusta las variables de entorno si hace falta
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# esquema de base de datos
npm run prisma:migrate

# crea la clínica inicial + usuario admin (contraseña obligatoria por variable de entorno)
# PowerShell:
$env:SEED_ADMIN_PASSWORD = "cambia-esto"; npm run -w apps/api seed
# bash:
SEED_ADMIN_PASSWORD="cambia-esto" npm run -w apps/api seed

# arranca api y web (dos terminales)
npm run dev:api
npm run dev:web
```

La web queda en http://localhost:5173, la API en http://localhost:4000.

## Migrar datos de la versión anterior

Desde `PowerDent_Clinica.html`, botón "Exportar" → genera un `powerdent_*.json`.

```bash
npm run migrar-json -w apps/api -- ./powerdent_2026-08-20.json
```

Crea una clínica nueva a partir de ese JSON (o usa una existente si se pasa su id
como segundo argumento), sube firmas/archivos/audios al bucket S3-compatible y
hashea los códigos de acceso de los pacientes. Cobros, stock, banco, pedidos,
facturas, campañas y contactos no se migran todavía — esas tablas se añaden cuando
se construya esa pantalla.

## Estado

Fase 1 de la reconstrucción: backend, esquema de datos multi-clínica, autenticación
real (JWT + roles), almacenamiento de archivos en bucket S3-compatible, y una
vertical completa migrada de extremo a extremo (Pacientes + Agenda). El resto de
pantallas de la app original (presupuestos, cobros/facturación, stock/compras,
banco/OCR, marketing, asistente de voz) quedan pendientes de migrar en fases
siguientes sobre esta misma base.
