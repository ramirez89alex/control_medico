import { Router } from 'express';
import { z } from 'zod';
import { pendientePaciente } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const cobrosRouter = Router();
cobrosRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

cobrosRouter.get('/', async (req, res) => {
  const pacienteId = req.query.pacienteId ? String(req.query.pacienteId) : undefined;
  const mes = req.query.mes ? String(req.query.mes) : undefined; // 'YYYY-MM'

  let rangoMes: { gte: Date; lt: Date } | undefined;
  if (mes) {
    const inicio = new Date(`${mes}-01T00:00:00`);
    const fin = new Date(inicio);
    fin.setMonth(fin.getMonth() + 1);
    rangoMes = { gte: inicio, lt: fin };
  }

  const clinicaId = clinicaDe(req);
  const cobros = await prisma.cobro.findMany({
    where: {
      clinicaId,
      deletedAt: null,
      ...(pacienteId ? { pacienteId } : {}),
      ...(rangoMes ? { fecha: rangoMes } : {}),
    },
    include: { paciente: true },
    orderBy: { fecha: 'desc' },
    take: 200,
  });
  res.json(cobros);
});

/**
 * Saldo pendiente por paciente: presupuestos aceptados - cobros, con `pendientePaciente()`
 * de @powerdent/shared (misma lógica que `pendientePaciente()` en el HTML original, ahora
 * calculada en el servidor una sola vez en vez de recorrer todo el array en el cliente).
 */
cobrosRouter.get('/saldos', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const [presupuestosAceptados, cobros, pacientes] = await Promise.all([
    prisma.presupuesto.findMany({ where: { clinicaId, estado: 'aceptado', deletedAt: null }, include: { lineas: true } }),
    prisma.cobro.findMany({ where: { clinicaId, deletedAt: null } }),
    prisma.paciente.findMany({ where: { clinicaId, deletedAt: null } }),
  ]);

  const saldos = pacientes
    .map((p) => {
      const susPresupuestos = presupuestosAceptados
        .filter((pr) => pr.pacienteId === p.id)
        .map((pr) => ({
          // La forma de LineaPresupuesto en Prisma (codigo/nombre/cantidad) difiere de la
          // que espera @powerdent/shared (cod/n/cant, igual que el HTML original) — se adapta aquí.
          lineas: pr.lineas.map((l) => ({ id: l.id, cod: l.codigo, n: l.nombre, pieza: l.pieza, cant: l.cantidad, pvp: l.pvp, coste: l.coste })),
          dto: pr.descuentoPct,
        }));
      const susCobros = cobros.filter((c) => c.pacienteId === p.id).map((c) => ({ importe: c.importe }));
      const pendiente = pendientePaciente(susPresupuestos, susCobros);
      return { paciente: p, pendiente };
    })
    .filter((x) => x.pendiente > 0.5)
    .sort((a, b) => b.pendiente - a.pendiente);

  res.json(saldos);
});

const cobroSchema = z.object({
  pacienteId: z.string().uuid(),
  presupuestoId: z.string().uuid().optional().nullable(),
  fecha: z.string().datetime().optional(),
  importe: z.number().positive(),
  forma: z.enum(['tarjeta', 'efectivo', 'bizum', 'transferencia', 'enlace_pago', 'financiacion', 'seguro']),
  tipo: z.enum(['pago', 'anticipo']).default('pago'),
  concepto: z.string().optional().nullable(),
});

cobrosRouter.post('/', async (req, res) => {
  const parsed = cobroSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const clinicaId = clinicaDe(req);
  const cobro = await prisma.$transaction(async (tx) => {
    const numero = (await tx.cobro.count({ where: { clinicaId } })) + 1;
    return tx.cobro.create({ data: { ...parsed.data, clinicaId, numero }, include: { paciente: true } });
  });

  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'cobro', entidadId: cobro.id });
  res.status(201).json(cobro);
});
