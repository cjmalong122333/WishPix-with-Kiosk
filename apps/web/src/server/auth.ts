import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Teacher } from '@/generated/prisma/client';
import { prisma } from './db';
import { COOKIE_NAME, TOKEN_HOURS, signToken, verifyToken } from './auth-token';
import { fail, remoteAddress, route } from './http';

export type PublicTeacher = { id: number; username: string; displayName: string };
export const publicTeacher = (t: Teacher): PublicTeacher => ({ id: t.id, username: t.username, displayName: t.displayName });

// Slows down password guessing: 8 wrong tries from one address locks
// sign-in there for 5 minutes.
const MAX_FAILS = 8;
const LOCK_MS = 5 * 60_000;
const g = globalThis as unknown as { __wishpixLoginFails?: Map<string, { count: number; until: number }> };
const fails = (g.__wishpixLoginFails ??= new Map());

export async function login(req: NextRequest, username: string, password: string) {
  const key = remoteAddress(req) ?? 'unknown';
  const entry = fails.get(key);
  if (entry && entry.until > Date.now()) return { ok: false, error: 'Too many tries. Wait 5 minutes and try again.', status: 429 } as const;

  const teacher = await prisma.teacher.findUnique({ where: { username } });
  const ok = !!teacher && (await bcrypt.compare(password, teacher.passwordHash));
  if (!ok || !teacher) {
    const count = (entry?.count ?? 0) + 1;
    fails.set(key, count >= MAX_FAILS ? { count: 0, until: Date.now() + LOCK_MS } : { count, until: 0 });
    return { ok: false, error: 'Incorrect username or password. Try again.', status: 401 } as const;
  }
  fails.delete(key);
  const token = await signToken({ teacherId: teacher.id, ver: teacher.tokenVersion });
  return { ok: true, token, teacher: publicTeacher(teacher) } as const;
}

export function setSessionCookie(res: NextResponse, token: string, req: NextRequest) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // The Teacher App is usually opened over plain http on the daycare Wi-Fi.
    secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: TOKEN_HOURS * 3600,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}

export async function teacherFromRequest(req: NextRequest): Promise<Teacher | null> {
  const claims = await verifyToken(req.cookies.get(COOKIE_NAME)?.value);
  if (!claims) return null;
  const teacher = await prisma.teacher.findUnique({ where: { id: claims.teacherId } });
  return teacher && teacher.tokenVersion === claims.ver ? teacher : null;
}

type Ctx = { params: Promise<Record<string, string>> };
type TeacherHandler<C> = (req: NextRequest, teacher: Teacher, ctx: C) => Promise<Response> | Response;

// Route handler that needs a signed-in teacher.
export function teacherRoute<C = Ctx>(handler: TeacherHandler<C>) {
  return route<C>(async (req, ctx) => {
    const teacher = await teacherFromRequest(req);
    if (!teacher) return fail('Please sign in again.', 401);
    return handler(req, teacher, ctx);
  });
}

// Returns an error message, or null when the password was changed.
export async function changePassword(teacher: Teacher, current: string, next: string) {
  if (!(await bcrypt.compare(current, teacher.passwordHash))) return 'Your current password is not correct.';
  if (next.length < 8) return 'The new password needs at least 8 characters.';
  await prisma.teacher.update({
    where: { id: teacher.id },
    data: { passwordHash: await bcrypt.hash(next, 10), tokenVersion: { increment: 1 } },
  });
  return null;
}

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
