import { prisma } from '@/server/db';
import { publicTeacher, teacherRoute } from '@/server/auth';
import { logEvent } from '@/server/events';
import { body, fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async (_req, teacher) => json({ teacher: publicTeacher(teacher) }));

export const PATCH = teacherRoute(async (req, teacher) => {
  const name = String((await body(req)).displayName ?? '').trim().slice(0, 40);
  if (!name) return fail('Type your name.');
  const updated = await prisma.teacher.update({ where: { id: teacher.id }, data: { displayName: name } });
  await logEvent('profile_change', {}, teacher.id);
  return json({ teacher: publicTeacher(updated) });
});
