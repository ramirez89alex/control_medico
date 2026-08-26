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
  const desde = fechaSchema.safeParse(req.query.desde).success ? String(req.query.desde) : undefined;
  const hasta = fechaSchema.safeParse(req.query.hasta).success ? String(req.query.hasta) : desde;
  if (!desde) return res.status(400).json({ error: 'Falta el parámetro desde=YYYY-MM-DD' });

  const citas = await prisma.cita.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null, fecha: { gte: desde, lte: hasta } },
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
});

citasRouter.put('/:id', async (req, res) => {
  const parsed = citaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.cita.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Cita no encontrada' });

  const cita = await prisma.cita.update({ where: { id: existente.id }, data: parsed.data });
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
