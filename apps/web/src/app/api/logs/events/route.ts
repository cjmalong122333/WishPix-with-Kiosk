import { logEvents } from '@/server/insights';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';
import { pageOf, rangeOf } from '../query';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async (req) =>
  json(await logEvents({ range: rangeOf(req), group: req.nextUrl.searchParams.get('group'), ...pageOf(req) }))
);
