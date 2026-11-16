import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { env } from '@/server/env';
import { teacherFromRequest } from '@/server/auth';
import { isKioskRequest, route } from '@/server/http';
import { pageJob } from '@/server/kiosk';
import { printerState, renderPage } from '@/server/printer';

export const dynamic = 'force-dynamic';

// A child's page exactly as it prints (drawn by the hardware service with the
// same code and paper size as the printer), for the kiosk's "printing" and
// "worksheet ready" screens and the Teacher App. Only the kiosk screen and
// signed-in teachers can see it, like the pictures. Kept in
// data/images/pages (safe to delete; pages are drawn again when needed).
export const GET = route<{ params: Promise<{ id: string }> }>(async (req: NextRequest, ctx) => {
  if (!isKioskRequest(req) && !(await teacherFromRequest(req))) return new Response('Not allowed', { status: 403 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1) return new Response('Not found', { status: 404 });
  const job = await pageJob(id, 'child');
  if (!job) return new Response('Not found', { status: 404 });

  // Named after what is on the page, so a change (words, language, paper) draws it again.
  const format = printerState().format ?? '4x6';
  const hash = crypto.createHash('sha1').update(JSON.stringify([job, format])).digest('hex').slice(0, 10);
  const file = path.join(env.PAGE_DIR, `${id}-${hash}.png`);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await fs.readFile(file));
  } catch {
    try {
      bytes = await renderPage(job);
    } catch {
      // The screens show the picture instead.
      return new Response('The printer service is not running.', { status: 503 });
    }
    await fs.mkdir(env.PAGE_DIR, { recursive: true });
    await fs.writeFile(file, bytes);
  }
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' },
  });
});
