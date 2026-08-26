import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { clinicaDe, requireAuth, requireRol } from '../middleware/auth.js';
import { nuevaObjectKey, presignDescarga, presignSubida } from '../lib/s3.js';
import { registrarAuditoria } from '../lib/auditoria.js';

export const archivosRouter = Router();
archivosRouter.use(requireAuth, requireRol('admin', 'dentista', 'recepcion'));

const presignSchema = z.object({
  nombre: z.string().min(1),
  mime: z.string().min(1),
  pacienteId: z.string().uuid().optional(),
});

/** Paso 1: el cliente pide una URL de subida firmada, sin pasar el archivo por nuestro servidor. */
archivosRouter.post('/presign', async (req, res) => {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const clinicaId = clinicaDe(req);
  const objectKey = nuevaObjectKey(clinicaId, parsed.data.nombre, parsed.data.pacienteId);
  const uploadUrl = await presignSubida(objectKey, parsed.data.mime);
  res.json({ objectKey, uploadUrl });
});

const confirmarSchema = z.object({
  objectKey: z.string().min(1),
  nombre: z.string().min(1),
  mime: z.string().min(1),
  tamanoBytes: z.number().int().positive(),
  pacienteId: z.string().uuid().optional(),
});

/** Paso 2: tras subir al bucket, el cliente confirma para que quede registrado en la BD. */
archivosRouter.post('/', async (req, res) => {
  const parsed = confirmarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const archivo = await prisma.archivo.create({ data: { ...parsed.data, clinicaId: clinicaDe(req) } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: req.usuario!.usuarioId, accion: 'crear', entidad: 'archivo', entidadId: archivo.id });
  res.status(201).json(archivo);
});

archivosRouter.get('/:id/descarga', async (req, res) => {
  const archivo = await prisma.archivo.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado' });
  const url = await presignDescarga(archivo.objectKey);
  res.json({ url });
});

archivosRouter.delete('/:id', async (req, res) => {
  const archivo = await prisma.archivo.findFirst({ where: { id: req.params.id, clinicaId: clinicaDe(req), deletedAt: null } });
  if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado' });
  await prisma.archivo.update({ where: { id: archivo.id }, data: { deletedAt: new Date() } });
  registrarAuditoria({ clinicaId: clinicaDe(req), usuarioId: req.usuario!.usuarioId, accion: 'borrar', entidad: 'archivo', entidadId: archivo.id });
  res.status(204).end();
});
