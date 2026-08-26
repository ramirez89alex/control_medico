import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const nombreClinica = process.env.SEED_CLINICA_NOMBRE || 'PowerDent Marratxí';
  const emailAdmin = process.env.SEED_ADMIN_EMAIL || 'admin@powerdent.local';
  const passwordAdmin = process.env.SEED_ADMIN_PASSWORD;
  if (!passwordAdmin) {
    throw new Error('Define SEED_ADMIN_PASSWORD antes de sembrar la base de datos (no se usan contraseñas por defecto).');
  }

  const clinica = await prisma.clinica.upsert({
    where: { id: process.env.SEED_CLINICA_ID || '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: process.env.SEED_CLINICA_ID || '00000000-0000-0000-0000-000000000001',
      nombre: nombreClinica,
      horario: {
        1: { abre: '09:00', cierra: '20:00' },
        2: { abre: '09:00', cierra: '20:00' },
        3: { abre: '09:00', cierra: '20:00' },
        4: { abre: '09:00', cierra: '20:00' },
        5: { abre: '09:00', cierra: '20:00' },
        6: null,
        0: null,
      },
    },
  });

  const passwordHash = await hashPassword(passwordAdmin);
  const admin = await prisma.usuario.upsert({
    where: { email: emailAdmin },
    update: {},
    create: {
      clinicaId: clinica.id,
      email: emailAdmin,
      passwordHash,
      rol: 'admin',
      nombre: 'Administrador',
    },
  });

  for (const g of [
    { nombre: 'Gabinete 1', uso: 'General' },
    { nombre: 'Gabinete 2', uso: 'Cirugía e implantes' },
    { nombre: 'Gabinete 3', uso: 'Higiene y ortodoncia' },
    { nombre: 'Sala RX / escáner', uso: 'Radiología' },
  ]) {
    await prisma.gabinete.upsert({
      where: { clinicaId_nombre: { clinicaId: clinica.id, nombre: g.nombre } },
      update: {},
      create: { ...g, clinicaId: clinica.id },
    });
  }

  for (const d of [
    { nombre: 'Doctor Garbarino', rol: 'Odontólogo', especialidad: 'Odontología general', color: '#C9433F' },
    { nombre: 'Doctora Icell', rol: 'Odontóloga', especialidad: 'Odontología general', color: '#3B4076' },
    { nombre: 'Doctora Lucía', rol: 'Odontóloga', especialidad: 'Odontología general', color: '#00A29B' },
  ]) {
    await prisma.dentista.upsert({
      where: { clinicaId_nombre: { clinicaId: clinica.id, nombre: d.nombre } },
      update: {},
      create: { ...d, clinicaId: clinica.id },
    });
  }

  const tarifario: Array<{ codigo: string; nombre: string; familia: string; pvp: number; coste: number; minutos: number }> = JSON.parse(
    readFileSync(join(__dirname, 'tarifario-seed.json'), 'utf-8'),
  );
  for (const t of tarifario) {
    await prisma.tarifario.upsert({
      where: { clinicaId_codigo: { clinicaId: clinica.id, codigo: t.codigo } },
      update: {},
      create: { ...t, clinicaId: clinica.id },
    });
  }
  console.log(`Tarifario sembrado: ${tarifario.length} conceptos`);

  console.log(`Clínica sembrada: ${clinica.nombre} (${clinica.id})`);
  console.log(`Usuario admin: ${admin.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
