import { currentSession, endSession, pauseSession, publicState, resumeSession } from '@/server/kiosk';
import { logEvent, type EventType } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { fail, json } from '@/server/http';

const ACTIONS: Record<string, [() => Promise<void>, EventType]> = {
  pause: [pauseSession, 'session_pause'],
  resume: [resumeSession, 'session_resume'],
  end: [endSession, 'session_end'],
};

export const POST = teacherRoute<{ params: Promise<{ action: string }> }>(async (_req, teacher, ctx) => {
  const entry = ACTIONS[(await ctx.params).action];
  if (!entry) return fail('Unknown action.', 404);
  const [run, type] = entry;
  const s = await currentSession();
  if (s) await logEvent(type, { sessionId: s.id, theme: s.theme }, teacher.id);
  await run();
  return json(await publicState());
});
