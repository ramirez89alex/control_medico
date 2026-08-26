import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';

export const s3 = new S3Client({
  endpoint: env.s3.endpoint,
  region: env.s3.region,
  forcePathStyle: env.s3.forcePathStyle,
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey,
  },
});

/** Genera una key de objeto única, con prefijo por clínica y por paciente si aplica. */
export function nuevaObjectKey(clinicaId: string, nombreOriginal: string, pacienteId?: string): string {
  const ext = nombreOriginal.includes('.') ? nombreOriginal.split('.').pop() : undefined;
  const base = pacienteId ? `${clinicaId}/pacientes/${pacienteId}` : `${clinicaId}/varios`;
  return `${base}/${randomUUID()}${ext ? `.${ext}` : ''}`;
}

/** URL firmada de subida (PUT), de vida corta. El cliente sube directo al bucket. */
export async function presignSubida(objectKey: string, mime: string, ttlSeg = 300): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: env.s3.bucket, Key: objectKey, ContentType: mime });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSeg });
}

/** URL firmada de descarga (GET), de vida corta. Nunca se sirve el bucket como público. */
export async function presignDescarga(objectKey: string, ttlSeg = 300): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: env.s3.bucket, Key: objectKey });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSeg });
}

/** Subida directa desde el servidor (scripts de migración), sin pasar por una URL firmada. */
export async function subirBuffer(objectKey: string, body: Buffer, mime: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: objectKey, Body: body, ContentType: mime }));
}
