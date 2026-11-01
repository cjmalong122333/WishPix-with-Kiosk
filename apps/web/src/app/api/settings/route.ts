import { readSettings, updateSettings } from '@/server/settings';
import { broadcast } from '@/server/kiosk';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { body, fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async () => json({ settings: await readSettings() }));

export const PATCH = teacherRoute(async (req, teacher) => {
  const result = await updateSettings(await body(req));
  if ('error' in result) return fail(result.error);
  if (result.changed.length) {
    await logEvent('settings_change', { keys: result.changed }, teacher.id);
    await broadcast();
  }
  return json({ settings: await readSettings() });
});
