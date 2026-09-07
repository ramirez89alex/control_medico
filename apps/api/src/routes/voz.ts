import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { huecosLibres, hoyISO, sumarDiasISO, type CitaSlot, type HorarioSemana } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { env } from '../env.js';

export const vozRouter = Router();
vozRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

const ordenSchema = z.object({ texto: z.string().min(2) });

const ACCIONES = [
  'agendar',
  'mover_cita',
  'disponibilidad',
  'confirmar_pendientes',
  'pedir_confirmacion',
  'crear_paciente',
  'abrir_paciente',
  'crear_presupuesto',
  'registrar_cobro',
  'generar_acceso',
  'registrar_historia',
  'actualizar_odontograma',
  'otro',
] as const;

const FORMAS_COBRO = ['tarjeta', 'efectivo', 'bizum', 'transferencia', 'enlace_pago', 'financiacion', 'seguro'] as const;
const ESTADOS_DIENTE_VOZ = ['sano', 'caries', 'obturado', 'endo', 'corona', 'implante', 'ausente'] as const;

const interpretacionSchema = z.object({
  accion: z.enum(ACCIONES).default('agendar'),
  paciente: z.string().nullable().optional(),
  apellidosPaciente: z.string().nullable().optional(),
  telefonoPaciente: z.string().nullable().optional(),
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
  nota: z.string().nullable().optional(),
  piezas: z.string().nullable().optional(),
  importe: z.number().nullable().optional(),
  formaCobro: z.enum(FORMAS_COBRO).nullable().optional(),
  concepto: z.string().nullable().optional(),
  estadoDiente: z.enum(ESTADOS_DIENTE_VOZ).nullable().optional(),
});

type Entidad = { id: string; nombre: string };
type PacienteBasico = { id: string; nombre: string; apellidos: string };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

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

