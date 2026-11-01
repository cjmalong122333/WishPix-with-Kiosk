// Teacher accounts, for the system administrator (there is no sign-up page).
//   npm run teacher -- list
//   npm run teacher -- add <username> "<Display Name>"      (asks for the password)
//   npm run teacher -- password <username>                  (asks for the new password)
//   npm run teacher -- remove <username>
import 'dotenv/config';
import path from 'node:path';
import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

const url = (process.env.DATABASE_URL ?? 'file:./data/wishpix.db').replace(/^file:/, '');
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: path.resolve(url) }) });

async function askPassword() {
  if (process.env.TEACHER_PASSWORD) return process.env.TEACHER_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const first = await rl.question('Password (8+ characters): ');
  const again = await rl.question('Password again: ');
  rl.close();
  if (first !== again) throw new Error('The two passwords are not the same.');
  if (first.length < 8) throw new Error('The password needs at least 8 characters.');
  return first;
}

async function main() {
  const [command, username, name] = process.argv.slice(2);
  switch (command) {
    case 'list': {
      for (const t of await prisma.teacher.findMany({ orderBy: { id: 'asc' } })) console.log(`${t.id}\t${t.username}\t${t.displayName}`);
      return;
    }
    case 'add': {
      if (!username) throw new Error('Usage: add <username> "<Display Name>"');
      const passwordHash = await bcrypt.hash(await askPassword(), 10);
      await prisma.teacher.create({ data: { username, displayName: name || username, passwordHash } });
      console.log(`Added ${username}.`);
      return;
    }
    case 'password': {
      if (!username) throw new Error('Usage: password <username>');
      const passwordHash = await bcrypt.hash(await askPassword(), 10);
      // Raising the token version signs the teacher out everywhere.
      await prisma.teacher.update({ where: { username }, data: { passwordHash, tokenVersion: { increment: 1 } } });
      console.log(`Changed the password for ${username}.`);
      return;
    }
    case 'remove': {
      if (!username) throw new Error('Usage: remove <username>');
      const teacher = await prisma.teacher.findUniqueOrThrow({ where: { username } });
      if ((await prisma.session.count({ where: { teacherId: teacher.id } })) > 0) {
        throw new Error('This teacher ran sessions that reports still use. Change their password instead of removing them.');
      }
      await prisma.event.updateMany({ where: { teacherId: teacher.id }, data: { teacherId: null } });
      await prisma.teacher.delete({ where: { id: teacher.id } });
      console.log(`Removed ${username}.`);
      return;
    }
    default:
      console.log('Commands: list | add <username> "<Display Name>" | password <username> | remove <username>');
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
