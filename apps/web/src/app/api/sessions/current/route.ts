import { currentSession } from '@/server/kiosk';
import { sessionCounts, sessionRequests } from '@/server/history';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

// Everything that happened in the running session, for the Live Session page.
export const GET = teacherRoute(async () => {
  const session = await currentSession();
  if (!session) return json({ session: null });
  const [requests, counts] = await Promise.all([sessionRequests(session.id), sessionCounts(session.id)]);
  return json({ session, requests, counts });
});
