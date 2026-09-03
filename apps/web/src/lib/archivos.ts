import { api } from './api';

export interface ArchivoSubido {
  id: string;
  nombre: string;
  mime: string;
  tamanoBytes: number;
  objectKey: string;
}

/** Sube un archivo directo al bucket vía URL firmada, y lo registra en la BD. */
export async function subirArchivo(file: File | Blob, nombre: string, pacienteId?: string): Promise<ArchivoSubido> {
  const mime = file.type || 'application/octet-stream';
  const { objectKey, uploadUrl } = await api.post<{ objectKey: string; uploadUrl: string }>('/archivos/presign', {
    nombre,
    mime,
    pacienteId,
  });
  const subida = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mime } });
  if (!subida.ok) throw new Error('No se pudo subir el archivo');
  return api.post<ArchivoSubido>('/archivos', {
    objectKey,
    nombre,
    mime,
    tamanoBytes: file.size,
    pacienteId,
  });
}
