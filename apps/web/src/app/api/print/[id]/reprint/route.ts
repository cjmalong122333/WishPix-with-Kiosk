import { reprint } from '@/server/kiosk';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { fail, idParam, json } from '@/server/http';

export const POST = teacherRoute<{ params: Promise<{ id: string }> }>(async (_req, teacher, ctx) => {
  const id = await idParam(ctx);
  if (!id) return fail('That picture was not found.', 404);
  const error = await reprint(id);
  if (error) return fail(error, 409);
  await logEvent('print_reprint', { requestId: id }, teacher.id);
  return json({ ok: true });
});
