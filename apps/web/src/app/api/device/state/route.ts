import { publicState } from '@/server/kiosk';
import { sttAvailable } from '@/server/ai/stt';
import { json, kioskRoute } from '@/server/http';

export const dynamic = 'force-dynamic';

// The kiosk screen's own copy of the live state, loaded on (re)connect.
export const GET = kioskRoute(async () => json({ ...(await publicState()), speech: { server: sttAvailable() } }));
