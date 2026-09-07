import { Router } from 'express';
import { z } from 'zod';
import { stockAPedir } from '@powerdent/shared';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireGestion, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const almacenRouter = Router();
almacenRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'), requireGestion);

almacenRouter.get('/stock', async (req, res) => {
  const stock = await prisma.stock.findMany({
    where: { clinicaId: clinicaDe(req) },
    include: { proveedor: true },
    orderBy: [{ departamento: 'asc' }, { orden: 'asc' }],
  });
  res.json(stock);
});

const stockSchema = z.object({
  nombre: z.string().min(1),
  departamento: z.string().optional(),
  proveedorId: z.string().uuid().optional().nullable(),
  diaEntrega: z.string().optional().nullable(),
  minimo: z.number().min(0).optional(),
  objetivo: z.number().min(0).optional(),
  unidad: z.string().optional(),
  coste: z.number().min(0).optional(),
});

almacenRouter.post('/stock', async (req, res) => {
  const parsed = stockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clinicaId = clinicaDe(req);
  const maxOrden = await prisma.stock.aggregate({ where: { clinicaId }, _max: { orden: true } });
  const item = await prisma.stock.create({
    data: { ...parsed.data, clinicaId, orden: (maxOrden._max.orden ?? 0) + 1 },
    include: { proveedor: true },
  });
  res.status(201).json(item);
});

const stockUpdateSchema = stockSchema.partial().extend({
  contado: z.number().min(0).nullable().optional(),
  activo: z.boolean().optional(),
});

almacenRouter.put('/stock/:id', async (req, res) => {
  const parsed = stockUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existe = await prisma.stock.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  const item = await prisma.stock.update({ where: { id: req.params.id }, data: parsed.data, include: { proveedor: true } });
  res.json(item);
});

almacenRouter.post('/stock/:id/mover', async (req, res) => {
  const direccion = req.body?.direccion === 1 ? 1 : req.body?.direccion === -1 ? -1 : null;
  if (!direccion) return res.status(400).json({ error: 'direccion debe ser 1 o -1' });

  const item = await prisma.stock.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!item) return res.status(404).json({ error: 'No encontrado' });

  const hermanos = await prisma.stock.findMany({
    where: { clinicaId: clinicaDe(req), departamento: item.departamento },
    orderBy: { orden: 'asc' },
  });
  const i = hermanos.findIndex((s) => s.id === item.id);
  const j = i + direccion;
  if (j < 0 || j >= hermanos.length) return res.json(item);

  await prisma.$transaction([
    prisma.stock.update({ where: { id: hermanos[i].id }, data: { orden: hermanos[j].orden } }),
    prisma.stock.update({ where: { id: hermanos[j].id }, data: { orden: hermanos[i].orden } }),
  ]);
  res.json({ ok: true });
});

almacenRouter.delete('/stock/:id', async (req, res) => {
  const existe = await prisma.stock.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req) } });
  if (!existe) return res.status(404).json({ error: 'No encontrado' });
  await prisma.stock.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

/** Vuelca el conteo en curso (`contado`) al stock guardado (`cantidad`) y limpia la columna. */
almacenRouter.post('/conteo/guardar', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const contados = await prisma.stock.findMany({ where: { clinicaId, contado: { not: null } } });
  await prisma.$transaction(
    contados.map((s) => prisma.stock.update({ where: { id: s.id }, data: { cantidad: s.contado!, contado: null } })),
  );
  res.json({ actualizados: contados.length });
});

/** Vacía la columna "contado" de todas las referencias para empezar un conteo nuevo. */
almacenRouter.post('/conteo/nuevo', async (req, res) => {
  await prisma.stock.updateMany({ where: { clinicaId: clinicaDe(req) }, data: { contado: null } });
  res.json({ ok: true });
});

/** Crea un pedido borrador por proveedor con todo lo que está por debajo del mínimo ahora mismo (según `aPedir`). */
almacenRouter.post('/pedidos-desde-conteo', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const stock = await prisma.stock.findMany({ where: { clinicaId, activo: true } });
  const aPedir = stock.filter((s) => stockAPedir(s) > 0);

  const grupos = new Map<string, typeof aPedir>();
  for (const s of aPedir) {
    if (!s.proveedorId) continue;
    grupos.set(s.proveedorId, [...(grupos.get(s.proveedorId) || []), s]);
  }
  if (grupos.size === 0) return res.json({ pedidos: 0, sinProveedor: aPedir.filter((s) => !s.proveedorId).length });

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
          nota: 'Generado desde el conteo',
          lineas: items.map((s) => ({ stockId: s.id, nombre: s.nombre, cantidad: stockAPedir(s), precio: s.coste })),
        },
      });
    }),
  );

  pedidos.forEach((p) => registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'pedido', entidadId: p.id }));
  res.json({ pedidos: pedidos.length, sinProveedor: aPedir.filter((s) => !s.proveedorId).length });
});
