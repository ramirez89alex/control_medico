import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

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

  await prisma.gabinete.createMany({
    data: [
      { clinicaId: clinica.id, nombre: 'Gabinete 1', uso: 'General' },
      { clinicaId: clinica.id, nombre: 'Gabinete 2', uso: 'Cirugía e implantes' },
      { clinicaId: clinica.id, nombre: 'Gabinete 3', uso: 'Higiene y ortodoncia' },
    ],
    skipDuplicates: true,
  });

  console.log(`Clínica sembrada: ${clinica.nombre} (${clinica.id})`);
  console.log(`Usuario admin: ${admin.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
