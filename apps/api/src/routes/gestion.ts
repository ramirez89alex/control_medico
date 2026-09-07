import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireGestion, requireRol, usuarioDe } from '../middleware/auth.js';
import { hashPassword, signGestionToken, verifyPassword } from '../lib/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const gestionRouter = Router();
gestionRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

gestionRouter.get('/estado', async (req, res) => {
  const clinica = await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaDe(req) }, select: { gestionCodigoHash: true } });
  res.json({ configurado: !!clinica.gestionCodigoHash });
});

const verificarSchema = z.object({ codigo: z.string().min(1) });

gestionRouter.post('/verificar', async (req, res) => {
  const parsed = verificarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Código requerido' });

  const clinica = await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaDe(req) }, select: { gestionCodigoHash: true } });
  if (!clinica.gestionCodigoHash) {
    return res.status(409).json({ error: 'Todavía no hay código de administración. Pide a un admin que lo configure en Gestión.' });
  }

  const ok = await verifyPassword(clinica.gestionCodigoHash, parsed.data.codigo);
  if (!ok) return res.status(401).json({ error: 'Código incorrecto' });

  const token = signGestionToken({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req) });
  res.json({ token });
});

const codigoSchema = z.object({
  codigoActual: z.string().optional(),
  codigoNuevo: z.string().min(4, 'El código debe tener al menos 4 caracteres'),
});

gestionRouter.put('/codigo', requireRol('admin'), async (req, res) => {
  const parsed = codigoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const clinica = await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaDe(req) }, select: { gestionCodigoHash: true } });
  if (clinica.gestionCodigoHash) {
    if (!parsed.data.codigoActual) return res.status(400).json({ error: 'Introduce el código actual' });
    const ok = await verifyPassword(clinica.gestionCodigoHash, parsed.data.codigoActual);
    if (!ok) return res.status(401).json({ error: 'El código actual no es correcto' });
  }

  const hash = await hashPassword(parsed.data.codigoNuevo);
  await prisma.clinica.update({ where: { id: clinicaDe(req) }, data: { gestionCodigoHash: hash } });

  const token = signGestionToken({ clinicaId: clinicaDe(req), usuarioId: usuarioDe(req) });
  res.json({ ok: true, token });
});

/**
 * Vacía los datos clínicos/operativos de la clínica para empezar de cero (onboarding real
 * tras probar con datos de ejemplo). Mantiene deliberadamente: datos de la clínica (nombre,
 * NIF, logo, serie...), tarifario, gabinetes, equipo/dentistas, usuarios de acceso y el
 * código de Gestión — nada de eso hay que reconfigurar. Borrado físico (no lógico): el
 * objetivo es dejar la clínica realmente vacía, no ocultar los datos de ejemplo.
 */
const RESET_CONFIRMACION = 'BORRAR TODO';

gestionRouter.post('/reset-datos-clinicos', requireRol('admin'), requireGestion, async (req, res) => {
  const parsed = z.object({ confirmacion: z.string() }).safeParse(req.body);
  if (!parsed.success || parsed.data.confirmacion !== RESET_CONFIRMACION) {
    return res.status(400).json({ error: `Escribe exactamente "${RESET_CONFIRMACION}" para confirmar` });
  }

  const clinicaId = clinicaDe(req);

  await prisma.$transaction([
    prisma.materialConsumo.deleteMany({ where: { clinicaId } }),
    prisma.factura.deleteMany({ where: { clinicaId } }),
    prisma.cobro.deleteMany({ where: { clinicaId } }),
    prisma.historiaClinica.deleteMany({ where: { clinicaId } }),
    prisma.presupuesto.deleteMany({ where: { clinicaId } }), // cascada: borra sus líneas
    prisma.laboratorio.deleteMany({ where: { clinicaId } }),
    prisma.accesoPaciente.deleteMany({ where: { clinicaId } }),
    prisma.usuario.deleteMany({ where: { clinicaId, pacienteId: { not: null } } }),
    prisma.archivo.deleteMany({ where: { clinicaId, pacienteId: { not: null } } }),
    prisma.cita.deleteMany({ where: { clinicaId } }),
    prisma.paciente.deleteMany({ where: { clinicaId } }),
    prisma.contacto.deleteMany({ where: { clinicaId } }),
    prisma.campana.deleteMany({ where: { clinicaId } }),
    prisma.idea.deleteMany({ where: { clinicaId } }),
    prisma.movimientoBanco.deleteMany({ where: { clinicaId } }),
    prisma.pedido.deleteMany({ where: { clinicaId } }),
    prisma.stock.deleteMany({ where: { clinicaId } }),
    prisma.proveedor.deleteMany({ where: { clinicaId } }),
    prisma.material.deleteMany({ where: { clinicaId } }),
  ]);

  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'borrar', entidad: 'reset_datos_clinicos' });
  res.json({ ok: true });
});
