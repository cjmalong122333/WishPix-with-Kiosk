import { NextResponse } from 'next/server';
import { login, setSessionCookie } from '@/server/auth';
import { logEvent } from '@/server/events';
import { body, fail, route } from '@/server/http';

export const POST = route(async (req) => {
  const b = await body<{ username: string; password: string }>(req);
  const result = await login(req, String(b.username ?? '').trim(), String(b.password ?? ''));
  if (!result.ok) return fail(result.error, result.status);
  await logEvent('login', {}, result.teacher.id);
  return setSessionCookie(NextResponse.json({ teacher: result.teacher }), result.token, req);
});