async function resolverPaciente(clinicaId: string, nombre: string | null | undefined): Promise<PacienteBasico[]> {
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

/**
 * Común a todos los intents que actúan sobre UN paciente: exige una coincidencia exacta o pide
 * desambiguar. Devuelve siempre `candidatos` (aunque sean 0 o varios) para que el cliente pueda
 * pintar la lista de "elige uno" — solo `unico` decide si el intent puede seguir adelante.
 */
async function resolverPacienteUnico(
  clinicaId: string,
  nombre: string | null | undefined,
  avisos: string[],
): Promise<{ candidatos: PacienteBasico[]; unico: PacienteBasico | null }> {
  const candidatos = await resolverPaciente(clinicaId, nombre);
  if (candidatos.length === 1) return { candidatos, unico: candidatos[0] };
  avisos.push(
    candidatos.length === 0
      ? nombre
        ? `No encuentro a "${nombre}" entre los pacientes.`
        : 'No has dicho de qué paciente.'
      : `Hay varios pacientes que coinciden con "${nombre}", dime el nombre completo.`,
  );
  return { candidatos, unico: null };
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
  const sistema = `Eres el asistente de voz/texto de la gestión de una clínica dental en España (interpreta español de España por defecto, pero entiende cualquier variante o forma de decir las cosas, formal o coloquial, con o sin acentos correctos). Te dan una frase u orden en texto, dicha por el personal de la clínica. Hoy es ${hoy} (formato AAAA-MM-DD).

Tu trabajo es CLASIFICAR la intención con la mayor flexibilidad posible — la misma intención se puede decir de muchísimas formas distintas, y debes reconocerla igual. Devuelve SOLO un JSON, sin texto ni markdown alrededor, con esta forma exacta:
{"accion": "agendar" | "mover_cita" | "disponibilidad" | "confirmar_pendientes" | "pedir_confirmacion" | "crear_paciente" | "abrir_paciente" | "crear_presupuesto" | "registrar_cobro" | "generar_acceso" | "registrar_historia" | "actualizar_odontograma" | "otro",
"paciente": "nombre del paciente mencionado o null",
"apellidosPaciente": "apellidos, SOLO si en 'crear_paciente' los dijeron claramente separados del nombre, si no null",
"telefonoPaciente": "teléfono dictado, solo dígitos, o null",
"dentista": "nombre del profesional mencionado o null",
"gabinete": "nombre o número de gabinete mencionado o null",
"fecha": "AAAA-MM-DD o null",
"hora": "HH:MM en 24h o null",
"motivo": "breve motivo, tratamiento, o lo que se hizo/se va a hacer, o null",
"nota": "detalle adicional dictado para una nota clínica, o null",
"piezas": "números de pieza dental (notación FDI, ej. 16, 24, 36) mencionados, tal cual los digan, o null",
"importe": número en euros mencionado, o null,
"formaCobro": "tarjeta" | "efectivo" | "bizum" | "transferencia" | "enlace_pago" | "financiacion" | "seguro" | null,
"concepto": "breve concepto del cobro o null",
"estadoDiente": "sano" | "caries" | "obturado" | "endo" | "corona" | "implante" | "ausente" | null}

Significado de cada acción — reconoce CUALQUIER forma razonable de pedirlas, no solo estos ejemplos:
- "agendar": reservar una cita NUEVA. Ej: "agenda una cita para María", "resérvame hueco con el doctor Garbarino mañana", "dale cita a Juan para el lunes a las diez", "necesito meter una revisión para Ana". No hace falta fecha/hora: si faltan, se busca el primer hueco libre automáticamente.
- "mover_cita": cambiar fecha, hora, profesional o gabinete de una cita YA EXISTENTE. Ej: "cambia la cita de Alexander al viernes", "mueve a las cinco la cita de María", "aplaza la revisión de Juan una semana", "pon la cita de Ana con la doctora Lucía en vez de con Garbarino". "fecha"/"hora" son los valores NUEVOS.
- "pedir_confirmacion": pedir/enviar confirmación de la cita de un paciente CONCRETO. Ej: "pide confirmación a María", "manda un wasap a Alexander para confirmar", "confirma la cita de Juan".
- "disponibilidad": preguntar qué huecos hay, sin reservar nada. Ej: "¿qué huecos hay mañana?", "dime la disponibilidad del jueves", "¿a qué hora tengo libre con la doctora Lucía?". Si no dicen día, usa hoy (${hoy}).
- "confirmar_pendientes": preguntar en general qué citas faltan por confirmar, SIN nombrar paciente. Ej: "¿qué citas faltan por confirmar?", "dime las pendientes de confirmación".
- "crear_paciente": dar de alta un paciente NUEVO. Ej: "crea un paciente nuevo que se llama Pedro Gómez", "dame de alta a Lucía Fernández, su teléfono es...", "apunta un cliente nuevo llamado...". Pon el nombre completo en "paciente" (y en "apellidosPaciente" solo si los distinguen claramente).
- "abrir_paciente": abrir/entrar en la ficha de un paciente ya existente. Ej: "abre la ficha de María", "entra al paciente Alexander", "quiero ver el historial de Juan", "búscame a Ana García".
- "crear_presupuesto": preparar un presupuesto para un paciente. Ej: "hazme un presupuesto para María", "necesito presupuestar una limpieza a Juan", "abre presupuestos para el paciente Alexander". Si mencionan el tratamiento, ponlo en "motivo".
- "registrar_cobro": anotar un pago/cobro de un paciente. Ej: "cóbrale 50 euros a María en efectivo", "registra un pago de 120 con tarjeta de Juan", "Alexander ha pagado 30 euros por bizum". Extrae "importe" (número), "formaCobro" y, si lo dicen, "concepto".
- "generar_acceso": crear el enlace/acceso al portal para que el paciente entre desde su móvil. Ej: "dale acceso al portal a María", "genera el enlace del paciente para Juan", "mándale el acceso a Alexander".
- "registrar_historia": anotar en la historia clínica lo que se le ha hecho/se le está haciendo a un paciente durante o después de una sesión. Ej: "apunta que a María se le ha hecho una limpieza", "registra que a Juan le hemos puesto un empaste en la 16", "anota en el historial de Alexander que...". "motivo" = lo que se hizo (breve), "nota" = cualquier detalle extra, "piezas" = piezas mencionadas.
- "actualizar_odontograma": marcar el estado de un diente concreto en el odontograma de un paciente. Ej: "en el odontograma de María marca la 16 con caries", "pon la pieza 24 de Juan como ausente", "a Alexander la 36 ya está obturada", "quita la marca del diente 11 de Ana" (estadoDiente "sano"). "piezas" = la pieza (un solo número), "estadoDiente" = el estado.
- "otro": cualquier cosa que no encaje claramente en lo anterior, o una charla genérica.

Si mencionan un profesional o doctor concreto, ponlo en "dentista". Si mencionan un gabinete o sala concreta, ponlo en "gabinete". Interpreta expresiones de fecha relativas (hoy, mañana, pasado mañana, el lunes que viene, en 15 días, el 12 de septiembre) usando la fecha de hoy. Interpreta horas dichas de forma natural (las diez y media -> 10:30, las cuatro de la tarde -> 16:00) y cantidades en euros dichas de forma natural (cincuenta euros -> 50, ciento veinte -> 120). No inventes datos que no estén en la frase: si algo no se menciona, usa null. Ante la duda entre dos acciones parecidas, elige la que mejor encaje con el verbo principal de la frase.`;

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
    candidatos: [] as PacienteBasico[],
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
    pacienteCreado: null as PacienteBasico | null,
    pacienteAbrir: null as PacienteBasico | null,
    cobroRegistrado: null as { id: string; importe: number; forma: string; paciente: string } | null,
    accesoUrl: null as string | null,
    historiaRegistrada: null as { id: string; acto: string; paciente: string } | null,
    odontogramaActualizado: null as { pieza: string; estado: string; paciente: string } | null,
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
    const avisos: string[] = [];
    const { candidatos, unico } = await resolverPacienteUnico(clinicaId, interpretacion.paciente, avisos);
    if (!unico) return res.json({ ...respuestaBase, candidatos, avisos });
    const paciente = await prisma.paciente.findUniqueOrThrow({ where: { id: unico.id } });
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

  if (accion === 'crear_paciente') {
    const nombreCompleto = (interpretacion.paciente || '').trim();
    if (!nombreCompleto) {
      return res.json({ ...respuestaBase, avisos: ['No he entendido el nombre del paciente a crear.'] });
    }
    let nombre = nombreCompleto;
    let apellidos = interpretacion.apellidosPaciente?.trim() || '';
    if (!apellidos) {
      const partes = nombreCompleto.split(/\s+/);
      nombre = partes[0];
      apellidos = partes.slice(1).join(' ');
    }
    const avisos: string[] = [];
    const parecidos = await resolverPaciente(clinicaId, `${nombre} ${apellidos}`.trim());
    if (parecidos.length) {
      avisos.push(`Ya había pacientes parecidos (${parecidos.map((p) => `${p.nombre} ${p.apellidos}`).join(', ')}); lo he creado igualmente como nuevo.`);
    }
    const nuevo = await prisma.paciente.create({
      data: { clinicaId, nombre, apellidos: apellidos || '(sin apellidos)', telefono: interpretacion.telefonoPaciente || null },
    });
    registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'paciente', entidadId: nuevo.id, detalle: { origen: 'voz' } });
    return res.json({ ...respuestaBase, pacienteCreado: { id: nuevo.id, nombre: nuevo.nombre, apellidos: nuevo.apellidos }, avisos });
  }

  if (accion === 'abrir_paciente' || accion === 'crear_presupuesto') {
    const avisos: string[] = [];
    const { candidatos, unico } = await resolverPacienteUnico(clinicaId, interpretacion.paciente, avisos);
    if (!unico) return res.json({ ...respuestaBase, candidatos, avisos });
    return res.json({ ...respuestaBase, candidatos, pacienteAbrir: unico });
  }

  if (accion === 'registrar_cobro') {
    const avisos: string[] = [];
    const { candidatos, unico } = await resolverPacienteUnico(clinicaId, interpretacion.paciente, avisos);
    if (!unico) return res.json({ ...respuestaBase, candidatos, avisos });
    if (!interpretacion.importe || interpretacion.importe <= 0) {
      avisos.push('No he entendido el importe del cobro.');
      return res.json({ ...respuestaBase, candidatos, avisos });
    }
    const forma = interpretacion.formaCobro || 'efectivo';
    const cobro = await prisma.$transaction(async (tx) => {
      const numero = (await tx.cobro.count({ where: { clinicaId } })) + 1;
      return tx.cobro.create({
        data: { clinicaId, pacienteId: unico.id, importe: interpretacion.importe as number, forma, concepto: interpretacion.concepto || null, numero },
        include: { paciente: true },
      });
    });
    registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'cobro', entidadId: cobro.id, detalle: { origen: 'voz' } });
    return res.json({
      ...respuestaBase,
      candidatos,
      cobroRegistrado: { id: cobro.id, importe: cobro.importe, forma: cobro.forma, paciente: `${cobro.paciente.nombre} ${cobro.paciente.apellidos}` },
    });
  }

  if (accion === 'generar_acceso') {
    const avisos: string[] = [];
    const { candidatos, unico } = await resolverPacienteUnico(clinicaId, interpretacion.paciente, avisos);
    if (!unico) return res.json({ ...respuestaBase, candidatos, avisos });
    const paciente = await prisma.paciente.findUniqueOrThrow({ where: { id: unico.id } });
    const token = randomBytes(32).toString('base64url');
    await prisma.accesoPaciente.create({
      data: {
        clinicaId,
        pacienteId: paciente.id,
        tokenHash: hashToken(token),
        expiraEn: new Date(Date.now() + 15 * 60 * 1000),
        creadoPorUsuarioId: usuarioDe(req),
      },
    });
    registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'generar_acceso', entidad: 'paciente', entidadId: paciente.id, detalle: { origen: 'voz' } });
    return res.json({
      ...respuestaBase,
      candidatos,
      accesoUrl: `${env.frontendUrl}/acceso/${token}`,
      pacienteContacto: { nombre: paciente.nombre, apellidos: paciente.apellidos, telefono: paciente.telefono },
    });
  }

  if (accion === 'registrar_historia') {
    const avisos: string[] = [];
    const { candidatos, unico } = await resolverPacienteUnico(clinicaId, interpretacion.paciente, avisos);
    if (!unico) return res.json({ ...respuestaBase, candidatos, avisos });
    const acto = interpretacion.motivo || 'Sesión clínica';
    const nota = interpretacion.nota || acto;
    const entrada = await prisma.historiaClinica.create({
      data: { clinicaId, pacienteId: unico.id, acto, piezas: interpretacion.piezas || null, nota, autorId: usuarioDe(req) },
    });
    return res.json({
      ...respuestaBase,
      candidatos,
      historiaRegistrada: { id: entrada.id, acto: entrada.acto, paciente: `${unico.nombre} ${unico.apellidos}` },
    });
  }

  if (accion === 'actualizar_odontograma') {
    const avisos: string[] = [];
    const { candidatos, unico } = await resolverPacienteUnico(clinicaId, interpretacion.paciente, avisos);
    if (!unico) return res.json({ ...respuestaBase, candidatos, avisos });
    const pieza = (interpretacion.piezas || '').match(/\d+/)?.[0];
    if (!pieza) {
      avisos.push('No he entendido qué pieza dental (dime el número, por ejemplo "la 16").');
      return res.json({ ...respuestaBase, candidatos, avisos });
    }
    const estado = interpretacion.estadoDiente && interpretacion.estadoDiente !== 'sano' ? interpretacion.estadoDiente : '';
    const paciente = await prisma.paciente.findUniqueOrThrow({ where: { id: unico.id } });
    const odontograma = { ...(paciente.odontograma as Record<string, string>) };
    if (estado) odontograma[pieza] = estado;
    else delete odontograma[pieza];
    await prisma.paciente.update({ where: { id: paciente.id }, data: { odontograma } });
    return res.json({
      ...respuestaBase,
      candidatos,
      odontogramaActualizado: { pieza, estado: estado || 'sano', paciente: `${unico.nombre} ${unico.apellidos}` },
    });
  }

  if (accion === 'otro') {
    return res.json(respuestaBase);
  }

  if (accion === 'mover_cita') {
    const avisos: string[] = [];
    const { candidatos: candidatosResueltos, unico: paciente } = await resolverPacienteUnico(clinicaId, interpretacion.paciente, avisos);
    if (!paciente) return res.json({ ...respuestaBase, candidatos: candidatosResueltos, avisos });

    const citaExistente = await prisma.cita.findFirst({
      where: { clinicaId, pacienteId: paciente.id, deletedAt: null, estado: { notIn: ['hecha', 'cancelada'] }, fecha: { gte: hoy } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    if (!citaExistente) {
      avisos.push(`No encuentro ninguna cita próxima de ${paciente.nombre} ${paciente.apellidos} para cambiar.`);
      return res.json({ ...respuestaBase, candidatos: candidatosResueltos, avisos });
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
        candidatos: candidatosResueltos,
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
      candidatos: candidatosResueltos,
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
