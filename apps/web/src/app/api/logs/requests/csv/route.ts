import { requestsCsv } from '@/server/insights';
import { teacherRoute } from '@/server/auth';
import { requestFilters } from '../../query';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async (req) => {
  const csv = await requestsCsv(requestFilters(req));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="wishpix-requests-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
