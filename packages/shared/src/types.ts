export type Rol = 'admin' | 'dentista' | 'recepcion' | 'paciente';

export type EstadoCita = 'programada' | 'llegado' | 'silla' | 'hecha' | 'cancelada';

export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aceptado' | 'rechazado';

export interface LineaPresupuesto {
  id: string;
  cod: string;
  n: string;
  pieza?: string | null;
  cant: number;
  pvp: number;
  coste: number;
}

export interface HorarioDia {
  abre: string; // 'HH:MM'
  cierra: string; // 'HH:MM'
}

/** índice 0=domingo..6=sábado, como Date.getDay() */
export type HorarioSemana = Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, HorarioDia | null>>;

export interface CitaSlot {
  id: string;
  fecha: string; // 'YYYY-MM-DD'
  hora: string; // 'HH:MM'
  dur: number; // minutos
  gabineteId: string;
  dentistaId?: string | null;
  estado: EstadoCita;
}

export interface FinanciacionResultado {
  n: number;
  tin: number;
  cuota: number;
  total: number;
  intereses: number;
  tae: number;
}

export interface SaldoPaciente {
  facturado: number;
  pagos: number;
  cuenta: number;
  pendiente: number;
  margen: number;
  nCob: number;
}
