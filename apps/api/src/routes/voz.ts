import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { huecosLibres, hoyISO, sumarDiasISO, type CitaSlot, type HorarioSemana } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol } from '../middleware/auth.js';
import { env } from '../env.js';

export const vozRouter = Router();
vozRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

const ordenSchema = z.object({ texto: z.string().min(2) });

const interpretacionSchema = z.object({
  accion: z.enum(['agendar', 'mover_cita', 'disponibilidad', 'confirmar_pendientes', 'pedir_confirmacion', 'otro']).default('agendar'),
  paciente: z.string().nullable().optional(),
  dentista: z.string().nullable().optional(),
  gabinete: z.string().nullable().optional(),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  hora: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  motivo: z.string().nullable().optional(),
});

type Entidad = { id: string; nombre: string };

function aSlots(citas: { id: string; fecha: string; hora: string; duracionMin: number; gabineteId: string | null; dentistaId: string | null; estado: string }[]): CitaSlot[] {
  return citas.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    hora: c.hora,
    dur: c.duracionMin,
    gabineteId: c.gabineteId || '',
    dentistaId: c.dentistaId,
    estado: c.estado as CitaSlot['estado'],
  }));
}

/** Busca, día a día desde `desde`, el primer día con huecos libres (respetando filtros de gabinete/dentista). */
async function buscarProximoHueco(
  clinicaId: string,
  horario: HorarioSemana,
  gabineteIds: string[],
  dentistaId: string | undefined,
  desde: string,
  excluirCitaId?: string,
  maxDias = 30,
): Promise<{ fecha: string; hora: string; libres: string[] } | null> {
  const hasta = sumarDiasISO(desde, maxDias);
  const citas = await prisma.cita.findMany({ where: { clinicaId, fecha: { gte: desde, lte: hasta }, deletedAt: null, id: excluirCitaId ? { not: excluirCitaId } : undefined } });
  for (let i = 0; i <= maxDias; i++) {
    const fecha = sumarDiasISO(desde, i);
    const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
    const citasDelDia = aSlots(citas.filter((c) => c.fecha === fecha));
    const libres = huecosLibres(fecha, diaSemana, horario, citasDelDia, gabineteIds, dentistaId);
    if (libres.length) return { fecha, hora: libres[0], libres };
  }
  return null;
}

async function resolverPaciente(clinicaId: string, nombre: string | null | undefined) {
  if (!nombre) return [];
  const partes = nombre.trim().split(/\s+/);
  return prisma.paciente.findMany({
    where: {
      clinicaId,
      deletedAt: null,
      OR: partes.map((parte) => ({
        OR: [{ nombre: { contains: parte, mode: 'insensitive' as const } }, { apellidos: { contains: parte, mode: 'insensitive' as const } }],
      })),
    },
    select: { id: true, nombre: true, apellidos: true },
    take: 5,
  });
}

async function resolverDentista(clinicaId: string, nombre: string | null | undefined, avisos: string[]): Promise<{ resuelto: Entidad | null; id?: string }> {
  if (!nombre) return { resuelto: null };
  const matches = await prisma.dentista.findMany({
    where: { clinicaId, nombre: { contains: nombre.trim(), mode: 'insensitive' } },
    select: { id: true, nombre: true },
    take: 5,
  });
  if (matches.length === 1) return { resuelto: matches[0], id: matches[0].id };
  if (matches.length === 0) avisos.push(`No encontré a "${nombre}" entre los profesionales.`);
  else avisos.push(`Hay varios profesionales que coinciden con "${nombre}", no he filtrado por ninguno.`);
  return { resuelto: null };
}

async function resolverGabinete(clinicaId: string, nombre: string | null | undefined, avisos: string[]): Promise<{ resuelto: Entidad | null; id?: string }> {
  if (!nombre) return { resuelto: null };
  const matches = await prisma.gabinete.findMany({
    where: { clinicaId, nombre: { contains: nombre.trim(), mode: 'insensitive' } },
    select: { id: true, nombre: true },
    take: 5,
  });
  if (matches.length === 1) return { resuelto: matches[0], id: matches[0].id };
  if (matches.length === 0) avisos.push(`No encontré el gabinete "${nombre}".`);
  else avisos.push(`Hay varios gabinetes que coinciden con "${nombre}", no he filtrado por ninguno.`);
  return { resuelto: null };
}

