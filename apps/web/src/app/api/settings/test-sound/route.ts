import { playSound } from '@/server/kiosk';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const POST = teacherRoute(async () => {
  playSound('test');
  return json({ ok: true });
});
