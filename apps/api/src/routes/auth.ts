import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyPassword, verifyRefreshToken } from '../lib/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { REFRESH_COOKIE, refreshCookieOpts as cookieOpts } from '../lib/cookies.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email o contraseña inválidos' });
  const { email, password } = parsed.data;

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const ok = await verifyPassword(usuario.passwordHash, password);
  if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const accessToken = signAccessToken({ usuarioId: usuario.id, clinicaId: usuario.clinicaId, rol: usuario.rol });
  const refreshToken = signRefreshToken({ usuarioId: usuario.id });
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
  registrarAuditoria({ clinicaId: usuario.clinicaId, usuarioId: usuario.id, accion: 'login', entidad: 'usuario', entidadId: usuario.id });

  res.json({
    accessToken,
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, clinicaId: usuario.clinicaId },
  });
});

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: 'Sin sesión' });
  try {
    const { usuarioId } = verifyRefreshToken(token);
    if (!usuarioId) return res.status(401).json({ error: 'Sin sesión' });
    const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Sin sesión' });

    const accessToken = signAccessToken({ usuarioId: usuario.id, clinicaId: usuario.clinicaId, rol: usuario.rol });
    const refreshToken = signRefreshToken({ usuarioId: usuario.id });
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    res.json({
      accessToken,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, clinicaId: usuario.clinicaId },
    });
  } catch {
    res.status(401).json({ error: 'Sesión caducada' });
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  res.status(204).end();
});
