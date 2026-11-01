import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native SQLite driver stays outside the bundle.
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
  poweredByHeader: false,
  turbopack: { root: path.resolve(import.meta.dirname) },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  images: { unoptimized: true },
};

export default nextConfig;
