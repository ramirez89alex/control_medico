import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const presupuestosRouter = Router();
presupuestosRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

const lineaSchema = z.object({
  codigo: z.string().default(''),
  nombre: z.string().min(1),
  pieza: z.string().optional().nullable(),
  cantidad: z.number().positive().default(1),
  pvp: z.number().nonnegative(),
  coste: z.number().nonnegative().default(0),
});

const presupuestoSchema = z.object({
  pacienteId: z.string().uuid(),
  fecha: z.string().datetime().optional(),
  validezDias: z.number().int().positive().default(30),
  descuentoPct: z.number().min(0).max(100).default(0),
  estado: z.enum(['borrador', 'enviado', 'aceptado', 'rechazado']).default('borrador'),
  notas: z.string().optional().nullable(),
  lineas: z.array(lineaSchema).default([]),
});

presupuestosRouter.get('/', async (req, res) => {
  const pacienteId = req.query.pacienteId ? String(req.query.pacienteId) : undefined;
  const presupuestos = await prisma.presupuesto.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null, ...(pacienteId ? { pacienteId } : {}) },
    include: { paciente: true, lineas: true },
    orderBy: { fecha: 'desc' },
  });
  res.json(presupuestos);
});

presupuestosRouter.get('/:id', async (req, res) => {
  const presupuesto = await prisma.presupuesto.findFirst({
    where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null },
    include: { paciente: true, lineas: true },
  });
  if (!presupuesto) return res.status(404).json({ error: 'Presupuesto no encontrado' });
  res.json(presupuesto);
});

presupuestosRouter.post('/', async (req, res) => {
  const parsed = presupuestoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { lineas, ...cabecera } = parsed.data;

  const presupuesto = await prisma.presupuesto.create({
    data: { ...cabecera, clinicaId: clinicaDe(req), lineas: { create: lineas } },
    include: { paciente: true, lineas: true },
  });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'crear', entidad: 'presupuesto', entidadId: presupuesto.id });
  res.status(201).json(presupuesto);
});

presupuestosRouter.put('/:id', async (req, res) => {
  const parsed = presupuestoSchema.partial({ pacienteId: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.presupuesto.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Presupuesto no encontrado' });

  const { lineas, ...cabecera } = parsed.data;

  // Igual que `editarPresu` en el HTML original: al guardar se reemplaza la cabecera y
  // el conjunto completo de líneas, no un merge parcial.
  const presupuesto = await prisma.$transaction(async (tx) => {
    if (lineas) {
      await tx.lineaPresupuesto.deleteMany({ where: { presupuestoId: existente.id } });
    }
    return tx.presupuesto.update({
      where: { id: existente.id },
      data: { ...cabecera, ...(lineas ? { lineas: { create: lineas } } : {}) },
      include: { paciente: true, lineas: true },
    });
  });

  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'editar', entidad: 'presupuesto', entidadId: presupuesto.id });
  res.json(presupuesto);
});

presupuestosRouter.delete('/:id', requireRol('admin'), async (req, res) => {
  const existente = await prisma.presupuesto.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Presupuesto no encontrado' });

  await prisma.presupuesto.update({ where: { id: existente.id }, data: { deletedAt: new Date() } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'borrar', entidad: 'presupuesto', entidadId: existente.id });
  res.status(204).end();
});
