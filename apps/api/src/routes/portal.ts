import { Router } from 'express';
import { saldoPaciente, pendientePaciente } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, pacienteDe, requireAuth, requirePaciente } from '../middleware/auth.js';
import { presignDescarga } from '../lib/s3.js';
import { stripe } from '../lib/stripe.js';
import { env } from '../env.js';
import { nuevoCodigoCorto } from './pagos.js';

export const portalRouter = Router();
portalRouter.use(requireAuth, requirePaciente);

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

portalRouter.get('/mi', async (req, res) => {
  const pacienteId = pacienteDe(req);

  const [paciente, clinica, citaHoy, proximaCita, historia, presupuestos, cobros] = await Promise.all([
    prisma.paciente.findUniqueOrThrow({ where: { id: pacienteId } }),
    prisma.clinica.findUniqueOrThrow({
      where: { id: clinicaDe(req) },
      select: { nombre: true, nif: true, direccion: true, cp: true, ciudad: true, email: true, logoArchivoId: true },
    }),
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

  let logoUrl: string | null = null;
  if (clinica.logoArchivoId) {
    const archivo = await prisma.archivo.findFirst({ where: { id: clinica.logoArchivoId, clinicaId: clinicaDe(req) } });
    if (archivo) logoUrl = await presignDescarga(archivo.objectKey);
  }

  res.json({
    paciente: {
      id: paciente.id,
      nombre: paciente.nombre,
      apellidos: paciente.apellidos,
      dni: paciente.dni,
      nacimiento: paciente.nacimiento,
      telefono: paciente.telefono,
      email: paciente.email,
      direccion: paciente.direccion,
      alergias: paciente.alergias,
      medicacion: paciente.medicacion,
      antecedentes: paciente.antecedentes,
    },
    clinica: { ...clinica, logoUrl },
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

/**
 * El propio paciente paga su pendiente desde el portal, sin pasar por recepción. El importe
 * nunca lo manda el cliente — se recalcula aquí igual que en /portal/mi, para que no se pueda
 * manipular desde el navegador.
 */
portalRouter.post('/pagar', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'El pago online no está disponible ahora mismo. Pide en recepción que te generen el cobro.' });
  }
  const pacienteId = pacienteDe(req);
  const clinicaId = clinicaDe(req);

  const [paciente, presupuestosAceptados, cobros] = await Promise.all([
    prisma.paciente.findUniqueOrThrow({ where: { id: pacienteId } }),
    prisma.presupuesto.findMany({ where: { pacienteId, deletedAt: null, estado: 'aceptado' }, include: { lineas: true } }),
    prisma.cobro.findMany({ where: { pacienteId, deletedAt: null } }),
  ]);

  const aceptados = presupuestosAceptados.map((p) => ({
    lineas: p.lineas.map((l) => ({ id: l.id, cod: l.codigo, n: l.nombre, pieza: l.pieza, cant: l.cantidad, pvp: l.pvp, coste: l.coste })),
    dto: p.descuentoPct,
  }));
  const pendiente = pendientePaciente(aceptados, cobros.map((c) => ({ importe: c.importe })));
  if (pendiente <= 0.5) return res.status(400).json({ error: 'No tienes ningún importe pendiente.' });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: { currency: 'eur', product_data: { name: 'Pago de tratamiento dental' }, unit_amount: Math.round(pendiente * 100) },
        quantity: 1,
      },
    ],
    success_url: `${env.frontendUrl}/pago-completado?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.frontendUrl}/mi`,
    customer_email: paciente.email || undefined,
  });

  await prisma.enlacePago.create({
    data: {
      clinicaId,
      pacienteId,
      importe: pendiente,
      concepto: 'Pago desde el portal del paciente',
      stripeSessionId: session.id,
      stripeUrl: session.url || '',
      codigoCorto: nuevoCodigoCorto(),
      origen: 'paciente',
    },
  });

  res.status(201).json({ url: session.url });
});

portalRouter.post('/checkin', async (req, res) => {
  const pacienteId = pacienteDe(req);
  const cita = await prisma.cita.findFirst({ where: { pacienteId, fecha: hoyISO(), deletedAt: null } });
  if (!cita) return res.status(404).json({ error: 'No tienes cita hoy' });

  const actualizada = await prisma.cita.update({ where: { id: cita.id }, data: { estado: 'llegado' } });
  res.json(actualizada);
});
