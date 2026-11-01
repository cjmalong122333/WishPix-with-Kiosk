import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// DATABASE_URL defaults to data/wishpix.db inside this app.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./data/wishpix.db',
  },
});
