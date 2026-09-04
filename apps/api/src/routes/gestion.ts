import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { hashPassword, signGestionToken, verifyPassword } from '../lib/auth.js';

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
