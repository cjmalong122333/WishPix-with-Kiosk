import { logRequests } from '@/server/insights';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';
import { pageOf, requestFilters } from '../query';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async (req) => json(await logRequests({ ...requestFilters(req), ...pageOf(req) })));
