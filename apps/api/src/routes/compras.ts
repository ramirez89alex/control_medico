import { Router } from 'express';
import { z } from 'zod';
import { stockAPedir } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireGestion, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const comprasRouter = Router();
comprasRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'), requireGestion);

comprasRouter.get('/proveedores', async (req, res) => {
  const proveedores = await prisma.proveedor.findMany({ where: { clinicaId: clinicaDe(req) }, orderBy: { nombre: 'asc' } });
  res.json(proveedores);
});

const proveedorSchema = z.object({
  nombre: z.string().min(1),
  contacto: z.string().optional().nullable(),
  diasEntrega: z.number().int().positive().optional(),
  pedidoMinimo: z.number().min(0).optional(),
});

comprasRouter.post('/proveedores', async (req, res) => {
  const parsed = proveedorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const proveedor = await prisma.proveedor.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  res.status(201).json(proveedor);
});

comprasRouter.put('/proveedores/:id', async (req, res) => {
  const parsed = proveedorSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existe = await prisma.proveedor.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  const proveedor = await prisma.proveedor.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(proveedor);
});

comprasRouter.delete('/proveedores/:id', async (req, res) => {
  const existe = await prisma.proveedor.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  try {
    await prisma.proveedor.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    if (e?.code === 'P2003') return res.status(409).json({ error: 'Este proveedor tiene referencias de almacén o pedidos asociados' });
    throw e;
  }
});

comprasRouter.get('/pedidos', async (req, res) => {
  const pedidos = await prisma.pedido.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null },
    include: { proveedor: true },
    orderBy: { fecha: 'desc' },
    take: 300,
  });
  res.json(pedidos);
});

const lineaSchema = z.object({
  stockId: z.string().uuid().optional().nullable(),
  nombre: z.string().min(1),
  cantidad: z.number().positive(),
  precio: z.number().min(0),
});

const pedidoSchema = z.object({
  proveedorId: z.string().uuid(),
  fecha: z.string().datetime().optional(),
  previsto: z.string().datetime().optional().nullable(),
  nota: z.string().optional().nullable(),
  lineas: z.array(lineaSchema).min(1),
});

async function calcularPrevisto(clinicaId: string, proveedorId: string, fecha?: string) {
  const prov = await prisma.proveedor.findFirst({ where: { id: proveedorId, clinicaId } });
  const base = fecha ? new Date(fecha) : new Date();
  base.setDate(base.getDate() + (prov?.diasEntrega ?? 3));
  return base;
}

comprasRouter.post('/pedidos', async (req, res) => {
  const parsed = pedidoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clinicaId = clinicaDe(req);

  const previsto = parsed.data.previsto ? new Date(parsed.data.previsto) : await calcularPrevisto(clinicaId, parsed.data.proveedorId, parsed.data.fecha);
  const pedido = await prisma.pedido.create({
    data: {
      clinicaId,
      proveedorId: parsed.data.proveedorId,
      fecha: parsed.data.fecha ? new Date(parsed.data.fecha) : undefined,
      previsto,
      nota: parsed.data.nota,
      lineas: parsed.data.lineas,
    },
    include: { proveedor: true },
  });
  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'pedido', entidadId: pedido.id });
  res.status(201).json(pedido);
});

const pedidoUpdateSchema = z.object({
  proveedorId: z.string().uuid().optional(),
  fecha: z.string().datetime().optional(),
  previsto: z.string().datetime().optional().nullable(),
  nota: z.string().optional().nullable(),
  lineas: z.array(lineaSchema).optional(),
  estado: z.enum(['borrador', 'enviado']).optional(),
});

comprasRouter.put('/pedidos/:id', async (req, res) => {
  const parsed = pedidoUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clinicaId = clinicaDe(req);
  const existe = await prisma.pedido.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  if (existe.estado !== 'borrador') return res.status(409).json({ error: 'Solo se puede editar un pedido en borrador' });

  const { fecha, previsto, ...resto } = parsed.data;
  const pedido = await prisma.pedido.update({
    where: { id: req.params.id },
    data: { ...resto, ...(fecha ? { fecha: new Date(fecha) } : {}), ...(previsto !== undefined ? { previsto: previsto ? new Date(previsto) : null } : {}) },
    include: { proveedor: true },
  });
  res.json(pedido);
});

comprasRouter.delete('/pedidos/:id', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const existe = await prisma.pedido.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  if (existe.estado !== 'borrador') return res.status(409).json({ error: 'Solo se puede eliminar un pedido en borrador' });
  await prisma.pedido.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.status(204).end();
});

const recepcionSchema = z.object({
  lineas: z.array(z.object({ index: z.number().int().min(0), cantidad: z.number().min(0), precio: z.number().min(0) })),
  albaranNumero: z.string().optional().nullable(),
  albaranFecha: z.string().datetime().optional(),
  facturaNumero: z.string().optional().nullable(),
});

