import { restartKiosk, sleepKiosk, wakeKiosk } from '@/server/kiosk';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { fail, json } from '@/server/http';

// Teacher controls for the kiosk screen: restart (reload), sleep, wake.
export const POST = teacherRoute<{ params: Promise<{ action: string }> }>(async (_req, teacher, ctx) => {
  switch ((await ctx.params).action) {
    case 'restart':
      await logEvent('kiosk_restart', {}, teacher.id);
      restartKiosk();
      return json({ ok: true });
    case 'sleep':
      if (!sleepKiosk()) return fail('A child is using the kiosk. Try again when it is free.', 409);
      await logEvent('kiosk_sleep', {}, teacher.id);
      return json({ ok: true });
    case 'wake':
      await logEvent('kiosk_wake', {}, teacher.id);
      wakeKiosk();
      return json({ ok: true });
    default:
      return fail('Unknown action.', 404);
  }
});
