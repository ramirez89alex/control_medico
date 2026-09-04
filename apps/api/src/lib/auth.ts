import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import type { Rol } from '@powerdent/shared';

export interface AccessTokenPayload {
  /** Presente en sesiones de personal (rol admin|dentista|recepcion). */
  usuarioId?: string;
  /** Presente en sesiones de paciente (rol paciente), emitidas vía /auth/paciente. */
  pacienteId?: string;
  clinicaId: string;
  rol: Rol;
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: '15m' });
}

/** El refresh token lleva el mismo identificador (usuarioId o pacienteId) que el access token. */
export function signRefreshToken(sujeto: { usuarioId?: string; pacienteId?: string }): string {
  return jwt.sign(sujeto, env.jwtRefreshSecret, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { usuarioId?: string; pacienteId?: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { usuarioId?: string; pacienteId?: string };
}

export interface GestionTokenPayload {
  clinicaId: string;
  usuarioId: string;
}

/** Token de corta duración que certifica que el código de administración de Gestión fue verificado. */
export function signGestionToken(payload: GestionTokenPayload): string {
  return jwt.sign({ ...payload, gestion: true }, env.jwtAccessSecret, { expiresIn: '45m' });
}

export function verifyGestionToken(token: string): GestionTokenPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret) as GestionTokenPayload & { gestion?: boolean };
  if (!payload.gestion) throw new Error('Token de gestión inválido');
  return payload;
}
