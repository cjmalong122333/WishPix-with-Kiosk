import { printHistory, printSummary } from '@/server/history';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async (req) => {
  const [items, summary] = await Promise.all([printHistory(req.nextUrl.searchParams.get('view')), printSummary()]);
  return json({ items, summary });
});
