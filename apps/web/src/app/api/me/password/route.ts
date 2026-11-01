import { NextResponse } from 'next/server';
import { changePassword, setSessionCookie, teacherRoute } from '@/server/auth';
import { signToken } from '@/server/auth-token';
import { logEvent } from '@/server/events';
import { body, fail } from '@/server/http';

// Changing the password signs out every other device; this one gets a fresh sign-in.
export const POST = teacherRoute(async (req, teacher) => {
  const b = await body(req);
  const error = await changePassword(teacher, String(b.current ?? ''), String(b.next ?? ''));
  if (error) return fail(error);
  await logEvent('password_change', {}, teacher.id);
  const token = await signToken({ teacherId: teacher.id, ver: teacher.tokenVersion + 1 });
  return setSessionCookie(NextResponse.json({ ok: true }), token, req);
});
