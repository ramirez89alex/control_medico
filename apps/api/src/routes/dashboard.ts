import { Router } from 'express';
import { pendientePaciente } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireGestion, requireRol } from '../middleware/auth.js';
import { hoyISO } from '@powerdent/shared';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'), requireGestion);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function ultimosMeses(n: number) {
  const hoy = new Date();
  const meses: { clave: string; etiqueta: string; inicio: Date; fin: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    meses.push({
      clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: MESES[d.getMonth()],
      inicio,
      fin,
    });
  }
  return meses;
}

dashboardRouter.get('/', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const hoy = new Date();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const finMesActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const inicioMesActualISO = `${inicioMesActual.getFullYear()}-${String(inicioMesActual.getMonth() + 1).padStart(2, '0')}-01`;
  const finMesActualISO = `${finMesActual.getFullYear()}-${String(finMesActual.getMonth() + 1).padStart(2, '0')}-01`;
  const meses = ultimosMeses(6);
  const inicioVentana = meses[0].inicio;

  const diaSemana = (hoy.getDay() + 6) % 7; // lunes=0
  const inicioSemana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - diaSemana);
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(finSemana.getDate() + 7);
  const finSemanaISO = `${finSemana.getFullYear()}-${String(finSemana.getMonth() + 1).padStart(2, '0')}-${String(finSemana.getDate()).padStart(2, '0')}`;
  const inicioSemanaISO = `${inicioSemana.getFullYear()}-${String(inicioSemana.getMonth() + 1).padStart(2, '0')}-${String(inicioSemana.getDate()).padStart(2, '0')}`;

  const [
    pacientesTotal,
    pacientesNuevosMes,
    pacientesVentana,
    citasHoy,
    citasSemana,
    citasMes,
    cobrosVentana,
    presupuestosVentana,
    presupuestosAceptadosTodos,
    cobrosTodos,
    pacientesTodos,
    labs,
  ] = await Promise.all([
    prisma.paciente.count({ where: { clinicaId, deletedAt: null } }),
    prisma.paciente.count({ where: { clinicaId, deletedAt: null, createdAt: { gte: inicioMesActual } } }),
    prisma.paciente.findMany({ where: { clinicaId, deletedAt: null, createdAt: { gte: inicioVentana } }, select: { createdAt: true } }),
    prisma.cita.count({ where: { clinicaId, deletedAt: null, fecha: hoyISO() } }),
    prisma.cita.count({ where: { clinicaId, deletedAt: null, fecha: { gte: inicioSemanaISO, lt: finSemanaISO } } }),
    prisma.cita.findMany({ where: { clinicaId, deletedAt: null, fecha: { gte: inicioMesActualISO, lt: finMesActualISO } }, select: { estado: true } }),
    prisma.cobro.findMany({ where: { clinicaId, deletedAt: null, fecha: { gte: inicioVentana } }, select: { importe: true, fecha: true, forma: true } }),
    prisma.presupuesto.findMany({ where: { clinicaId, deletedAt: null, fecha: { gte: inicioVentana } }, select: { estado: true, fecha: true } }),
    prisma.presupuesto.findMany({ where: { clinicaId, deletedAt: null, estado: 'aceptado' }, include: { lineas: true } }),
    prisma.cobro.findMany({ where: { clinicaId, deletedAt: null }, select: { importe: true, pacienteId: true } }),
    prisma.paciente.findMany({ where: { clinicaId, deletedAt: null }, select: { id: true } }),
    prisma.laboratorio.findMany({ where: { clinicaId, deletedAt: null, estado: { not: 'entregado' } }, select: { fechaPrevista: true } }),
  ]);

  const ingresosPorMes = meses.map((m) => ({
    mes: m.clave,
    etiqueta: m.etiqueta,
    total: cobrosVentana.filter((c) => c.fecha >= m.inicio && c.fecha < m.fin).reduce((s, c) => s + c.importe, 0),
  }));
  const cobradoMes = ingresosPorMes[ingresosPorMes.length - 1]?.total ?? 0;

  const cobrosMesActual = cobrosVentana.filter((c) => c.fecha >= inicioMesActual);
  const formasPorEtiqueta: Record<string, string> = {
    tarjeta: 'Tarjeta',
    efectivo: 'Efectivo',
    bizum: 'Bizum',
    transferencia: 'Transferencia',
    enlace_pago: 'Enlace de pago',
    financiacion: 'Financiación',
    seguro: 'Seguro',
  };
  const cobrosPorForma = Object.entries(formasPorEtiqueta)
    .map(([forma, etiqueta]) => ({
      forma,
      etiqueta,
      importe: cobrosMesActual.filter((c) => c.forma === forma).reduce((s, c) => s + c.importe, 0),
    }))
    .filter((f) => f.importe > 0);

  const estadosCita = ['programada', 'llegado', 'silla', 'hecha', 'cancelada'] as const;
  const estadosEtiqueta: Record<string, string> = {
    programada: 'Programada',
    llegado: 'Llegado',
    silla: 'En silla',
    hecha: 'Hecha',
    cancelada: 'Cancelada',
  };
  const citasPorEstado = estadosCita
    .map((estado) => ({ estado, etiqueta: estadosEtiqueta[estado], cantidad: citasMes.filter((c) => c.estado === estado).length }))
    .filter((e) => e.cantidad > 0);

  const presupuestosPorMes = meses.map((m) => {
    const delMes = presupuestosVentana.filter((p) => p.fecha >= m.inicio && p.fecha < m.fin);
    return {
      mes: m.clave,
      etiqueta: m.etiqueta,
      emitidos: delMes.length,
      aceptados: delMes.filter((p) => p.estado === 'aceptado').length,
    };
  });

  const decididos = presupuestosVentana.filter((p) => p.estado === 'aceptado' || p.estado === 'rechazado');
  const tasaAceptacion = decididos.length ? Math.round((decididos.filter((p) => p.estado === 'aceptado').length / decididos.length) * 100) : 0;

  const pacientesNuevosPorMes = meses.map((m) => ({
    mes: m.clave,
    etiqueta: m.etiqueta,
    cantidad: pacientesVentana.filter((p) => p.createdAt >= m.inicio && p.createdAt < m.fin).length,
  }));

  const cobrosPorPaciente = new Map<string, { importe: number }[]>();
  for (const c of cobrosTodos) {
    if (!cobrosPorPaciente.has(c.pacienteId)) cobrosPorPaciente.set(c.pacienteId, []);
    cobrosPorPaciente.get(c.pacienteId)!.push({ importe: c.importe });
  }
  const presupuestosPorPaciente = new Map<string, { lineas: { id: string; cod: string; n: string; pieza: string | null; cant: number; pvp: number; coste: number }[]; dto: number }[]>();
  for (const pr of presupuestosAceptadosTodos) {
    if (!presupuestosPorPaciente.has(pr.pacienteId)) presupuestosPorPaciente.set(pr.pacienteId, []);
    presupuestosPorPaciente.get(pr.pacienteId)!.push({
      lineas: pr.lineas.map((l) => ({ id: l.id, cod: l.codigo, n: l.nombre, pieza: l.pieza, cant: l.cantidad, pvp: l.pvp, coste: l.coste })),
      dto: pr.descuentoPct,
    });
  }
  const pendienteTotal = pacientesTodos.reduce(
    (s, p) => s + pendientePaciente(presupuestosPorPaciente.get(p.id) ?? [], cobrosPorPaciente.get(p.id) ?? []),
    0,
  );

  const labEnCurso = labs.length;
  const labFueraPlazo = labs.filter((l) => l.fechaPrevista < hoy).length;
  const pagadoTotal = cobrosTodos.reduce((s, c) => s + c.importe, 0);

  res.json({
    kpis: {
      pacientesTotal,
      pacientesNuevosMes,
      citasHoy,
      citasSemana,
      cobradoMes,
      pendienteTotal,
      pagadoTotal,
      tasaAceptacion,
      labEnCurso,
      labFueraPlazo,
    },
    ingresosPorMes,
    cobrosPorForma,
    citasPorEstado,
    presupuestosPorMes,
    pacientesNuevosPorMes,
  });
});
