import { API_URL, ApiError } from './api';

// Mismo motivo que en lib/api.ts: el access token dura 15m, lo renovamos en segundo plano
// a los 13m para que el paciente casi nunca vea un 401 por caducidad durante el uso normal.
const RENOVAR_A_LOS_MS = 13 * 60 * 1000;

let pacienteAccessToken: string | null = null;
let renovacionProgramada: ReturnType<typeof setTimeout> | null = null;

export function setPacienteAccessToken(token: string | null) {
  pacienteAccessToken = token;
  if (renovacionProgramada) {
    clearTimeout(renovacionProgramada);
    renovacionProgramada = null;
  }
  if (token) {
    renovacionProgramada = setTimeout(() => {
      refrescarSesionPaciente();
    }, RENOVAR_A_LOS_MS);
  }
}

interface DatosSesionPaciente {
  accessToken: string;
  paciente: { id: string; nombre: string; apellidos: string };
}

export async function entrarConToken(token: string): Promise<DatosSesionPaciente> {
  const res = await fetch(`${API_URL}/auth/paciente/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Enlace inválido' }));
    throw new ApiError(res.status, body.error || 'Enlace inválido');
  }
  const data: DatosSesionPaciente = await res.json();
  setPacienteAccessToken(data.accessToken);
  return data;
}

let refrescoEnCurso: Promise<DatosSesionPaciente | null> | null = null;

/** Ver el comentario equivalente en lib/api.ts: comparte una sola promesa entre 401 simultáneos. */
export function refrescarSesionPaciente(): Promise<DatosSesionPaciente | null> {
  if (!refrescoEnCurso) {
    refrescoEnCurso = (async () => {
      const res = await fetch(`${API_URL}/auth/paciente/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const data: DatosSesionPaciente = await res.json();
      setPacienteAccessToken(data.accessToken);
      return data;
    })().finally(() => {
      refrescoEnCurso = null;
    });
  }
  return refrescoEnCurso;
}

export async function apiPacienteFetch<T>(path: string, options: RequestInit = {}, reintentar = true): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (pacienteAccessToken) headers.set('Authorization', `Bearer ${pacienteAccessToken}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && reintentar) {
    const refrescado = await refrescarSesionPaciente();
    if (refrescado) return apiPacienteFetch<T>(path, options, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, typeof body.error === 'string' ? body.error : 'Error de la API');
  }
  return res.json();
}

export const apiPaciente = {
  get: <T>(path: string) => apiPacienteFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiPacienteFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
};

export async function salirPaciente(): Promise<void> {
  await fetch(`${API_URL}/auth/paciente/logout`, { method: 'POST', credentials: 'include' });
  setPacienteAccessToken(null);
}
