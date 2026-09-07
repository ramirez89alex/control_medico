import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireGestion, requireRol, usuarioDe } from '../middleware/auth.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const facturacionRouter = Router();
facturacionRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'), requireGestion);

facturacionRouter.get('/', async (req, res) => {
  const facturas = await prisma.factura.findMany({
    where: { clinicaId: clinicaDe(req), deletedAt: null },
    include: { paciente: true },
    orderBy: { fecha: 'desc' },
    take: 300,
  });
  res.json(facturas);
});

facturacionRouter.post('/desde-cobro/:cobroId', async (req, res) => {
  const clinicaId = clinicaDe(req);
  const cobro = await prisma.cobro.findFirst({
    where: { id: req.params.cobroId, clinicaId, deletedAt: null },
    include: { paciente: true, factura: true },
  });
  if (!cobro) return res.status(404).json({ error: 'Cobro no encontrado' });
  if (cobro.factura) return res.status(409).json({ error: 'Ese cobro ya está facturado' });

  const clinica = await prisma.clinica.findUniqueOrThrow({ where: { id: clinicaId }, select: { serie: true, iva: true } });

  const factura = await prisma.$transaction(async (tx) => {
    const anio = new Date().getFullYear();
    const n = (await tx.factura.count({ where: { clinicaId, anio } })) + 1;
    const numero = `${clinica.serie}${anio}/${String(n).padStart(4, '0')}`;
    return tx.factura.create({
      data: {
        clinicaId,
        pacienteId: cobro.pacienteId,
        cobroId: cobro.id,
        numero,
        anio,
        fecha: cobro.fecha,
        lineas: [{ nombre: cobro.concepto || 'Tratamiento odontológico', cantidad: 1, pvp: cobro.importe }],
        base: cobro.importe,
        iva: clinica.iva,
        exenta: clinica.iva === 0,
        total: cobro.importe,
      },
      include: { paciente: true },
    });
  });

  registrarAuditoria({ clinicaId, usuarioId: usuarioDe(req), accion: 'crear', entidad: 'factura', entidadId: factura.id });
  res.status(201).json(factura);
});
