import { deleteReport, getReport } from '@/server/insights';
import { teacherRoute } from '@/server/auth';
import { fail, idParam, json } from '@/server/http';

type Ctx = { params: Promise<{ id: string }> };

export const GET = teacherRoute<Ctx>(async (_req, _teacher, ctx) => {
  const id = await idParam(ctx);
  const report = id && (await getReport(id));
  if (!report) return fail('That report was not found.', 404);
  return json({ report });
});

export const DELETE = teacherRoute<Ctx>(async (_req, _teacher, ctx) => {
  const id = await idParam(ctx);
  if (!id || !(await deleteReport(id))) return fail('That report was not found.', 404);
  return json({ ok: true });
});
