import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/auth.js';
import { REFRESH_COOKIE_PACIENTE, refreshCookieOptsPaciente } from '../lib/cookies.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { env } from '../env.js';

export const authPacienteRouter = Router();

const TOKEN_BYTES = 32;
const EXPIRA_MIN = 15;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const EXPIRA_HORAS_MAX = 240; // 10 días — tope para enlaces incluidos en recordatorios con antelación

const generarSchema = z.object({
  pacienteId: z.string().uuid(),
  // Para el enlace que se entrega en mano (Portal, ficha del paciente, asistente de voz) los
  // 15 minutos de siempre bastan. Los recordatorios de cita se mandan con días de antelación,
  // así que ahí se pide una validez más larga explícitamente (acotada por EXPIRA_HORAS_MAX).
  expiraHoras: z.number().positive().max(EXPIRA_HORAS_MAX).optional(),
});

/**
 * El personal genera un enlace de un solo uso para que el paciente entre a su portal,
 * sustituyendo al PIN de 6 cifras fijo del HTML original (Fase 1: "Autenticación y control
 * de acceso"). El token en claro solo aparece en esta respuesta; en BD solo se guarda su hash.
 */
authPacienteRouter.post('/generar', requireAuth, requireRol('admin', 'dentista', 'recepcion'), async (req, res) => {
  const parsed = generarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const clinicaId = clinicaDe(req);
  const paciente = await prisma.paciente.findFirst({ where: { id: parsed.data.pacienteId, clinicaId, deletedAt: null } });
  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

  const expiraMinutos = parsed.data.expiraHoras ? Math.round(parsed.data.expiraHoras * 60) : EXPIRA_MIN;
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  await prisma.accesoPaciente.create({
    data: {
      clinicaId,
      pacienteId: paciente.id,
      tokenHash: hashToken(token),
      expiraEn: new Date(Date.now() + expiraMinutos * 60 * 1000),
      creadoPorUsuarioId: usuarioDe(req),
    },
  });

  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'generar_acceso', entidad: 'paciente', entidadId: paciente.id });
  res.status(201).json({ url: `${env.frontendUrl}/acceso/${token}`, expiraMinutos });
});

const entrarSchema = z.object({ token: z.string().min(20) });

authPacienteRouter.post('/entrar', async (req, res) => {
  const parsed = entrarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enlace inválido' });

  const acceso = await prisma.accesoPaciente.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, include: { paciente: true } });
  if (!acceso || acceso.usadoEn || acceso.expiraEn < new Date() || acceso.paciente.deletedAt) {
    return res.status(401).json({ error: 'Este enlace ya no es válido. Pide uno nuevo en recepción.' });
  }

  // Update condicionado a usadoEn=null: si dos peticiones llegan a la vez con el mismo
  // token (doble clic, reintento), solo una gana la carrera y consume el enlace.
  const consumido = await prisma.accesoPaciente.updateMany({
    where: { id: acceso.id, usadoEn: null },
    data: { usadoEn: new Date() },
  });
  if (consumido.count === 0) {
    return res.status(401).json({ error: 'Este enlace ya no es válido. Pide uno nuevo en recepción.' });
  }

  const accessToken = signAccessToken({ pacienteId: acceso.pacienteId, clinicaId: acceso.clinicaId, rol: 'paciente' });
  const refreshToken = signRefreshToken({ pacienteId: acceso.pacienteId });
  res.cookie(REFRESH_COOKIE_PACIENTE, refreshToken, refreshCookieOptsPaciente);
  registrarAuditoria({ clinicaId: acceso.clinicaId, usuarioId: acceso.pacienteId, accion: 'login_paciente', entidad: 'paciente', entidadId: acceso.pacienteId });

  res.json({ accessToken, paciente: { id: acceso.paciente.id, nombre: acceso.paciente.nombre, apellidos: acceso.paciente.apellidos } });
});

authPacienteRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_PACIENTE];
  if (!token) return res.status(401).json({ error: 'Sin sesión' });
  try {
    const { pacienteId } = verifyRefreshToken(token);
    if (!pacienteId) return res.status(401).json({ error: 'Sin sesión' });
    const paciente = await prisma.paciente.findFirst({ where: { id: pacienteId, deletedAt: null } });
    if (!paciente) return res.status(401).json({ error: 'Sin sesión' });

    const accessToken = signAccessToken({ pacienteId: paciente.id, clinicaId: paciente.clinicaId, rol: 'paciente' });
    const refreshToken = signRefreshToken({ pacienteId: paciente.id });
    res.cookie(REFRESH_COOKIE_PACIENTE, refreshToken, refreshCookieOptsPaciente);
    res.json({ accessToken, paciente: { id: paciente.id, nombre: paciente.nombre, apellidos: paciente.apellidos } });
  } catch {
    res.status(401).json({ error: 'Sesión caducada' });
  }
});

authPacienteRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE_PACIENTE, { path: '/auth/paciente' });
  res.status(204).end();
});
