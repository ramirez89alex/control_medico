import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { stripe } from '../lib/stripe.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';
import { env } from '../env.js';

export const pagosRouter = Router();
pagosRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

/** 8 caracteres en base64url (~48 bits), suficiente para no adivinarlo y sin fricción visual. */
export function nuevoCodigoCorto(): string {
  return randomBytes(6).toString('base64url');
}

const enlaceSchema = z.object({
  pacienteId: z.string().uuid(),
  importe: z.number().positive(),
  concepto: z.string().optional().nullable(),
  presupuestoId: z.string().uuid().optional().nullable(),
});

pagosRouter.post('/enlace', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'El cobro online no está configurado. Añade STRIPE_SECRET_KEY en el servidor.' });
  }
  const parsed = enlaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const clinicaId = clinicaDe(req);
  const paciente = await prisma.paciente.findFirst({ where: { id: parsed.data.pacienteId, clinicaId, deletedAt: null } });
  if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

  const concepto = parsed.data.concepto?.trim() || 'Tratamiento dental';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: { name: concepto },
          unit_amount: Math.round(parsed.data.importe * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${env.frontendUrl}/pago-completado?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.frontendUrl}/pago-cancelado`,
    customer_email: paciente.email || undefined,
  });

  const enlace = await prisma.enlacePago.create({
    data: {
      clinicaId,
      pacienteId: paciente.id,
      presupuestoId: parsed.data.presupuestoId || undefined,
      importe: parsed.data.importe,
      concepto,
      stripeSessionId: session.id,
      stripeUrl: session.url || '',
      codigoCorto: nuevoCodigoCorto(),
      creadoPorUsuarioId: usuarioDe(req),
    },
    include: { paciente: true },
  });

  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'enlace_pago', entidadId: enlace.id });
  res.status(201).json(enlace);
});

pagosRouter.get('/enlaces', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const pacienteId = req.query.pacienteId ? String(req.query.pacienteId) : undefined;
  const enlaces = await prisma.enlacePago.findMany({
    where: { clinicaId, deletedAt: null, ...(pacienteId ? { pacienteId } : {}) },
    include: { paciente: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(enlaces);
});

/**
 * Enlace corto que se manda al paciente (WhatsApp, SMS...) en vez de la URL larga y con
 * fragmento ilegible de Stripe. Redirige al checkout si sigue pendiente, o a la página de
 * confirmación si ya se pagó (por si vuelven a tocar el mismo enlace después de pagar).
 */
export async function irAPago(req: Request, res: Response) {
  const codigo = String(req.params.codigo || '');
  const enlace = await prisma.enlacePago.findFirst({ where: { codigoCorto: codigo, deletedAt: null } });
  if (!enlace) return res.redirect(`${env.frontendUrl}/pago-cancelado`);

  if (enlace.estado === 'pagado') {
    return res.redirect(`${env.frontendUrl}/pago-completado?session_id=${enlace.stripeSessionId}`);
  }
  if (enlace.estado !== 'pendiente') {
    return res.redirect(`${env.frontendUrl}/pago-cancelado`);
  }
  res.redirect(enlace.stripeUrl);
}

/** Estado consultado sin sesión de personal: la propia página de "pago completado" del
 * paciente lo usa para confirmar que Stripe ya avisó al servidor. El id de sesión de Stripe
 * no es adivinable, así que sirve como capacidad de acceso de un solo dato (estado del pago). */
export async function estadoPagoPublico(req: Request, res: Response) {
  const sessionId = String(req.params.sessionId || '');
  const enlace = await prisma.enlacePago.findFirst({ where: { stripeSessionId: sessionId, deletedAt: null } });
  if (!enlace) return res.status(404).json({ error: 'No encontrado' });
  res.json({ estado: enlace.estado, importe: enlace.importe, concepto: enlace.concepto });
}

/**
 * Webhook de Stripe: confirma el pago y crea el Cobro real. Se monta con el body en crudo
 * (necesario para verificar la firma) ANTES de express.json() en index.ts, y sin requireAuth
 * — Stripe llama directamente, la autenticidad la da la firma, no una sesión de usuario.
 */
export async function pagosWebhookHandler(req: Request, res: Response) {
  if (!stripe || !env.stripeWebhookSecret) return res.status(503).end();

  const firma = req.headers['stripe-signature'];
  let evento;
  try {
    evento = stripe.webhooks.constructEvent(req.body, firma as string, env.stripeWebhookSecret);
  } catch (err) {
    console.error('Firma de webhook de Stripe inválida:', err);
    return res.status(400).send('Firma inválida');
  }

  if (evento.type === 'checkout.session.completed') {
    const session = evento.data.object as { id: string; payment_status: string };
    if (session.payment_status === 'paid') {
      const enlace = await prisma.enlacePago.findUnique({ where: { stripeSessionId: session.id } });
      if (enlace && enlace.estado === 'pendiente') {
        await prisma.$transaction(async (tx) => {
          const numero = (await tx.cobro.count({ where: { clinicaId: enlace.clinicaId } })) + 1;
          const cobro = await tx.cobro.create({
            data: {
              clinicaId: enlace.clinicaId,
              pacienteId: enlace.pacienteId,
              presupuestoId: enlace.presupuestoId,
              importe: enlace.importe,
              forma: 'enlace_pago',
              tipo: 'pago',
              concepto: enlace.concepto,
              numero,
            },
          });
          await tx.enlacePago.update({ where: { id: enlace.id }, data: { estado: 'pagado', pagadoEn: new Date(), cobroId: cobro.id } });
        });
        registrarAuditoria({ clinicaId: enlace.clinicaId, usuarioId: enlace.creadoPorUsuarioId || enlace.pacienteId, accion: 'pagado', entidad: 'enlace_pago', entidadId: enlace.id });
      }
    }
  }

  res.json({ received: true });
}
