const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// El access token dura 15m en el servidor (ver signAccessToken en apps/api/src/lib/auth.ts);
// lo renovamos en segundo plano a los 13m para que el usuario casi nunca vea un 401 por
// caducidad durante el uso normal.
const RENOVAR_A_LOS_MS = 13 * 60 * 1000;

let accessToken: string | null = null;
let renovacionProgramada: ReturnType<typeof setTimeout> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (renovacionProgramada) {
    clearTimeout(renovacionProgramada);
    renovacionProgramada = null;
  }
  if (token) {
    renovacionProgramada = setTimeout(() => {
      refrescarSesion();
    }, RENOVAR_A_LOS_MS);
  }
}

let gestionToken: string | null = null;

export function setGestionToken(token: string | null) {
  gestionToken = token;
}

export function getGestionToken() {
  return gestionToken;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface DatosSesion {
  accessToken: string;
  usuario: { id: string; nombre: string; email: string; rol: string; clinicaId: string };
}

let refrescoEnCurso: Promise<DatosSesion | null> | null = null;

/**
 * Varias peticiones pueden recibir un 401 a la vez (o el arranque de sesión coincidir con la
 * primera carga de una página) y llamar aquí simultáneamente; comparten la misma promesa en
 * vez de disparar N refrescos a la vez contra /auth/refresh.
 */
function refrescarSesion(): Promise<DatosSesion | null> {
  if (!refrescoEnCurso) {
    refrescoEnCurso = (async () => {
      const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      const data: DatosSesion = await res.json();
      setAccessToken(data.accessToken);
      return data;
    })().finally(() => {
      refrescoEnCurso = null;
    });
  }
  return refrescoEnCurso;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, reintentar = true): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (gestionToken) headers.set('X-Gestion-Token', gestionToken);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && reintentar) {
    const refrescado = await refrescarSesion();
    if (refrescado) return apiFetch<T>(path, options, false);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, typeof body.error === 'string' ? body.error : 'Error de la API');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export { refrescarSesion, API_URL };
export type { DatosSesion };
