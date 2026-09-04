import { Router } from 'express';
import { saldoPaciente } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { pacienteDe, requireAuth, requirePaciente } from '../middleware/auth.js';
import { presignDescarga } from '../lib/s3.js';

export const portalRouter = Router();
portalRouter.use(requireAuth, requirePaciente);

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

portalRouter.get('/mi', async (req, res) => {
  const pacienteId = pacienteDe(req);

  const [paciente, citaHoy, proximaCita, historia, presupuestos, cobros] = await Promise.all([
    prisma.paciente.findUniqueOrThrow({ where: { id: pacienteId } }),
    prisma.cita.findFirst({
      where: { pacienteId, fecha: hoyISO(), deletedAt: null },
      include: { dentista: true },
      orderBy: { hora: 'asc' },
    }),
    prisma.cita.findFirst({
      where: { pacienteId, fecha: { gt: hoyISO() }, deletedAt: null },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    }),
    prisma.historiaClinica.findMany({ where: { pacienteId, deletedAt: null }, orderBy: { fecha: 'desc' }, take: 12 }),
    prisma.presupuesto.findMany({ where: { pacienteId, deletedAt: null }, include: { lineas: true }, orderBy: { fecha: 'desc' } }),
    prisma.cobro.findMany({ where: { pacienteId, deletedAt: null }, orderBy: { fecha: 'desc' }, take: 10 }),
  ]);

  const aceptados = presupuestos
    .filter((p) => p.estado === 'aceptado')
    .map((p) => ({
      lineas: p.lineas.map((l) => ({ id: l.id, cod: l.codigo, n: l.nombre, pieza: l.pieza, cant: l.cantidad, pvp: l.pvp, coste: l.coste })),
      dto: p.descuentoPct,
    }));
  const saldo = saldoPaciente(aceptados, cobros.map((c) => ({ importe: c.importe })));

  let firmaUrl: string | null = null;
  if (paciente.consentFirmaArchivoId) {
    const archivo = await prisma.archivo.findFirst({ where: { id: paciente.consentFirmaArchivoId, pacienteId: paciente.id } });
    if (archivo) firmaUrl = await presignDescarga(archivo.objectKey);
  }

  res.json({
    paciente: { id: paciente.id, nombre: paciente.nombre, apellidos: paciente.apellidos },
    citaHoy,
    proximaCita,
    historia,
    presupuestos,
    cobros,
    saldo,
    consentimiento: {
      datos: paciente.consentDatosAceptado,
      tratamiento: paciente.consentTratamientoAceptado,
      imagenes: paciente.consentImagenesAceptado,
      comercial: paciente.consentComercialAceptado,
      fecha: paciente.consentFecha,
      firmaUrl,
    },
  });
});

portalRouter.post('/checkin', async (req, res) => {
  const pacienteId = pacienteDe(req);
  const cita = await prisma.cita.findFirst({ where: { pacienteId, fecha: hoyISO(), deletedAt: null } });
  if (!cita) return res.status(404).json({ error: 'No tienes cita hoy' });

  const actualizada = await prisma.cita.update({ where: { id: cita.id }, data: { estado: 'llegado' } });
  res.json(actualizada);
});
