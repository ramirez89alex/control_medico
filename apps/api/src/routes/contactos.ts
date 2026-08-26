import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const contactosRouter = Router();
contactosRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

/**
 * Combina los contactos manuales con "Equipo" (derivado de Dentista) y "Laboratorio"
 * (derivado de los nombres de laboratorio ya usados en trabajos de Laboratorio), igual que
 * `todosContactos()` en el HTML original. Los proveedores (módulo Compras) no existen
 * todavía, se añaden cuando se construya esa pantalla.
 */
contactosRouter.get('/', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const [contactos, dentistas, trabajosLab] = await Promise.all([
    prisma.contacto.findMany({ where: { clinicaId, deletedAt: null }, orderBy: { nombre: 'asc' } }),
    prisma.dentista.findMany({ where: { clinicaId, activo: true } }),
    prisma.laboratorio.findMany({ where: { clinicaId, deletedAt: null, nombreLab: { not: null } }, select: { nombreLab: true } }),
  ]);

  const equipo = dentistas.map((d) => ({
    id: `equipo-${d.id}`,
    nombre: d.nombre,
    tipo: 'equipo' as const,
    referencia: d.especialidad || d.rol,
    telefono: null,
    email: null,
    editable: false,
  }));

  const nombresLab = [...new Set(trabajosLab.map((t) => t.nombreLab).filter(Boolean))] as string[];
  const laboratorios = nombresLab
    .filter((n) => !contactos.some((c) => c.tipo === 'laboratorio' && c.nombre === n))
    .map((n) => ({
      id: `lab-${n}`,
      nombre: n,
      tipo: 'laboratorio' as const,
      referencia: `${trabajosLab.filter((t) => t.nombreLab === n).length} trabajos`,
      telefono: null,
      email: null,
      editable: false,
    }));

  res.json([...equipo, ...contactos.map((c) => ({ ...c, editable: true })), ...laboratorios]);
});

const contactoSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['proveedor', 'laboratorio', 'interno', 'otro']),
  referencia: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
});

contactosRouter.post('/', async (req, res) => {
  const parsed = contactoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const contacto = await prisma.contacto.create({ data: { ...parsed.data, email: parsed.data.email || null, clinicaId: clinicaDe(req) } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'crear', entidad: 'contacto', entidadId: contacto.id });
  res.status(201).json(contacto);
});

contactosRouter.put('/:id', async (req, res) => {
  const parsed = contactoSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existente = await prisma.contacto.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Contacto no encontrado' });

  const contacto = await prisma.contacto.update({ where: { id: existente.id }, data: { ...parsed.data, email: parsed.data.email || undefined } });
  res.json(contacto);
});

contactosRouter.delete('/:id', async (req, res) => {
  const existente = await prisma.contacto.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!existente) return res.status(404).json({ error: 'Contacto no encontrado' });

  await prisma.contacto.update({ where: { id: existente.id }, data: { deletedAt: new Date() } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req), accion: 'borrar', entidad: 'contacto', entidadId: existente.id });
  res.status(204).end();
});
