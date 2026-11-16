import { playSound } from '@/server/kiosk';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

// Plays a chime on the kiosk screen and says whether it was heard:
// { played: true }, or { played: false, reason: 'no_kiosk' | 'muted' | 'blocked' }.
export const POST = teacherRoute(async () => {
  const answers = await playSound('test');
  if (!answers.length) return json({ played: false, reason: 'no_kiosk' });
  if (answers.some((a) => a?.played)) return json({ played: true });
  return json({ played: false, reason: answers.find((a) => a?.reason)?.reason ?? 'blocked' });
});
