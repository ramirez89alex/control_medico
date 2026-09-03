import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol } from '../middleware/auth.js';

export const catalogosRouter = Router();
catalogosRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

catalogosRouter.get('/clinica', async (req, res) => {
  const clinica = await prisma.clinica.findUniqueOrThrow({
    where: { id: clinicaDe(req) },
    select: { nombre: true, nif: true, direccion: true, cp: true, ciudad: true, email: true },
  });
  res.json(clinica);
});

catalogosRouter.get('/dentistas', async (req, res) => {
  const dentistas = await prisma.dentista.findMany({ where: { clinicaId: clinicaDe(req) }, orderBy: { nombre: 'asc' } });
  res.json(dentistas);
});

const dentistaSchema = z.object({
  nombre: z.string().min(1),
  rol: z.string().default('Odontólogo'),
  especialidad: z.string().optional().nullable(),
  color: z.string().default('#3B4076'),
  activo: z.boolean().default(true),
});

catalogosRouter.post('/dentistas', requireRol('admin'), async (req, res) => {
  const parsed = dentistaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const dentista = await prisma.dentista.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  res.status(201).json(dentista);
});

catalogosRouter.get('/gabinetes', async (req, res) => {
  const gabinetes = await prisma.gabinete.findMany({ where: { clinicaId: clinicaDe(req) }, orderBy: { nombre: 'asc' } });
  res.json(gabinetes);
});

const gabineteSchema = z.object({
  nombre: z.string().min(1),
  uso: z.string().optional().nullable(),
});

catalogosRouter.post('/gabinetes', requireRol('admin'), async (req, res) => {
  const parsed = gabineteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const gabinete = await prisma.gabinete.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  res.status(201).json(gabinete);
});

catalogosRouter.get('/tarifario', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const tarifario = await prisma.tarifario.findMany({
    where: {
      clinicaId: clinicaDe(req),
      ...(q
        ? { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { codigo: { contains: q, mode: 'insensitive' } }] }
        : {}),
    },
    orderBy: [{ familia: 'asc' }, { codigo: 'asc' }],
  });
  res.json(tarifario);
});

const tarifarioSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  familia: z.string().optional().nullable(),
  pvp: z.number().nonnegative(),
  coste: z.number().nonnegative().default(0),
  minutos: z.number().int().positive().optional().nullable(),
});

catalogosRouter.post('/tarifario', requireRol('admin'), async (req, res) => {
  const parsed = tarifarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const item = await prisma.tarifario.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  res.status(201).json(item);
});
