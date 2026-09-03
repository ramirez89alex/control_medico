import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const laboratorioRouter = Router();
laboratorioRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

/** Igual orden que FASES en el HTML original — deriva el estado según qué fases están marcadas. */
export const FASES_LAB = ['Impresión enviada', 'Prueba en boca', 'Terminado en lab', 'Recibido en clínica', 'Colocado al paciente'] as const;

function estadoDesdeFases(fases: Record<string, string>) {
  if (fases['Colocado al paciente']) return 'entregado' as const;
  if (fases['Recibido en clínica']) return 'recibido' as const;
  return 'enviado' as const;
}

laboratorioRouter.get('/', async (req, res) => {
  const pacienteId = req.query.pacienteId ? String(req.query.pacienteId) : undefined;
  const trabajos = await prisma.laboratorio.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null, ...(pacienteId ? { pacienteId } : {}) },
    include: { paciente: true },
    orderBy: { fechaPrevista: 'asc' },
  });
  res.json(trabajos);
});

const laboratorioSchema = z.object({
  pacienteId: z.string().uuid(),
  nombreLab: z.string().optional().nullable(),
  tipo: z.string().min(1),
  trabajo: z.string().optional().nullable(),
  piezas: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  fechaEnvio: z.string().datetime(),
  diasEntrega: z.number().int().positive().default(7),
  coste: z.number().nonnegative().default(0),
  fechaCita: z.string().datetime().optional().nullable(),
});

laboratorioRouter.post('/', async (req, res) => {
  const parsed = laboratorioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const envio = new Date(parsed.data.fechaEnvio);
  const prevista = new Date(envio);
  prevista.setDate(prevista.getDate() + parsed.data.diasEntrega);

  const trabajo = await prisma.laboratorio.create({
    data: {
      ...parsed.data,
      clinicaId: clinicaDe(req),
      fechaEnvio: envio,
      fechaPrevista: prevista,
      fases: { 'Impresión enviada': new Date().toISOString().slice(0, 10) },
    },
    include: { paciente: true },
  });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'crear', entidad: 'laboratorio', entidadId: trabajo.id });
  res.status(201).json(trabajo);
});

laboratorioRouter.post('/:id/fase', async (req, res) => {
  const fase = String(req.body?.fase || '');
  if (!FASES_LAB.includes(fase as (typeof FASES_LAB)[number])) return res.status(400).json({ error: 'Fase desconocida' });

  const existente = await prisma.laboratorio.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Trabajo no encontrado' });

  const fases = { ...(existente.fases as Record<string, string>) };
  if (fases[fase]) delete fases[fase];
  else fases[fase] = new Date().toISOString().slice(0, 10);

  const trabajo = await prisma.laboratorio.update({
    where: { id: existente.id },
    data: { fases, estado: estadoDesdeFases(fases) },
    include: { paciente: true },
  });
  res.json(trabajo);
});

laboratorioRouter.put('/:id/estado', async (req, res) => {
  const estado = String(req.body?.estado || '');
  if (!['enviado', 'recibido', 'entregado'].includes(estado)) return res.status(400).json({ error: 'Estado desconocido' });

  const existente = await prisma.laboratorio.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Trabajo no encontrado' });

  const trabajo = await prisma.laboratorio.update({
    where: { id: existente.id },
    data: { estado: estado as 'enviado' | 'recibido' | 'entregado' },
    include: { paciente: true },
  });
  res.json(trabajo);
});

laboratorioRouter.delete('/:id', async (req, res) => {
  const existente = await prisma.laboratorio.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Trabajo no encontrado' });

  await prisma.laboratorio.update({ where: { id: existente.id }, data: { deletedAt: new Date() } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'borrar', entidad: 'laboratorio', entidadId: existente.id });
  res.status(204).end();
});
