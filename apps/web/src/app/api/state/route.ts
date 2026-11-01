import { publicState } from '@/server/kiosk';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async () => json(await publicState()));
