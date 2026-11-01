import { NextResponse } from 'next/server';
import { clearSessionCookie, teacherFromRequest } from '@/server/auth';
import { logEvent } from '@/server/events';
import { route } from '@/server/http';

export const POST = route(async (req) => {
  const teacher = await teacherFromRequest(req);
  if (teacher) await logEvent('logout', {}, teacher.id);
  return clearSessionCookie(NextResponse.json({ ok: true }));
});
