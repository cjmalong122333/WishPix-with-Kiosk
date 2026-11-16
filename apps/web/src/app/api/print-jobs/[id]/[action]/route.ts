import { teacherRoute } from '@/server/auth';
import { logEvent } from '@/server/events';
import { fail, json } from '@/server/http';
import { broadcast } from '@/server/kiosk';
import { cancelJob, retryJob } from '@/server/teacher-print';

// Print to Kiosk: cancel a job that has not started, or retry a failed one.
export const POST = teacherRoute<{ params: Promise<{ id: string; action: string }> }>(async (_req, teacher, ctx) => {
  const { id: raw, action } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) return fail('That print job was not found.', 404);
  if (action === 'cancel') {
    if (!(await cancelJob(id))) return fail('Only a job that has not started printing can be cancelled.', 409);
    await logEvent('print_teacher_cancel', { jobId: id }, teacher.id);
  } else if (action === 'retry') {
    const error = await retryJob(id);
    if (error) return fail(error, 409);
    await logEvent('print_teacher_retry', { jobId: id }, teacher.id);
  } else {
    return fail('Unknown action.', 404);
  }
  await broadcast();
  return json({ ok: true });
});
