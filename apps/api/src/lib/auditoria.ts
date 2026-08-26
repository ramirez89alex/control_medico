import { prisma } from './prisma.js';

export function registrarAuditoria(params: {
  clinicaId: string;
  usuarioId: string;
  accion: string;
  entidad: string;
  entidadId?: string;
  detalle?: unknown;
}) {
  // Fire-and-forget: un fallo al auditar no debe romper la petición que lo originó.
  prisma.sesionAuditoria
    .create({
      data: {
        clinicaId: params.clinicaId,
        usuarioId: params.usuarioId,
        accion: params.accion,
        entidad: params.entidad,
        entidadId: params.entidadId,
        detalle: params.detalle as never,
      },
    })
    .catch((err) => console.error('No se pudo registrar auditoría:', err));
}
