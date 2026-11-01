import { kioskInfo, renameKiosk, setBrightness } from '@/server/kiosk';
import { storageUsage } from '@/server/history';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { body, fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

// Kiosk Management page.
export const GET = teacherRoute(async () => json({ ...(await kioskInfo()), storage: await storageUsage() }));

export const PATCH = teacherRoute(async (req, teacher) => {
  const b = await body(req);
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 40);
    if (!name) return fail('Give the kiosk a name.');
    await renameKiosk(name);
    await logEvent('kiosk_rename', { name }, teacher.id);
  }
  if (b.brightness !== undefined) await setBrightness(Number(b.brightness) || 100);
  return json(await kioskInfo());
});
