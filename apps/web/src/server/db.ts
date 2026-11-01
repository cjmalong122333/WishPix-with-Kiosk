import fs from 'node:fs';
import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from './env';

fs.mkdirSync(env.IMAGE_DIR, { recursive: true });

function sqlitePath(url: string) {
  const file = url.replace(/^file:/, '');
  return path.isAbsolute(file) ? file : path.resolve(file);
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: sqlitePath(env.DATABASE_URL) });
  return new PrismaClient({ adapter });
}

// One client for the whole process (Next.js reloads modules in development).
const g = globalThis as unknown as { __wishpixPrisma?: PrismaClient };
export const prisma = (g.__wishpixPrisma ??= createClient());

// Raw SQL for reports, with @named parameters. Integers come back as
// numbers and dates as ISO strings, ready to send as JSON.
export type Row = Record<string, unknown>;
type Params = Record<string, unknown>;

export async function sql<T = Row>(query: string, params: Params = {}): Promise<T[]> {
  const values: unknown[] = [];
  const text = query.replace(/@(\w+)/g, (_, name: string) => {
    if (!(name in params)) throw new Error(`Missing SQL parameter @${name}`);
    values.push(params[name]);
    return '?';
  });
  const rows = await prisma.$queryRawUnsafe<Row[]>(text, ...values);
  return rows.map(clean) as T[];
}

export async function sqlOne<T = Row>(query: string, params: Params = {}): Promise<T> {
  return (await sql<T>(query, params))[0];
}

function clean(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v instanceof Date ? v.toISOString() : v;
  }
  return out;
}
