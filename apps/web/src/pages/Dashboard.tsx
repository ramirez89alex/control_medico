import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';

const TEAL = '#0EA5A0';
const AZUL = '#3B82C4';
const VERDE = '#2E9E5B';
const VIOLETA = '#7C6FE0';
const AMBAR = '#E5A00D';
const ROJO = '#C9433F';
const PALETA = [TEAL, AZUL, VERDE, VIOLETA, AMBAR, ROJO];

interface Serie6Meses {
  mes: string;
  etiqueta: string;
}

interface DashboardData {
  kpis: {
    pacientesTotal: number;
    pacientesNuevosMes: number;
    citasHoy: number;
    citasSemana: number;
    cobradoMes: number;
    pendienteTotal: number;
    pagadoTotal: number;
    tasaAceptacion: number;
    labEnCurso: number;
    labFueraPlazo: number;
  };
  ingresosPorMes: (Serie6Meses & { total: number })[];
  cobrosPorForma: { forma: string; etiqueta: string; importe: number }[];
  citasPorEstado: { estado: string; etiqueta: string; cantidad: number }[];
  presupuestosPorMes: (Serie6Meses & { emitidos: number; aceptados: number })[];
  pacientesNuevosPorMes: (Serie6Meses & { cantidad: number })[];
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function TooltipCard({ active, payload, label, formatear }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--grafito)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 12.5 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.8 }}>{p.name}</span>
          <b>{formatear ? formatear(p.value) : p.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const [datos, setDatos] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>('/dashboard')
      .then(setDatos)
      .catch(() => setError('No se pudo cargar el panel.'));
  }, []);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Panel de la clínica</h1>
          <p>Visión general de pacientes, agenda, presupuestos y cobros</p>
        </div>
      </div>

      {error && <p className="vacio">{error}</p>}
      {!error && !datos && <p className="vacio">Cargando…</p>}

      {datos && (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <div className="kpi">
              <span>Pacientes</span>
              <b>{datos.kpis.pacientesTotal}</b>
            </div>
            <div className="kpi">
              <span>Nuevos este mes</span>
              <b style={{ color: TEAL }}>+{datos.kpis.pacientesNuevosMes}</b>
            </div>
            <div className="kpi">
              <span>Citas hoy</span>
              <b>{datos.kpis.citasHoy}</b>
            </div>
            <div className="kpi">
              <span>Citas esta semana</span>
              <b>{datos.kpis.citasSemana}</b>
            </div>
            <div className="kpi">
              <span>Cobrado este mes</span>
              <b style={{ color: VERDE }}>{eur(datos.kpis.cobradoMes)}</b>
            </div>
            <div className="kpi">
              <span>Pendiente de cobro</span>
              <b style={{ color: datos.kpis.pendienteTotal > 0.5 ? 'var(--rojo)' : 'inherit' }}>{eur(datos.kpis.pendienteTotal)}</b>
            </div>
            <div className="kpi">
              <span>Presupuestos aceptados</span>
              <b style={{ color: VIOLETA }}>{datos.kpis.tasaAceptacion}%</b>
            </div>
            <div className="kpi">
              <span>Laboratorio fuera de plazo</span>
              <b style={{ color: datos.kpis.labFueraPlazo > 0 ? 'var(--rojo)' : 'inherit' }}>{datos.kpis.labFueraPlazo}</b>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Ingresos · últimos 6 meses</h3>
            <hr />
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={datos.ingresosPorMes} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ingresosFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={TEAL} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 12.5, fill: 'var(--tenue)' }} axisLine={{ stroke: 'var(--linea)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--tenue)' }} axisLine={false} tickLine={false} tickFormatter={(v) => eur(v)} width={72} />
                <Tooltip content={<TooltipCard formatear={eur} />} />
                <Area type="monotone" dataKey="total" name="Cobrado" stroke={TEAL} strokeWidth={2.5} fill="url(#ingresosFill)" isAnimationActive={false}>
                  <LabelList dataKey="total" position="top" formatter={(v: unknown) => (typeof v === 'number' && v > 0 ? eur(v) : '')} style={{ fontSize: 11, fill: 'var(--tenue)' }} />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid g2" style={{ marginBottom: 14 }}>
            <div className="card">
              <h3>Presupuestos · emitidos vs. aceptados</h3>
              <hr />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={datos.presupuestosPorMes} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fontSize: 12.5, fill: 'var(--tenue)' }} axisLine={{ stroke: 'var(--linea)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--tenue)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<TooltipCard />} />
                  <Legend wrapperStyle={{ fontSize: 12.5 }} />
                  <Bar dataKey="emitidos" name="Emitidos" fill={AZUL} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="emitidos" position="top" style={{ fontSize: 11, fill: 'var(--tenue)' }} />
                  </Bar>
                  <Bar dataKey="aceptados" name="Aceptados" fill={VERDE} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="aceptados" position="top" style={{ fontSize: 11, fill: 'var(--tenue)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3>Pacientes nuevos por mes</h3>
              <hr />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={datos.pacientesNuevosPorMes} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--linea)" vertical={false} />
                  <XAxis dataKey="etiqueta" tick={{ fontSize: 12.5, fill: 'var(--tenue)' }} axisLine={{ stroke: 'var(--linea)' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--tenue)' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<TooltipCard />} />
                  <Bar dataKey="cantidad" name="Pacientes" fill={VIOLETA} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="cantidad" position="top" style={{ fontSize: 11, fill: 'var(--tenue)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid g3" style={{ marginBottom: 14 }}>
            <div className="card">
              <h3>Cobrado vs. pendiente</h3>
              <hr />
              {datos.kpis.pagadoTotal + datos.kpis.pendienteTotal <= 0.5 ? (
                <p className="vacio">Sin presupuestos aceptados todavía.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={[
                        { nombre: 'Cobrado', valor: datos.kpis.pagadoTotal },
                        { nombre: 'Pendiente', valor: Math.max(0, datos.kpis.pendienteTotal) },
                      ]}
                      dataKey="valor"
                      nameKey="nombre"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      label={({ value }: { value: number }) => eur(value)}
                      labelLine={false}
                    >
                      <Cell fill={VERDE} />
                      <Cell fill={ROJO} />
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12.5 }} />
                    <Tooltip content={<TooltipCard formatear={eur} />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h3>Citas de este mes por estado</h3>
              <hr />
              {datos.citasPorEstado.length === 0 ? (
                <p className="vacio">Sin citas este mes.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={datos.citasPorEstado}
                      dataKey="cantidad"
                      nameKey="etiqueta"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      label={({ value }: { value: number }) => String(value)}
                      labelLine={false}
                    >
                      {datos.citasPorEstado.map((_, i) => (
                        <Cell key={i} fill={PALETA[i % PALETA.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12.5 }} />
                    <Tooltip content={<TooltipCard />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <h3>Cobros de este mes por forma de pago</h3>
              <hr />
              {datos.cobrosPorForma.length === 0 ? (
                <p className="vacio">Sin cobros este mes.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={datos.cobrosPorForma}
                      dataKey="importe"
                      nameKey="etiqueta"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      label={({ value }: { value: number }) => eur(value)}
                      labelLine={false}
                    >
                      {datos.cobrosPorForma.map((_, i) => (
                        <Cell key={i} fill={PALETA[i % PALETA.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12.5 }} />
                    <Tooltip content={<TooltipCard formatear={eur} />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
