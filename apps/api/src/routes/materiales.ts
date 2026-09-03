import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const materialesRouter = Router();
materialesRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

materialesRouter.get('/', async (req, res) => {
  const materiales = await prisma.material.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null },
    orderBy: { nombre: 'asc' },
  });
  res.json(materiales);
});

const materialSchema = z.object({
  nombre: z.string().min(1),
  unidad: z.string().default('ud'),
  cantidad: z.number().nonnegative().default(0),
  coste: z.number().nonnegative().default(0),
});

materialesRouter.post('/', async (req, res) => {
  const parsed = materialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const material = await prisma.material.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'crear', entidad: 'material', entidadId: material.id });
  res.status(201).json(material);
});

materialesRouter.get('/consumos', async (req, res) => {
  const pacienteId = req.query.pacienteId ? String(req.query.pacienteId) : undefined;
  const consumos = await prisma.materialConsumo.findMany({
    where: { clinicaId: clinicaDe(req), ...(pacienteId ? { pacienteId } : {}) },
    include: { material: true },
    orderBy: { fecha: 'desc' },
  });
  res.json(consumos);
});
