import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const pacientesRouter = Router();
pacientesRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

const pacienteSchema = z.object({
  nombre: z.string().min(1),
  apellidos: z.string().min(1),
  nacimiento: z.string().datetime().optional().nullable(),
  dni: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  direccion: z.string().optional().nullable(),
  alergias: z.string().optional().nullable(),
  medicacion: z.string().optional().nullable(),
  antecedentes: z.string().optional().nullable(),
  aviso: z.string().optional().nullable(),
  origen: z.string().optional().nullable(),
  doctorId: z.string().uuid().optional().nullable(),
});

pacientesRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const pacientes = await prisma.paciente.findMany({
    where: {
      clinicaId: clinicaDe(req),
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: 'insensitive' } },
              { apellidos: { contains: q, mode: 'insensitive' } },
              { dni: { contains: q, mode: 'insensitive' } },
              { telefono: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ apellidos: 'asc' }, { nombre: 'asc' }],
    take: 100,
  });
  res.json(pacientes);
});

pacientesRouter.get('/:id', async (req, res) => {
  const paciente = await prisma.paciente.findFirst({
    where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null },
    include: { archivos: { where: { deletedAt: null } }, historiaClinica: { where: { deletedAt: null }, orderBy: { fecha: 'desc' } } },
  });
  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });
  res.json(paciente);
});

pacientesRouter.post('/', async (req, res) => {
  const parsed = pacienteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const paciente = await prisma.paciente.create({
    data: { ...parsed.data, email: parsed.data.email || null, clinicaId: clinicaDe(req) },
  });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: req.usuario!.usuarioId, accion: 'crear', entidad: 'paciente', entidadId: paciente.id });
  res.status(201).json(paciente);
});

pacientesRouter.put('/:id', async (req, res) => {
  const parsed = pacienteSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.paciente.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Paciente no encontrado' });

  const paciente = await prisma.paciente.update({
    where: { id: existente.id },
    data: { ...parsed.data, email: parsed.data.email || undefined },
  });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: req.usuario!.usuarioId, accion: 'editar', entidad: 'paciente', entidadId: paciente.id });
  res.json(paciente);
});

const consentSchema = z.object({
  consentDatosAceptado: z.boolean().optional(),
  consentTratamientoAceptado: z.boolean().optional(),
  consentImagenesAceptado: z.boolean().optional(),
  consentComercialAceptado: z.boolean().optional(),
  consentFirmaArchivoId: z.string().uuid().optional(),
});

pacientesRouter.put('/:id/consentimiento', async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.paciente.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Paciente no encontrado' });

  const paciente = await prisma.paciente.update({
    where: { id: existente.id },
    data: { ...parsed.data, consentFecha: new Date() },
  });
  registrarAuditoria({
    clinicaId: clinicaDe(req),
    usuarioId: req.usuario!.usuarioId,
    accion: 'consentimiento',
    entidad: 'paciente',
    entidadId: paciente.id,
  });
  res.json(paciente);
});

pacientesRouter.delete('/:id', requireRol('admin'), async (req, res) => {
  const existente = await prisma.paciente.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Paciente no encontrado' });

  await prisma.paciente.update({ where: { id: existente.id }, data: { deletedAt: new Date() } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: req.usuario!.usuarioId, accion: 'borrar', entidad: 'paciente', entidadId: existente.id });
  res.status(204).end();
});

const notaHistoriaSchema = z.object({
  acto: z.string().min(1),
  piezas: z.string().optional().nullable(),
  nota: z.string().min(1),
  audioArchivoId: z.string().uuid().optional().nullable(),
});

pacientesRouter.post('/:id/historia', async (req, res) => {
  const parsed = notaHistoriaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const paciente = await prisma.paciente.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

  const entrada = await prisma.historiaClinica.create({
    data: { ...parsed.data, clinicaId: clinicaDe(req), pacienteId: paciente.id, autorId: req.usuario!.usuarioId },
  });
  registrarAuditoria({
    clinicaId: clinicaDe(req),
    usuarioId: req.usuario!.usuarioId,
    accion: 'crear',
    entidad: 'historia_clinica',
    entidadId: entrada.id,
  });
  res.status(201).json(entrada);
});

/** Historia clínica: append-only. Solo borrado lógico por admin, nunca edición. */
pacientesRouter.delete('/:id/historia/:entradaId', requireRol('admin'), async (req, res) => {
  const entrada = await prisma.historiaClinica.findFirst({
    where: { id: req.params.entradaId, pacienteId: req.params.id, clinicaId: clinicaDe(req), deletedAt: null },
  });
  if (!entrada) return res.status(404).json({ error: 'Entrada no encontrada' });

  await prisma.historiaClinica.update({ where: { id: entrada.id }, data: { deletedAt: new Date() } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: req.usuario!.usuarioId, accion: 'borrar', entidad: 'historia_clinica', entidadId: entrada.id });
  res.status(204).end();
});
