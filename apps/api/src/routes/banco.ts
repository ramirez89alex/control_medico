import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireGestion, requireRol } from '../middleware/auth.js';

export const bancoRouter = Router();
bancoRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'), requireGestion);

bancoRouter.get('/', async (req, res) => {
  const movimientos = await prisma.movimientoBanco.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null },
    orderBy: { fecha: 'desc' },
    take: 300,
  });
  res.json(movimientos);
});

/** Facturas y pedidos-con-factura sin conciliar, para el desplegable de "Casar movimiento". */
bancoRouter.get('/candidatos', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const [facturas, pedidos] = await Promise.all([
    prisma.factura.findMany({ where: { clinicaId, conciliada: false, deletedAt: null }, include: { paciente: true } }),
    prisma.pedido.findMany({ where: { clinicaId, facturaNumero: { not: null }, facturaPagada: false, deletedAt: null }, include: { proveedor: true } }),
  ]);
  res.json({
    facturas: facturas.map((f) => ({ id: f.id, etiqueta: `Factura ${f.numero} · ${f.paciente.nombre} ${f.paciente.apellidos}`, importe: f.total })),
    pedidos: pedidos.map((p) => ({ id: p.id, etiqueta: `Compra ${p.facturaNumero} · ${p.proveedor.nombre}`, importe: p.facturaImporte ?? 0 })),
  });
});

/** Traduce una línea "12/08/2026;PAGO TARJETA CLINICA;120,00" (o variantes sueltas) a {fecha, concepto, importe}. */
function parsearLinea(linea: string): { fecha: string; concepto: string; importe: number } | null {
  const mf = linea.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  const imps = [...linea.matchAll(/(-?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2})|-?\d+[.,]\d{2})(?!\d)/g)].map((x) => x[1]);
  if (!mf || !imps.length) return null;
  const bruto = imps[imps.length - 1];
  const importe = Number(bruto.replace(/[.\s]/g, '').replace(',', '.'));
  const anio = mf[3].length === 2 ? `20${mf[3]}` : mf[3];
  const fecha = `${anio}-${mf[2].padStart(2, '0')}-${mf[1].padStart(2, '0')}`;
  const concepto = linea.replace(mf[0], '').replace(bruto, '').replace(/[;,\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 80);
  return { fecha, concepto: concepto || 'Movimiento', importe };
}

