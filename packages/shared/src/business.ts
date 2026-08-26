import type {
  CitaSlot,
  FinanciacionResultado,
  HorarioSemana,
  LineaPresupuesto,
  SaldoPaciente,
} from './types.js';

/**
 * Amortización francesa (cuota constante). Portado de `financiacion()` en
 * PowerDent_Clinica.html (~línea 926-932).
 */
export function financiacion(importe: number, n: number, tin: number): FinanciacionResultado {
  const i = tin / 100 / 12;
  const cuota = i ? (importe * i) / (1 - Math.pow(1 + i, -n)) : importe / n;
  const total = cuota * n;
  return {
    n,
    tin,
    cuota,
    total,
    intereses: total - importe,
    tae: (Math.pow(1 + i, 12) - 1) * 100,
  };
}

/** Total de un presupuesto con descuento aplicado. Portado de `total()`. */
export function totalPresupuesto(lineas: LineaPresupuesto[], dtoPct: number): number {
  const bruto = lineas.reduce((a, l) => a + (Number(l.pvp) || 0) * (Number(l.cant) || 1), 0);
  return bruto * (1 - (Number(dtoPct) || 0) / 100);
}

/** Coste total (sin margen) de un presupuesto. Portado de `costeTotal()`. */
export function costeTotalPresupuesto(lineas: LineaPresupuesto[]): number {
  return lineas.reduce((a, l) => a + (Number(l.coste) || 0) * (Number(l.cant) || 1), 0);
}

interface PresupuestoAceptado {
  lineas: LineaPresupuesto[];
  dto: number;
}

interface Cobro {
  importe: number;
}

/**
 * Pendiente de cobro de un paciente = presupuestos aceptados − cobros.
 * Portado de `pendientePaciente()` (~línea 919-923), pero recibe los datos
 * ya filtrados por paciente en vez de leer el DB global.
 */
export function pendientePaciente(presupuestosAceptados: PresupuestoAceptado[], cobros: Cobro[]): number {
  const facturado = presupuestosAceptados.reduce((a, pr) => a + totalPresupuesto(pr.lineas, pr.dto), 0);
  const pagado = cobros.reduce((a, c) => a + (Number(c.importe) || 0), 0);
  return facturado - pagado;
}

/**
 * Balance completo del paciente. Portado de `saldoPaciente()` (~línea 1109-1117).
 */
export function saldoPaciente(presupuestosAceptados: PresupuestoAceptado[], cobros: Cobro[]): SaldoPaciente {
  const facturado = presupuestosAceptados.reduce((a, pr) => a + totalPresupuesto(pr.lineas, pr.dto), 0);
  const costes = presupuestosAceptados.reduce((a, pr) => a + costeTotalPresupuesto(pr.lineas), 0);
  const pagos = cobros.reduce((a, c) => a + (Number(c.importe) || 0), 0);
  return {
    facturado,
    pagos,
    cuenta: facturado - pagos,
    pendiente: Math.max(0, facturado - pagos),
    margen: facturado - costes,
    nCob: cobros.length,
  };
}

/**
 * Huecos libres de 30' en una fecha, cruzando horario de la clínica,
 * gabinetes ocupados y (opcionalmente) un dentista concreto.
 * Portado de `huecos()` (~línea 2586-2599).
 */
export function huecosLibres(
  fecha: string,
  diaSemana: number, // 0=domingo..6=sábado
  horario: HorarioSemana,
  citasDelDia: CitaSlot[],
  gabineteIds: string[],
  dentistaId?: string | null,
): string[] {
  const hor = horario[diaSemana as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  if (!hor) return [];
  const [ah, am] = hor.abre.split(':').map(Number);
  const [ch, cm] = hor.cierra.split(':').map(Number);
  const inicio = ah * 60 + am;
  const fin = ch * 60 + cm;
  const activas = citasDelDia.filter((c) => c.estado !== 'cancelada');
  const out: string[] = [];
  for (let m = inicio; m < fin; m += 30) {
    const ocupadas = activas.filter((c) => {
      const [hh, mm] = c.hora.split(':').map(Number);
      const i = hh * 60 + mm;
      return m >= i && m < i + (Number(c.dur) || 30);
    });
    const gabineteLibre = gabineteIds.some((g) => !ocupadas.find((o) => o.gabineteId === g));
    const dentistaLibre = !dentistaId || !ocupadas.find((o) => o.dentistaId === dentistaId);
    if (gabineteLibre && dentistaLibre) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
  }
  return out;
}
