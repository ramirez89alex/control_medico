import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireGestion, requireRol } from '../middleware/auth.js';

export const marketingRouter = Router();
marketingRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'), requireGestion);

/**
 * Devuelve todos los pacientes con fecha de nacimiento; el cálculo de "cuántos días faltan"
 * se hace en el cliente (necesita la fecha local del navegador, no la del servidor).
 */
marketingRouter.get('/cumpleanos', async (req, res) => {
  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null, nacimiento: { not: null } },
    select: { id: true, nombre: true, apellidos: true, telefono: true, email: true, nacimiento: true },
  });
  res.json(pacientes);
});

/** Pacientes sin cita futura cuya última sesión clínica es anterior al umbral de revisión de la clínica. */
marketingRouter.get('/revision', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const clinica = await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaId }, select: { mesesRevision: true } });
  const limite = new Date();
  limite.setMonth(limite.getMonth() - clinica.mesesRevision);

  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId, deletedAt: null },
    select: {
      id: true,
      nombre: true,
      apellidos: true,
      telefono: true,
      email: true,
      createdAt: true,
      historiaClinica: { where: { deletedAt: null }, orderBy: { fecha: 'desc' }, take: 1, select: { fecha: true } },
      citas: { where: { deletedAt: null, fecha: { gte: new Date().toISOString().slice(0, 10) } }, take: 1, select: { id: true } },
    },
  });

  const lista = pacientes
    .filter((p) => p.citas.length === 0)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      apellidos: p.apellidos,
      telefono: p.telefono,
      email: p.email,
      ultimaVisita: p.historiaClinica[0]?.fecha ?? p.createdAt,
    }))
    .filter((p) => p.ultimaVisita < limite)
    .sort((a, b) => +new Date(a.ultimaVisita) - +new Date(b.ultimaVisita));

  res.json(lista);
});

marketingRouter.get('/campanas', async (req, res) => {
  const campanas = await prisma.campana.findMany({ where: { clinicaId: clinicaDe(req), deletedAt: null }, orderBy: { fecha: 'desc' } });
  res.json(campanas);
});

const campanaSchema = z.object({
  nombre: z.string().min(1),
  canal: z.string().default('Email'),
  publico: z.string().default('general'),
  asunto: z.string().optional().nullable(),
  cuerpo: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

marketingRouter.post('/campanas', async (req, res) => {
  const parsed = campanaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const campana = await prisma.campana.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  res.status(201).json(campana);
});

const campanaUpdateSchema = campanaSchema.partial().extend({
  estado: z.enum(['preparada', 'en_curso', 'terminada']).optional(),
  enviados: z.number().int().min(0).optional(),
  respuestas: z.number().int().min(0).optional(),
  citas: z.number().int().min(0).optional(),
  coste: z.number().min(0).optional(),
});

marketingRouter.put('/campanas/:id', async (req, res) => {
  const parsed = campanaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existe = await prisma.campana.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrada' });
  const campana = await prisma.campana.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(campana);
});

marketingRouter.get('/ideas', async (req, res) => {
  const ideas = await prisma.idea.findMany({ where: { clinicaId: clinicaDe(req), deletedAt: null }, orderBy: { votos: 'desc' } });
  res.json(ideas);
});

const ideaSchema = z.object({
  texto: z.string().min(1),
  autor: z.string().optional().nullable(),
});

marketingRouter.post('/ideas', async (req, res) => {
  const parsed = ideaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const idea = await prisma.idea.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  res.status(201).json(idea);
});

const ideaUpdateSchema = z.object({
  estado: z.enum(['nueva', 'en_estudio', 'en_marcha', 'descartada', 'hecha']).optional(),
  votos: z.number().int().min(0).optional(),
});

marketingRouter.put('/ideas/:id', async (req, res) => {
  const parsed = ideaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existe = await prisma.idea.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrada' });
  const idea = await prisma.idea.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(idea);
});

marketingRouter.post('/ideas/:id/a-campana', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const idea = await prisma.idea.findFirst({ where: { id: req.params.id, clinicaId } });
  if (!idea) return res.status(404).json({ error: 'No encontrada' });

  const [campana] = await prisma.$transaction([
    prisma.campana.create({
      data: {
        clinicaId,
        nombre: idea.texto.slice(0, 50),
        canal: 'Instagram',
        publico: 'general',
        cuerpo: idea.texto,
        notas: `Nace de la idea de ${idea.autor || 'el equipo'}`,
      },
    }),
    prisma.idea.update({ where: { id: idea.id }, data: { estado: 'en_marcha' } }),
  ]);
  res.status(201).json(campana);
});
