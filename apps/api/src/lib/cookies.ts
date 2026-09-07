// Nombres de cookie distintos para personal y paciente: en el mismo navegador (p. ej. el
// personal probando "Generar acceso" en una pestaña nueva) no deben pisarse entre sí.
export const REFRESH_COOKIE = 'powerdent_refresh';
export const REFRESH_COOKIE_PACIENTE = 'powerdent_refresh_paciente';

const enProduccion = process.env.NODE_ENV === 'production';

// En producción el frontend (Vercel) y la API (Railway) viven en dominios distintos: eso hace
// la petición de refresco "cross-site" para el navegador, que solo envía la cookie si es
// SameSite=None (y None exige Secure). En local, frontend y API comparten dominio (solo
// cambia el puerto) y "lax" ya funciona sin necesitar HTTPS.
export const refreshCookieOpts = {
  httpOnly: true,
  secure: enProduccion,
  sameSite: (enProduccion ? 'none' : 'lax') as 'none' | 'lax',
  path: '/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export const refreshCookieOptsPaciente = {
  ...refreshCookieOpts,
  path: '/auth/paciente',
};
