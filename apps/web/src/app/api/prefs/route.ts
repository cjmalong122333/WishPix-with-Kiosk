import { readSettings } from '@/server/settings';
import { json, route } from '@/server/http';

export const dynamic = 'force-dynamic';

// The screen language before anyone has signed in.
export const GET = route(async () => json({ language: (await readSettings()).language }));
