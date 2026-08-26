import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import type { Rol } from '@powerdent/shared';

export interface AccessTokenPayload {
  usuarioId: string;
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

export function signRefreshToken(usuarioId: string): string {
  return jwt.sign({ usuarioId }, env.jwtRefreshSecret, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { usuarioId: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { usuarioId: string };
}
