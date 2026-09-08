import { Router } from 'express';
import { z } from 'zod';
import { huecosLibres, type CitaSlot, type HorarioSemana } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const citasRouter = Router();
citasRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

citasRouter.get('/', async (req, res) => {
  const pacienteId = req.query.pacienteId ? String(req.query.pacienteId) : undefined;
  const desde = fechaSchema.safeParse(req.query.desde).success ? String(req.query.desde) : undefined;
  const hasta = fechaSchema.safeParse(req.query.hasta).success ? String(req.query.hasta) : desde;
  if (!desde && !pacienteId) return res.status(400).json({ error: 'Falta el parámetro desde=YYYY-MM-DD' });

  const citas = await prisma.cita.findMany({
    where: {
      clinicaId: clinicaDe(req),
      deletedAt: null,
      ...(desde ? { fecha: { gte: desde, lte: hasta } } : {}),
      ...(pacienteId ? { pacienteId } : {}),
    },
    include: { paciente: true, dentista: true, gabinete: true },
    orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
  });
  res.json(citas);
});

citasRouter.get('/huecos', async (req, res) => {
  const fecha = fechaSchema.safeParse(req.query.fecha).success ? String(req.query.fecha) : undefined;
  if (!fecha) return res.status(400).json({ error: 'Falta el parámetro fecha=YYYY-MM-DD' });
  const dentistaId = req.query.dentistaId ? String(req.query.dentistaId) : undefined;

  const clinicaId = clinicaDe(req);
  const [clinica, citasDelDia, gabinetes] = await Promise.all([
    prisma.clinica.findUniqueOrThrow({ where: { id: clinicaId } }),
    prisma.cita.findMany({ where: { clinicaId, fecha, deletedAt: null } }),
    prisma.gabinete.findMany({ where: { clinicaId } }),
  ]);

  const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
  const slots: CitaSlot[] = citasDelDia.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    hora: c.hora,
    dur: c.duracionMin,
    gabineteId: c.gabineteId || '',
    dentistaId: c.dentistaId,
    estado: c.estado,
  }));

  const libres = huecosLibres(
    fecha,
    diaSemana,
    clinica.horario as HorarioSemana,
    slots,
    gabinetes.map((g) => g.id),
    dentistaId,
  );
  res.json({ fecha, libres });
});

const UMBRALES_RECORDATORIO = [
  { tipo: '1hora', horas: 1 },
  { tipo: '1dia', horas: 24 },
  { tipo: '3dias', horas: 72 },
  { tipo: 'semana', horas: 168 },
] as const;

/**
 * Citas próximas cuyo recordatorio "más urgente" toca ya y todavía no se ha enviado.
 * Cada cita aparece como mucho una vez, con el umbral más cercano pendiente (si ya tocaba
 * "3 días antes" y encima ya estamos a menos de 1 día, se prioriza "1 día antes").
 */
citasRouter.get('/recordatorios-pendientes', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + 8 * 24 * 60 * 60 * 1000);
  const fechaHasta = `${hasta.getFullYear()}-${String(hasta.getMonth() + 1).padStart(2, '0')}-${String(hasta.getDate()).padStart(2, '0')}`;
  const fechaDesde = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

  const citas = await prisma.cita.findMany({
    where: {
      clinicaId,
      deletedAt: null,
      estado: { notIn: ['hecha', 'cancelada'] },
      fecha: { gte: fechaDesde, lte: fechaHasta },
    },
    include: { paciente: true, dentista: true },
    orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
  });

  const pendientes = citas
    .map((c) => {
      const inicio = new Date(`${c.fecha}T${c.hora}:00`);
      const horasRestantes = (inicio.getTime() - ahora.getTime()) / (1000 * 60 * 60);
      if (horasRestantes < 0) return null;
      // El umbral vigente es el más cercano cuya ventana ya se ha entrado (el más pequeño que
      // cumple horasRestantes<=horas). Si ya se envió, no se cae a uno más lejano y desfasado
      // (p. ej. no se ofrece "1 día antes" cuando ya quedan 25 minutos y el de 1 hora ya se envió).
      const vigente = UMBRALES_RECORDATORIO.find((u) => horasRestantes <= u.horas);
      if (!vigente || c.recordatoriosEnviados.includes(vigente.tipo)) return null;
      const umbral = vigente;
      return {
        id: c.id,
        fecha: c.fecha,
        hora: c.hora,
        motivo: c.motivo,
        paciente: c.paciente ? { nombre: c.paciente.nombre, apellidos: c.paciente.apellidos, telefono: c.paciente.telefono } : c.nombreLibre ? { nombre: c.nombreLibre, apellidos: '', telefono: null } : null,
        pacienteId: c.pacienteId,
        dentista: c.dentista?.nombre || null,
        tipo: umbral.tipo,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  res.json(pendientes);
});

const recordatorioSchema = z.object({ tipo: z.enum(['semana', '3dias', '1dia', '1hora']) });

citasRouter.post('/:id/recordatorio', async (req, res) => {
  const parsed = recordatorioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const clinicaId = clinicaDe(req);
  const existente = await prisma.cita.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });

  const cita = await prisma.cita.update({
    where: { id: existente.id },
    data: { recordatoriosEnviados: { set: [...new Set([...existente.recordatoriosEnviados, parsed.data.tipo])] } },
  });
  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'editar', entidad: 'cita_recordatorio', entidadId: cita.id });
  res.json(cita);
});

const citaSchema = z.object({
  pacienteId: z.string().uuid().optional().nullable(),
  nombreLibre: z.string().optional().nullable(),
  fecha: fechaSchema,
  hora: z.string().regex(/^\d{2}:\d{2}$/),
  duracionMin: z.number().int().positive().default(30),
  gabineteId: z.string().uuid().optional().nullable(),
  dentistaId: z.string().uuid().optional().nullable(),
  motivo: z.string().optional().nullable(),
});

citasRouter.post('/', async (req, res) => {
  const parsed = citaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cita = await prisma.cita.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'crear', entidad: 'cita', entidadId: cita.id });
  res.status(201).json(cita);
});

const citaUpdateSchema = citaSchema.partial().extend({
  estado: z.enum(['programada', 'llegado', 'silla', 'hecha', 'cancelada']).optional(),
  confirmada: z.boolean().optional(),
  confirmPedida: z.string().datetime().optional(),
});

citasRouter.put('/:id', async (req, res) => {
  const parsed = citaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.cita.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });

  const { confirmPedida, ...resto } = parsed.data;
  const cita = await prisma.cita.update({
    where: { id: existente.id },
    data: { ...resto, ...(confirmPedida ? { confirmPedida: new Date(confirmPedida) } : {}) },
  });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'editar', entidad: 'cita', entidadId: cita.id });
  res.json(cita);
});

citasRouter.delete('/:id', async (req, res) => {
  const existente = await prisma.cita.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });

  await prisma.cita.update({ where: { id: existente.id }, data: { deletedAt: new Date(), estado: 'cancelada' } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'borrar', entidad: 'cita', entidadId: existente.id });
  res.status(204).end();
});
