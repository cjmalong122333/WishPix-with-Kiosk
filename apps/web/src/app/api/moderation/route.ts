import { listModeration, moderationSummary } from '@/server/moderation';
import { isQueuedOverride } from '@/server/kiosk';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

// ?view=pending (default) or ?view=reviewed
export const GET = teacherRoute(async (req) => {
  const [items, summary] = await Promise.all([listModeration(req.nextUrl.searchParams.get('view')), moderationSummary()]);
  return json({ items: items.map((i) => ({ ...i, queued: isQueuedOverride(i.id) })), summary });
});