bancoRouter.post('/importar', async (req, res) => {
  const parsed = z.object({ texto: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Texto requerido' });

  const clinicaId = clinicaDe(req);
  const lineas = parsed.data.texto.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const movimientos = lineas.map(parsearLinea).filter((m): m is NonNullable<typeof m> => m !== null);

  if (movimientos.length === 0) return res.json({ importados: 0 });

  await prisma.movimientoBanco.createMany({
    data: movimientos.map((m) => ({ clinicaId, fecha: new Date(`${m.fecha}T00:00:00`), concepto: m.concepto, importe: m.importe })),
  });
  res.json({ importados: movimientos.length });
});

function diasEntre(a: Date, b: Date) {
  return Math.abs((a.getTime() - b.getTime()) / 86400000);
}

bancoRouter.post('/conciliar-auto', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const [movimientos, facturas, cobros, pedidos] = await Promise.all([
    prisma.movimientoBanco.findMany({ where: { clinicaId, conciliado: false, deletedAt: null } }),
    prisma.factura.findMany({ where: { clinicaId, conciliada: false, deletedAt: null }, include: { paciente: true } }),
    prisma.cobro.findMany({ where: { clinicaId, conciliado: false, deletedAt: null }, include: { paciente: true } }),
    prisma.pedido.findMany({ where: { clinicaId, facturaNumero: { not: null }, facturaPagada: false, deletedAt: null }, include: { proveedor: true } }),
  ]);

  let n = 0;
  for (const m of movimientos) {
    if (m.importe > 0) {
      const factura = facturas.find((f) => !f.conciliada && Math.abs(f.total - m.importe) < 0.02 && diasEntre(f.fecha, m.fecha) <= 7);
      if (factura) {
        await prisma.$transaction([
          prisma.factura.update({ where: { id: factura.id }, data: { conciliada: true } }),
          prisma.movimientoBanco.update({
            where: { id: m.id },
            data: { conciliado: true, conciliadoTipo: 'factura', conciliadoId: factura.id, conciliadoNota: `Factura ${factura.numero} · ${factura.paciente.nombre} ${factura.paciente.apellidos}` },
          }),
        ]);
        factura.conciliada = true;
        n++;
        continue;
      }
      const cobro = cobros.find((c) => !c.conciliado && Math.abs(c.importe - m.importe) < 0.02 && diasEntre(c.fecha, m.fecha) <= 7);
      if (cobro) {
        await prisma.$transaction([
          prisma.cobro.update({ where: { id: cobro.id }, data: { conciliado: true } }),
          prisma.movimientoBanco.update({
            where: { id: m.id },
            data: { conciliado: true, conciliadoTipo: 'cobro', conciliadoId: cobro.id, conciliadoNota: `Cobro de ${cobro.paciente.nombre} ${cobro.paciente.apellidos}` },
          }),
        ]);
        cobro.conciliado = true;
        n++;
      }
    } else {
      const pedido = pedidos.find(
        (p) => !p.facturaPagada && p.facturaImporte != null && Math.abs(p.facturaImporte + m.importe) < 0.02 && p.facturaFecha && diasEntre(p.facturaFecha, m.fecha) <= 45,
      );
      if (pedido) {
        await prisma.$transaction([
          prisma.pedido.update({ where: { id: pedido.id }, data: { facturaPagada: true } }),
          prisma.movimientoBanco.update({
            where: { id: m.id },
            data: { conciliado: true, conciliadoTipo: 'pedido', conciliadoId: pedido.id, conciliadoNota: `Compra a ${pedido.proveedor.nombre} · ${pedido.facturaNumero}` },
          }),
        ]);
        pedido.facturaPagada = true;
        n++;
      }
    }
  }

  res.json({ conciliados: n });
});

const conciliarSchema = z.object({
  tipo: z.enum(['factura', 'pedido', 'otro']),
  id: z.string().uuid().optional(),
  nota: z.string().optional(),
});

bancoRouter.post('/:id/conciliar', async (req, res) => {
  const parsed = conciliarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clinicaId = clinicaDe(req);
  const movimiento = await prisma.movimientoBanco.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!movimiento) return res.status(404).json({ error: 'No encontrado' });

  let nota = parsed.data.nota || 'Otro concepto';
  if (parsed.data.tipo === 'factura') {
    if (!parsed.data.id) return res.status(400).json({ error: 'Falta la factura' });
    const factura = await prisma.factura.findFirst({ where: { id: parsed.data.id, clinicaId }, include: { paciente: true } });
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
    await prisma.factura.update({ where: { id: factura.id }, data: { conciliada: true } });
    nota = `Factura ${factura.numero} · ${factura.paciente.nombre} ${factura.paciente.apellidos}`;
  } else if (parsed.data.tipo === 'pedido') {
    if (!parsed.data.id) return res.status(400).json({ error: 'Falta el pedido' });
    const pedido = await prisma.pedido.findFirst({ where: { id: parsed.data.id, clinicaId }, include: { proveedor: true } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    await prisma.pedido.update({ where: { id: pedido.id }, data: { facturaPagada: true } });
    nota = `Compra ${pedido.facturaNumero} · ${pedido.proveedor.nombre}`;
  }

  const actualizado = await prisma.movimientoBanco.update({
    where: { id: movimiento.id },
    data: { conciliado: true, conciliadoTipo: parsed.data.tipo, conciliadoId: parsed.data.id, conciliadoNota: nota },
  });
  res.json(actualizado);
});

bancoRouter.post('/:id/desconciliar', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const movimiento = await prisma.movimientoBanco.findFirst({ where: { id: req.params.id, clinicaId, deletedAt: null } });
  if (!movimiento) return res.status(404).json({ error: 'No encontrado' });

  if (movimiento.conciliadoTipo === 'factura' && movimiento.conciliadoId) {
    await prisma.factura.update({ where: { id: movimiento.conciliadoId }, data: { conciliada: false } }).catch(() => {});
  } else if (movimiento.conciliadoTipo === 'cobro' && movimiento.conciliadoId) {
    await prisma.cobro.update({ where: { id: movimiento.conciliadoId }, data: { conciliado: false } }).catch(() => {});
  } else if (movimiento.conciliadoTipo === 'pedido' && movimiento.conciliadoId) {
    await prisma.pedido.update({ where: { id: movimiento.conciliadoId }, data: { facturaPagada: false } }).catch(() => {});
  }

  const actualizado = await prisma.movimientoBanco.update({
    where: { id: movimiento.id },
    data: { conciliado: false, conciliadoTipo: null, conciliadoId: null, conciliadoNota: null },
  });
  res.json(actualizado);
});
