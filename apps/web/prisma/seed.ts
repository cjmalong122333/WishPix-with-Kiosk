import 'dotenv/config';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

// First-run data: the first teacher account and the kiosk. Safe to run
// again; nothing that exists is changed.
//   ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_NAME   the first teacher
//   KIOSK_NAME                                     shown on the kiosk and Teacher App

const url = (process.env.DATABASE_URL ?? 'file:./data/wishpix.db').replace(/^file:/, '');
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: path.resolve(url) }) });

const production = process.env.NODE_ENV === 'production';

async function main() {
  if ((await prisma.teacher.count()) === 0) {
    const username = process.env.ADMIN_USERNAME?.trim() || (production ? '' : 'teacher');
    const password = process.env.ADMIN_PASSWORD ?? (production ? '' : 'wishpix123');
    if (!username || password.length < 8) {
      throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (8+ characters) to create the first teacher account.');
    }
    await prisma.teacher.create({
      data: { username, passwordHash: await bcrypt.hash(password, 10), displayName: process.env.ADMIN_NAME?.trim() || 'Teacher' },
    });
    console.log(`Created teacher account "${username}".`);
  }
  if (!(await prisma.kiosk.findUnique({ where: { id: 1 } }))) {
    await prisma.kiosk.create({ data: { id: 1, name: process.env.KIOSK_NAME?.trim() || 'WishPix Kiosk', firmware: '1.0.0' } });
    console.log('Created the kiosk record.');
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