comprasRouter.post('/pedidos/:id/recibir', async (req, res) => {
  const parsed = recepcionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clinicaId = clinicaDe(req);
  const pedido = await prisma.pedido.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!pedido) return res.status(404).json({ error: 'No encontrado' });
  if (pedido.estado === 'recibido') return res.status(409).json({ error: 'Ese pedido ya está recibido' });

  const lineasOriginales = pedido.lineas as Array<{ stockId: string | null; nombre: string; cantidad: number; precio: number }>;
  const lineasActualizadas = lineasOriginales.map((l, i) => {
    const cambio = parsed.data.lineas.find((x) => x.index === i);
    return cambio ? { ...l, cantidad: cambio.cantidad, precio: cambio.precio } : l;
  });
  const total = lineasActualizadas.reduce((a, l) => a + l.cantidad * l.precio, 0);
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    for (const l of lineasActualizadas) {
      if (!l.stockId) continue;
      const s = await tx.stock.findFirst({ where: { id: l.stockId, clinicaId } });
      if (!s) continue;
      const historial = Array.isArray(s.historial) ? (s.historial as unknown[]) : [];
      historial.push({ fecha: ahora.toISOString(), precio: l.precio, cantidad: l.cantidad, proveedorId: pedido.proveedorId });
      await tx.stock.update({
        where: { id: s.id },
        data: { cantidad: s.cantidad + l.cantidad, coste: l.precio, proveedorId: s.proveedorId ?? pedido.proveedorId, historial: historial as never },
      });
    }

    await tx.pedido.update({
      where: { id: pedido.id },
      data: {
        estado: 'recibido',
        lineas: lineasActualizadas,
        recibidoFecha: ahora,
        albaranNumero: parsed.data.albaranNumero,
        albaranFecha: parsed.data.albaranFecha ? new Date(parsed.data.albaranFecha) : ahora,
        ...(parsed.data.facturaNumero
          ? { facturaNumero: parsed.data.facturaNumero, facturaFecha: ahora, facturaImporte: total, facturaVence: new Date(ahora.getTime() + 30 * 86400000) }
          : {}),
      },
    });
  });

  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'editar', entidad: 'pedido', entidadId: pedido.id, detalle: { accion: 'recibir' } });
  const actualizado = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { proveedor: true } });
  res.json(actualizado);
});

const facturaSchema = z.object({
  numero: z.string().min(1),
  fecha: z.string().datetime(),
  importe: z.number().min(0),
  vence: z.string().datetime(),
});

comprasRouter.put('/pedidos/:id/factura', async (req, res) => {
  const parsed = facturaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clinicaId = clinicaDe(req);
  const pedido = await prisma.pedido.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!pedido) return res.status(404).json({ error: 'No encontrado' });

  const actualizado = await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      facturaNumero: parsed.data.numero,
      facturaFecha: new Date(parsed.data.fecha),
      facturaImporte: parsed.data.importe,
      facturaVence: new Date(parsed.data.vence),
    },
    include: { proveedor: true },
  });
  res.json(actualizado);
});

comprasRouter.post('/pedidos/:id/pagar', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const pedido = await prisma.pedido.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!pedido) return res.status(404).json({ error: 'No encontrado' });
  const actualizado = await prisma.pedido.update({ where: { id: pedido.id }, data: { facturaPagada: true }, include: { proveedor: true } });
  res.json(actualizado);
});

/** Genera un pedido borrador por proveedor con todo lo que está por debajo del mínimo (stock guardado, sin contar conteos en curso). */
comprasRouter.post('/pedido-automatico', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const stock = await prisma.stock.findMany({ where: { clinicaId, activo: true } });
  const bajoMinimo = stock.filter((s) => s.cantidad <= s.minimo);

  const grupos = new Map<string, typeof bajoMinimo>();
  for (const s of bajoMinimo) {
    if (!s.proveedorId) continue;
    grupos.set(s.proveedorId, [...(grupos.get(s.proveedorId) || []), s]);
  }
  if (grupos.size === 0) return res.json({ pedidos: 0, sinProveedor: bajoMinimo.filter((s) => !s.proveedorId).length });

  const proveedores = await prisma.proveedor.findMany({ where: { id: { in: [...grupos.keys()] } } });
  const pedidos = await prisma.$transaction(
    [...grupos.entries()].map(([proveedorId, items]) => {
      const prov = proveedores.find((p) => p.id === proveedorId);
      const previsto = new Date();
      previsto.setDate(previsto.getDate() + (prov?.diasEntrega ?? 3));
      return prisma.pedido.create({
        data: {
          clinicaId,
          proveedorId,
          previsto,
          nota: 'Generado automáticamente por mínimos',
          lineas: items.map((s) => ({ stockId: s.id, nombre: s.nombre, cantidad: stockAPedir(s), precio: s.coste })),
        },
      });
    }),
  );

  pedidos.forEach((p) => registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'pedido', entidadId: p.id }));
  res.json({ pedidos: pedidos.length, sinProveedor: bajoMinimo.filter((s) => !s.proveedorId).length });
});
