import { getModerationItem } from '@/server/moderation';
import { isQueuedOverride, keepBlocked, overrideRequest } from '@/server/kiosk';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { fail, json } from '@/server/http';

type Ctx = { params: Promise<{ id: string; decision: string }> };

const withQueue = async (id: number) => {
  const item = await getModerationItem(id);
  return item && { ...item, queued: isQueuedOverride(id) };
};

// Keep Blocked or Override a request the safety checks stopped.
export const POST = teacherRoute<Ctx>(async (_req, teacher, ctx) => {
  const { id: raw, decision } = await ctx.params;
  const id = Number(raw);
  const item = Number.isInteger(id) ? await getModerationItem(id) : null;
  if (!item) return fail('That request was not found.', 404);

  if (decision === 'keep') {
    if (!(await keepBlocked(id, teacher.id))) return fail('This request was already reviewed.', 409);
    await logEvent('moderation_keep', { requestId: id, text: item.recognized_text }, teacher.id);
    return json({ item: await withQueue(id) });
  }
  if (decision === 'override') {
    const outcome = await overrideRequest(id, teacher.id);
    if (!outcome) return fail('This request was already reviewed.', 409);
    await logEvent('moderation_override', { requestId: id, text: item.recognized_text, outcome }, teacher.id);
    return json({ outcome, item: await withQueue(id) });
  }
  return fail('Unknown decision.', 404);
});
