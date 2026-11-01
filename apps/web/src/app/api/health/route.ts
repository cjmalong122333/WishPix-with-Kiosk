import { prisma } from '@/server/db';
import { checkInternet } from '@/server/ai/image';
import { ensureRuntime, kioskOnline } from '@/server/kiosk';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';

// System check on the Teacher App welcome screen (also used by monitoring).
export const GET = route(async () => {
  await ensureRuntime();
  let database = true;
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch {
    database = false;
  }
  return json({ internet: await checkInternet(), database, kiosk: kioskOnline() });
});
