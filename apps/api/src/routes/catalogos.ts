import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol } from '../middleware/auth.js';

export const catalogosRouter = Router();
catalogosRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

const clinicaSelect = {
  nombre: true,
  titular: true,
  nif: true,
  direccion: true,
  cp: true,
  ciudad: true,
  telefono: true,
  email: true,
  colegiado: true,
  dpd: true,
  iva: true,
  finCuotas: true,
  finTIN: true,
  banco: true,
  pasarela: true,
  iban: true,
} as const;

catalogosRouter.get('/clinica', async (req, res) => {
  const clinica = await prisma.clinica.findUniqueOrThrow({
    where: { id: clinicaDe(req) },
    select: clinicaSelect,
  });
  res.json(clinica);
});

const clinicaUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  titular: z.string().optional().nullable(),
  nif: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  cp: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  colegiado: z.string().optional().nullable(),
  dpd: z.string().optional().nullable(),
  iva: z.number().min(0).optional(),
  finCuotas: z.number().int().positive().optional(),
  finTIN: z.number().min(0).optional(),
  banco: z.string().optional().nullable(),
  pasarela: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
});

catalogosRouter.put('/clinica', requireRol('admin'), async (req, res) => {
  const parsed = clinicaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clinica = await prisma.clinica.update({ where: { id: clinicaDe(req) }, data: parsed.data, select: clinicaSelect });
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

catalogosRouter.put('/gabinetes/:id', requireRol('admin'), async (req, res) => {
  const parsed = gabineteSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existe = await prisma.gabinete.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  const gabinete = await prisma.gabinete.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(gabinete);
});

catalogosRouter.delete('/gabinetes/:id', requireRol('admin'), async (req, res) => {
  const existe = await prisma.gabinete.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  try {
    await prisma.gabinete.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    if (e?.code === 'P2003') return res.status(409).json({ error: 'Este gabinete tiene citas o profesionales asignados' });
    throw e;
  }
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

catalogosRouter.put('/tarifario/:id', requireRol('admin'), async (req, res) => {
  const parsed = tarifarioSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existe = await prisma.tarifario.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  const item = await prisma.tarifario.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(item);
});

catalogosRouter.delete('/tarifario/:id', requireRol('admin'), async (req, res) => {
  const existe = await prisma.tarifario.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  await prisma.tarifario.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
