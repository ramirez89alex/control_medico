import type { NextFunction, Request, Response } from 'express';
import type { Rol } from '@powerdent/shared';
import { verifyAccessToken } from '../lib/auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: { usuarioId?: string; pacienteId?: string; clinicaId: string; rol: Rol };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = verifyAccessToken(token);
    req.usuario = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o caducado' });
  }
}

export function requireRol(...roles: Rol[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.usuario.rol)) return res.status(403).json({ error: 'Sin permiso' });
    next();
  };
}

/** Exige una sesión de paciente (emitida por /auth/paciente/entrar), no de personal. */
export function requirePaciente(req: Request, res: Response, next: NextFunction) {
  if (!req.usuario || req.usuario.rol !== 'paciente' || !req.usuario.pacienteId) {
    return res.status(401).json({ error: 'No autenticado como paciente' });
  }
  next();
}

/** Helper para que cada query Prisma quede siempre acotada a la clínica del usuario autenticado. */
export function clinicaDe(req: Request): string {
  if (!req.usuario) throw new Error('requireAuth debe ejecutarse antes de clinicaDe()');
  return req.usuario.clinicaId;
}

/** Helper para acotar cada query Prisma al propio paciente autenticado. */
export function pacienteDe(req: Request): string {
  if (!req.usuario?.pacienteId) throw new Error('requirePaciente debe ejecutarse antes de pacienteDe()');
  return req.usuario.pacienteId;
}

/** Id del usuario de personal autenticado (para auditoría), nunca presente en sesiones de paciente. */
export function usuarioDe(req: Request): string {
  if (!req.usuario?.usuarioId) throw new Error('usuarioDe() solo aplica a sesiones de personal');
  return req.usuario.usuarioId;
}
