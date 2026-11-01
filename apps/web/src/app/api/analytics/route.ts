import { stats } from '@/server/insights';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';
import { rangeOf } from '../logs/query';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async (req) => json(await stats({ range: rangeOf(req) })));
