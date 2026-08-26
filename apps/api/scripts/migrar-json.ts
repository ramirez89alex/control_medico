/**
 * Migra un export de la app antigua (`exportar()` en PowerDent_Clinica.html, un único
 * JSON con toda la clínica) a la base de datos Postgres nueva.
 *
 * Uso:
 *   npm run migrar-json -w apps/api -- ./powerdent_2026-08-20.json [clinicaIdExistente]
 *
 * Si no se pasa clinicaIdExistente, se crea una Clinica nueva a partir de json.clinica.
 * Cobros, stock, banco, pedidos, facturas, campañas y contactos NO se migran en esta
 * fase (esas tablas todavía no existen — se añaden cuando se construya esa pantalla).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';
import { nuevaObjectKey, subirBuffer } from '../src/lib/s3.js';

const prisma = new PrismaClient();

interface DataUrl {
  mime: string;
  buffer: Buffer;
}

function parseDataUrl(dataUrl: string): DataUrl | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}

function fechaValida(v: unknown): Date | undefined {
  if (!v || typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function subirArchivoDesdeDataUrl(params: {
  clinicaId: string;
  pacienteId?: string;
  nombre: string;
  dataUrl: string;
}): Promise<string | null> {
  const parsed = parseDataUrl(params.dataUrl);
  if (!parsed) return null;
  const objectKey = nuevaObjectKey(params.clinicaId, params.nombre, params.pacienteId);
  await subirBuffer(objectKey, parsed.buffer, parsed.mime);
  const archivo = await prisma.archivo.create({
    data: {
      clinicaId: params.clinicaId,
      pacienteId: params.pacienteId,
      nombre: params.nombre,
      mime: parsed.mime,
      tamanoBytes: parsed.buffer.byteLength,
      objectKey,
    },
  });
  return archivo.id;
}

async function main() {
  const [, , rutaJson, clinicaIdArg] = process.argv;
  if (!rutaJson) {
    console.error('Uso: migrar-json.ts <ruta-al-json-exportado> [clinicaIdExistente]');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(rutaJson, 'utf-8'));

  // ── 1. Clínica ──────────────────────────────────────────────────────────
  let clinicaId = clinicaIdArg;
  if (!clinicaId) {
    const c = raw.clinica || {};
    const clinica = await prisma.clinica.create({
      data: {
        nombre: c.nombre || 'Clínica migrada',
        nif: c.nif || null,
        direccion: c.dir || null,
        cp: c.cp || null,
        ciudad: c.ciudad || null,
        telefono: c.tel || null,
        email: c.email || null,
        colegiado: c.colegiado || null,
        iva: Number(c.iva) || 0,
        prefijo: c.prefijo || '34',
        idioma: c.idioma || 'es',
        horario: c.horario || {},
        finCuotas: Number(c.finCuotas) || 12,
        finTIN: Number(c.finTIN) || 15,
      },
    });
    clinicaId = clinica.id;
    console.log(`Clínica creada: ${clinica.nombre} (${clinicaId})`);
  } else {
    await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaId } });
    console.log(`Usando clínica existente ${clinicaId}`);
  }

  // Autor de las entradas de historia clínica migradas: el primer admin de la clínica.
  const autor = await prisma.usuario.findFirst({ where: { clinicaId, rol: 'admin' } });
  if (!autor) {
    throw new Error('La clínica no tiene ningún usuario admin todavía — ejecuta el seed antes de migrar.');
  }

  // ── 2. Gabinetes y dentistas (mapa id-antiguo -> id-nuevo) ────────────────
  const gabineteIdMap = new Map<string, string>();
  for (const g of raw.gabinetes || []) {
    const creado = await prisma.gabinete.create({ data: { clinicaId, nombre: g.n, uso: g.uso || null } });
    gabineteIdMap.set(g.id, creado.id);
  }

  const dentistaIdMap = new Map<string, string>();
  for (const d of raw.dentistas || []) {
    const creado = await prisma.dentista.create({
      data: {
        clinicaId,
        nombre: d.n,
        rol: d.rol || 'Odontólogo',
        especialidad: d.esp || null,
        color: d.color || '#3B4076',
        activo: d.activo !== false,
      },
    });
    dentistaIdMap.set(d.id, creado.id);
  }

  // ── 3. Pacientes (+ archivos + firma de consentimiento) ───────────────────
  const pacienteIdMap = new Map<string, string>();
  for (const p of raw.pacientes || []) {
    const codigoHash = p.codigo ? await hashPassword(String(p.codigo)) : null;
    const creado = await prisma.paciente.create({
      data: {
        clinicaId,
        nombre: p.nombre || '(sin nombre)',
        apellidos: p.apellidos || '',
        nacimiento: fechaValida(p.nacimiento),
        dni: p.dni || null,
        telefono: p.tel || null,
        email: p.email || null,
        direccion: p.dir || null,
        alergias: p.alergias || null,
        medicacion: p.medicacion || null,
        antecedentes: p.antecedentes || null,
        aviso: p.aviso || null,
        origen: p.origen || null,
        accesoCodigoHash: codigoHash,
        consentDatosAceptado: !!p.consent?.datos,
        consentTratamientoAceptado: !!p.consent?.tratamiento,
        consentImagenesAceptado: !!p.consent?.imagenes,
        consentComercialAceptado: !!p.consent?.comercial,
        consentFecha: fechaValida(p.consent?.fecha),
      },
    });
    pacienteIdMap.set(p.id, creado.id);

    if (p.consent?.firma) {
      const archivoId = await subirArchivoDesdeDataUrl({
        clinicaId,
        pacienteId: creado.id,
        nombre: `firma-consentimiento-${creado.id}.png`,
        dataUrl: p.consent.firma,
      });
      if (archivoId) await prisma.paciente.update({ where: { id: creado.id }, data: { consentFirmaArchivoId: archivoId } });
    }

    for (const a of p.archivos || []) {
      if (!a.data) continue;
      await subirArchivoDesdeDataUrl({ clinicaId, pacienteId: creado.id, nombre: a.n || 'archivo', dataUrl: a.data });
    }
  }
  console.log(`Pacientes migrados: ${pacienteIdMap.size}`);

  // ── 4. Citas ────────────────────────────────────────────────────────────
  let nCitas = 0;
  for (const c of raw.citas || []) {
    await prisma.cita.create({
      data: {
        clinicaId,
        pacienteId: c.paciente ? pacienteIdMap.get(c.paciente) : undefined,
        nombreLibre: c.nombreLibre || null,
        fecha: c.fecha,
        hora: c.hora,
        duracionMin: Number(c.dur) || 30,
        gabineteId: c.gabinete ? gabineteIdMap.get(c.gabinete) : undefined,
        dentistaId: c.dentista ? dentistaIdMap.get(c.dentista) : undefined,
        motivo: c.motivo || null,
        estado: ['programada', 'llegado', 'hecha', 'cancelada'].includes(c.estado) ? c.estado : 'programada',
        confirmada: !!c.confirmada,
      },
    });
    nCitas++;
  }
  console.log(`Citas migradas: ${nCitas}`);

  // ── 5. Presupuestos + líneas ────────────────────────────────────────────
  let nPresu = 0;
  for (const pr of raw.presupuestos || []) {
    const pacienteId = pr.paciente ? pacienteIdMap.get(pr.paciente) : undefined;
    if (!pacienteId) continue; // presupuesto huérfano en el export original, se omite
    await prisma.presupuesto.create({
      data: {
        clinicaId,
        pacienteId,
        fecha: fechaValida(pr.fecha) || new Date(),
        validezDias: Number(pr.validez) || 30,
        descuentoPct: Number(pr.dto) || 0,
        estado: ['borrador', 'enviado', 'aceptado', 'rechazado'].includes(pr.estado) ? pr.estado : 'borrador',
        notas: pr.notas || null,
        lineas: {
          create: (pr.lineas || []).map((l: Record<string, unknown>) => ({
            codigo: String(l.cod || ''),
            nombre: String(l.n || ''),
            pieza: l.pieza ? String(l.pieza) : null,
            cantidad: Number(l.cant) || 1,
            pvp: Number(l.pvp) || 0,
            coste: Number(l.coste) || 0,
          })),
        },
      },
    });
    nPresu++;
  }
  console.log(`Presupuestos migrados: ${nPresu}`);

  // ── 6. Historia clínica (sesiones) ─────────────────────────────────────
  let nHistoria = 0;
  for (const s of raw.sesiones || []) {
    const pacienteId = s.paciente ? pacienteIdMap.get(s.paciente) : undefined;
    if (!pacienteId) continue;

    let audioArchivoId: string | null = null;
    if (s.audio) {
      audioArchivoId = await subirArchivoDesdeDataUrl({
        clinicaId,
        pacienteId,
        nombre: `audio-sesion-${s.id || Date.now()}.webm`,
        dataUrl: s.audio,
      });
    }

    await prisma.historiaClinica.create({
      data: {
        clinicaId,
        pacienteId,
        fecha: fechaValida(s.fecha) || new Date(),
        acto: s.acto || '(sin descripción)',
        piezas: s.piezas || null,
        nota: s.nota || '',
        audioArchivoId,
        autorId: autor.id,
      },
    });
    nHistoria++;
  }
  console.log(`Entradas de historia clínica migradas: ${nHistoria}`);

  console.log('\nMigración completada. No migrados en esta fase (tablas aún no creadas): cobros, stock, banco, pedidos, facturas, campañas, contactos.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