vozRouter.post('/interpretar-cita', async (req, res) => {
  const parsed = ordenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (!env.anthropicApiKey) {
    return res.status(503).json({ error: 'El asistente de voz no está configurado. Añade ANTHROPIC_API_KEY en el servidor.' });
  }

  const hoy = hoyISO();
  const sistema = `Eres el intérprete de órdenes de voz de la agenda de una clínica dental. Te dan una frase en español dicha por el personal. Hoy es ${hoy} (formato AAAA-MM-DD).
Clasifica la orden y devuelve SOLO un JSON, sin texto ni markdown alrededor, con esta forma exacta:
{"accion": "agendar" | "mover_cita" | "disponibilidad" | "confirmar_pendientes" | "pedir_confirmacion" | "otro", "paciente": "nombre del paciente o null", "dentista": "nombre del profesional mencionado o null", "gabinete": "nombre o número de gabinete mencionado o null", "fecha": "AAAA-MM-DD o null", "hora": "HH:MM en 24h o null", "motivo": "breve motivo o tratamiento o null"}
- "agendar": quieren reservar una cita NUEVA para un paciente. NO hace falta que digan fecha ni hora — si faltan, se busca automáticamente el primer hueco libre.
- "mover_cita": quieren cambiar la fecha, la hora, el profesional o el gabinete de una cita YA EXISTENTE de un paciente (verbos como "cambia", "mueve", "reprograma", "aplaza", "cambia la hora de la cita de..."). En este caso "fecha" y "hora" son los valores NUEVOS a los que se quiere cambiar la cita (o null si no los dicen).
- "pedir_confirmacion": piden pedir o enviar la confirmación de la cita de un paciente CONCRETO (dicen su nombre). Ej: "confirma la cita de Alexander", "pide confirmación a María", "confirma las citas de Alexander".
- "disponibilidad": preguntan qué huecos, horas u espacios libres hay en la agenda, sin pedir reservar nada todavía. Si no dicen qué día, usa hoy (${hoy}).
- "confirmar_pendientes": preguntan en general qué citas están pendientes de confirmar, SIN nombrar a un paciente concreto.
- "otro": cualquier otra cosa.
Si mencionan un profesional o doctor concreto, ponlo en "dentista". Si mencionan un gabinete o sala concreta, ponlo en "gabinete". Interpreta expresiones de fecha relativas (hoy, mañana, pasado mañana, el lunes que viene, en 15 días, el 12 de septiembre) usando la fecha de hoy. Interpreta horas dichas de forma natural (las diez y media -> 10:30, las cuatro de la tarde -> 16:00). No inventes datos que no estén en la frase: si algo no se menciona, usa null.`;

  let interpretacion: z.infer<typeof interpretacionSchema>;
  try {
    const client = new Anthropic({ apiKey: env.anthropicApiKey });
    const respuesta = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      system: sistema,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: parsed.data.texto }],
    });
    const bloque = respuesta.content.find((b) => b.type === 'text');
    const texto = (bloque && 'text' in bloque ? bloque.text : '').replace(/```json|```/g, '').trim();
    interpretacion = interpretacionSchema.parse(JSON.parse(texto));
  } catch (e) {
    console.error('Error interpretando orden de voz', e);
    return res.status(502).json({ error: 'No he podido interpretar la orden. Prueba a decirla de otra forma.' });
  }

  const clinicaId = clinicaDe(req);
  const accion = interpretacion.accion;
  const respuestaBase = {
    texto: parsed.data.texto,
    accion,
    paciente: interpretacion.paciente || null,
    candidatos: [] as { id: string; nombre: string; apellidos: string }[],
    dentista: null as Entidad | null,
    gabinete: null as Entidad | null,
    citaId: null as string | null,
    citaOriginal: null as { fecha: string; hora: string } | null,
    fecha: null as string | null,
    hora: null as string | null,
    motivo: interpretacion.motivo || null,
    disponible: null as boolean | null,
    libres: [] as string[],
    avisos: [] as string[],
    pendientes: [] as { id: string; paciente: string; fecha: string; hora: string }[],
    pacienteContacto: null as { nombre: string; apellidos: string; telefono: string | null } | null,
  };

  if (accion === 'confirmar_pendientes') {
    const hasta = sumarDiasISO(hoy, 2);
    const citas = await prisma.cita.findMany({
      where: { clinicaId, fecha: { gte: hoy, lte: hasta }, deletedAt: null, confirmada: false, estado: { notIn: ['hecha', 'cancelada'] } },
      include: { paciente: true },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      take: 10,
    });
    return res.json({
      ...respuestaBase,
      pendientes: citas.map((c) => ({
        id: c.id,
        paciente: c.paciente ? `${c.paciente.nombre} ${c.paciente.apellidos}` : c.nombreLibre || 'Paciente',
        fecha: c.fecha,
        hora: c.hora,
      })),
    });
  }

  if (accion === 'pedir_confirmacion') {
    const candidatos = await resolverPaciente(clinicaId, interpretacion.paciente);
    const avisos: string[] = [];
    if (candidatos.length !== 1) {
      avisos.push(
        candidatos.length === 0
          ? interpretacion.paciente
            ? `No encuentro a "${interpretacion.paciente}" entre los pacientes.`
            : 'No has dicho de qué paciente.'
          : `Hay varios pacientes que coinciden con "${interpretacion.paciente}", dime el nombre completo.`,
      );
      return res.json({ ...respuestaBase, candidatos, avisos });
    }
    const paciente = await prisma.paciente.findUniqueOrThrow({ where: { id: candidatos[0].id } });
    const citaProxima = await prisma.cita.findFirst({
      where: { clinicaId, pacienteId: paciente.id, deletedAt: null, estado: { notIn: ['hecha', 'cancelada'] }, confirmada: false, fecha: { gte: hoy } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    if (!citaProxima) {
      avisos.push(`${paciente.nombre} ${paciente.apellidos} no tiene ninguna cita próxima pendiente de confirmar.`);
      return res.json({ ...respuestaBase, candidatos, avisos });
    }
    if (!paciente.telefono) {
      avisos.push(`${paciente.nombre} ${paciente.apellidos} no tiene teléfono guardado; no puedo pedirle confirmación por WhatsApp.`);
    }
    return res.json({
      ...respuestaBase,
      candidatos,
      citaId: citaProxima.id,
      fecha: citaProxima.fecha,
      hora: citaProxima.hora,
      motivo: citaProxima.motivo,
      pacienteContacto: { nombre: paciente.nombre, apellidos: paciente.apellidos, telefono: paciente.telefono },
      avisos,
    });
  }

  if (accion === 'disponibilidad') {
    const fechaConsulta = interpretacion.fecha || hoy;
    const [clinica, citasDelDia, gabinetes] = await Promise.all([
      prisma.clinica.findUniqueOrThrow({ where: { id: clinicaId } }),
      prisma.cita.findMany({ where: { clinicaId, fecha: fechaConsulta, deletedAt: null } }),
      prisma.gabinete.findMany({ where: { clinicaId } }),
    ]);
    const diaSemana = new Date(`${fechaConsulta}T00:00:00`).getDay();
    const libres = huecosLibres(fechaConsulta, diaSemana, clinica.horario as HorarioSemana, aSlots(citasDelDia), gabinetes.map((g) => g.id));
    return res.json({ ...respuestaBase, fecha: fechaConsulta, libres });
  }

  if (accion === 'otro') {
    return res.json(respuestaBase);
  }

  if (accion === 'mover_cita') {
    const candidatos = await resolverPaciente(clinicaId, interpretacion.paciente);
    const avisos: string[] = [];
    if (candidatos.length !== 1) {
      avisos.push(
        candidatos.length === 0
          ? interpretacion.paciente
            ? `No encuentro a "${interpretacion.paciente}" entre los pacientes.`
            : 'No has dicho de qué paciente es la cita.'
          : `Hay varios pacientes que coinciden con "${interpretacion.paciente}", dime el nombre completo.`,
      );
      return res.json({ ...respuestaBase, candidatos, avisos });
    }
    const paciente = candidatos[0];

    const citaExistente = await prisma.cita.findFirst({
      where: { clinicaId, pacienteId: paciente.id, deletedAt: null, estado: { notIn: ['hecha', 'cancelada'] }, fecha: { gte: hoy } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    if (!citaExistente) {
      avisos.push(`No encuentro ninguna cita próxima de ${paciente.nombre} ${paciente.apellidos} para cambiar.`);
      return res.json({ ...respuestaBase, candidatos, avisos });
    }

    const { resuelto: dentistaResuelto, id: dentistaIdNuevo } = await resolverDentista(clinicaId, interpretacion.dentista, avisos);
    const { resuelto: gabineteResuelto, id: gabineteIdNuevo } = await resolverGabinete(clinicaId, interpretacion.gabinete, avisos);
    const dentistaId = dentistaIdNuevo || citaExistente.dentistaId || undefined;
    const gabineteIdFiltro = gabineteIdNuevo || citaExistente.gabineteId || undefined;
    const fechaNueva = interpretacion.fecha || citaExistente.fecha;

    if (!interpretacion.hora) {
      avisos.push(`No has dicho la hora nueva. Repite la orden completa indicándola, por ejemplo: "cambia la cita de ${paciente.nombre} a las cuatro y media".`);
      return res.json({
        ...respuestaBase,
        candidatos,
        dentista: dentistaResuelto,
        gabinete: gabineteResuelto,
        citaId: citaExistente.id,
        citaOriginal: { fecha: citaExistente.fecha, hora: citaExistente.hora },
        fecha: fechaNueva,
        avisos,
      });
    }

    const clinica = await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaId } });
    const horario = clinica.horario as HorarioSemana;
    const todosGabinetes = await prisma.gabinete.findMany({ where: { clinicaId } });
    const gabineteIds = gabineteIdFiltro ? [gabineteIdFiltro] : todosGabinetes.map((g) => g.id);
    const citasDelDia = await prisma.cita.findMany({ where: { clinicaId, fecha: fechaNueva, deletedAt: null, id: { not: citaExistente.id } } });
    const diaSemana = new Date(`${fechaNueva}T00:00:00`).getDay();
    const libres = huecosLibres(fechaNueva, diaSemana, horario, aSlots(citasDelDia), gabineteIds, dentistaId);
    const disponible = libres.includes(interpretacion.hora);

    return res.json({
      ...respuestaBase,
      candidatos,
      dentista: dentistaResuelto,
      gabinete: gabineteResuelto,
      citaId: citaExistente.id,
      citaOriginal: { fecha: citaExistente.fecha, hora: citaExistente.hora },
      fecha: fechaNueva,
      hora: interpretacion.hora,
      disponible,
      libres,
      avisos,
    });
  }

  // accion === 'agendar'
  const candidatos = await resolverPaciente(clinicaId, interpretacion.paciente);
  const avisos: string[] = [];
  const { resuelto: dentistaResuelto, id: dentistaId } = await resolverDentista(clinicaId, interpretacion.dentista, avisos);
  const { resuelto: gabineteResuelto, id: gabineteIdFiltro } = await resolverGabinete(clinicaId, interpretacion.gabinete, avisos);

  const clinica = await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaId } });
  const horario = clinica.horario as HorarioSemana;
  const todosGabinetes = await prisma.gabinete.findMany({ where: { clinicaId } });
  const gabineteIds = gabineteIdFiltro ? [gabineteIdFiltro] : todosGabinetes.map((g) => g.id);

  let fechaFinal = interpretacion.fecha || null;
  let horaFinal = interpretacion.hora || null;
  let libres: string[] = [];

  if (fechaFinal) {
    const citasDelDia = await prisma.cita.findMany({ where: { clinicaId, fecha: fechaFinal, deletedAt: null } });
    const diaSemana = new Date(`${fechaFinal}T00:00:00`).getDay();
    libres = huecosLibres(fechaFinal, diaSemana, horario, aSlots(citasDelDia), gabineteIds, dentistaId);
    if (!horaFinal) {
      if (libres.length) {
        horaFinal = libres[0];
      } else {
        const siguiente = await buscarProximoHueco(clinicaId, horario, gabineteIds, dentistaId, sumarDiasISO(fechaFinal, 1));
        if (siguiente) {
          avisos.push(`No había huecos libres el ${fechaFinal}; propongo el ${siguiente.fecha}.`);
          fechaFinal = siguiente.fecha;
          horaFinal = siguiente.hora;
          libres = siguiente.libres;
        }
      }
    }
  } else {
    const siguiente = await buscarProximoHueco(clinicaId, horario, gabineteIds, dentistaId, hoy);
    if (siguiente) {
      fechaFinal = siguiente.fecha;
      horaFinal = siguiente.hora;
      libres = siguiente.libres;
    }
  }

  const disponible = fechaFinal && horaFinal ? libres.includes(horaFinal) : null;

  res.json({
    ...respuestaBase,
    candidatos,
    dentista: dentistaResuelto,
    gabinete: gabineteResuelto,
    fecha: fechaFinal,
    hora: horaFinal,
    disponible,
    libres,
    avisos,
  });
});
