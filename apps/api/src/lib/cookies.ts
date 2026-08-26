// Nombres de cookie distintos para personal y paciente: en el mismo navegador (p. ej. el
// personal probando "Generar acceso" en una pestaña nueva) no deben pisarse entre sí.
export const REFRESH_COOKIE = 'powerdent_refresh';
export const REFRESH_COOKIE_PACIENTE = 'powerdent_refresh_paciente';

export const refreshCookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export const refreshCookieOptsPaciente = {
  ...refreshCookieOpts,
  path: '/auth/paciente',
};
