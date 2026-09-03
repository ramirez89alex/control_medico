import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const equipoRouter = Router();
equipoRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

equipoRouter.get('/', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const [dentistas, recuentos] = await Promise.all([
    prisma.dentista.findMany({ where: { clinicaId }, include: { gabinete: true }, orderBy: { nombre: 'asc' } }),
    prisma.paciente.groupBy({ by: ['doctorId'], where: { clinicaId, deletedAt: null, doctorId: { not: null } }, _count: true }),
  ]);
  const porDoctor = new Map(recuentos.map((r) => [r.doctorId, r._count]));
  res.json(dentistas.map((d) => ({ ...d, pacientesAsignados: porDoctor.get(d.id) || 0 })));
});

const altaSchema = z.object({
  nombre: z.string().min(1),
  especialidad: z.string().optional().nullable(),
  color: z.string().default('#3B4076'),
});

equipoRouter.post('/', async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const dentista = await prisma.dentista.create({
    data: { ...parsed.data, rol: parsed.data.especialidad || 'Odontólogo', clinicaId: clinicaDe(req) },
  });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'crear', entidad: 'dentista', entidadId: dentista.id });
  res.status(201).json(dentista);
});

const fichaSchema = z.object({
  nombre: z.string().min(1),
  rol: z.string().min(1).default('Odontólogo'),
  especialidad: z.string().optional().nullable(),
  colegiado: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  dni: z.string().optional().nullable(),
  fechaAlta: z.string().datetime().optional().nullable(),
  contrato: z.string().optional().nullable(),
  horasSemana: z.number().positive().default(40),
  color: z.string().default('#3B4076'),
  activo: z.boolean().default(true),
  notas: z.string().optional().nullable(),
  gabineteId: z.string().uuid().optional().nullable(),
  dias: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
});

equipoRouter.put('/:id', async (req, res) => {
  const parsed = fichaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.dentista.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existente) return res.status(404).json({ error: 'Profesional no encontrado' });

  const { gabineteId, fechaAlta, ...resto } = parsed.data;
  const dentista = await prisma.dentista.update({
    where: { id: existente.id },
    data: {
      ...resto,
      email: parsed.data.email || null,
      fechaAlta: fechaAlta ? new Date(fechaAlta) : null,
      gabinete: gabineteId ? { connect: { id: gabineteId } } : { disconnect: true },
    },
    include: { gabinete: true },
  });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'editar', entidad: 'dentista', entidadId: dentista.id });
  res.json(dentista);
});

const ORDEN_ESTADOS = ['trabaja', 'libre', 'vac', 'baja'] as const;

/** Día de la semana (0=domingo) contra `dias`; sin excepción en `calendario` = "trabaja"/"libre". */
function estadoBase(dias: number[], fecha: string): 'trabaja' | 'libre' {
  const dow = new Date(`${fecha}T00:00:00`).getDay();
  return dias.includes(dow) ? 'trabaja' : 'libre';
}

const diaSchema = z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Cicla trabaja → libre → vacaciones → ausente para un día concreto, igual que `ciclarDia`. */
equipoRouter.post('/:id/dia', async (req, res) => {
  const parsed = diaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.dentista.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existente) return res.status(404).json({ error: 'Profesional no encontrado' });

  const calendario = { ...(existente.calendario as Record<string, string>) };
  const actual = calendario[parsed.data.fecha] || estadoBase(existente.dias, parsed.data.fecha);
  const siguiente = ORDEN_ESTADOS[(ORDEN_ESTADOS.indexOf(actual as (typeof ORDEN_ESTADOS)[number]) + 1) % ORDEN_ESTADOS.length];
  calendario[parsed.data.fecha] = siguiente;

  const dentista = await prisma.dentista.update({ where: { id: existente.id }, data: { calendario }, include: { gabinete: true } });
  res.json(dentista);
});
