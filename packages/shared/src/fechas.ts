/**
 * `new Date().toISOString().slice(0, 10)` da la fecha en UTC, no la fecha local —
 * en zonas horarias con offset negativo (América) puede devolver "mañana" durante
 * varias horas cada noche. Estas usan los getters/setters locales de `Date` en su lugar.
 */
export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sumarDiasISO(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
