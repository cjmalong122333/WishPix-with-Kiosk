import fs from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { env } from '@/server/env';
import { teacherFromRequest } from '@/server/auth';
import { isKioskRequest } from '@/server/http';

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// Children's pictures: only the kiosk screen and signed-in teachers see them.
export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[\w.-]+$/.test(file) || !TYPES[path.extname(file).toLowerCase()]) return new Response('Not found', { status: 404 });
  if (!isKioskRequest(req) && !(await teacherFromRequest(req))) return new Response('Not allowed', { status: 403 });
  try {
    const bytes = await fs.readFile(path.join(env.IMAGE_DIR, file));
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': TYPES[path.extname(file).toLowerCase()], 'Cache-Control': 'private, max-age=86400' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
