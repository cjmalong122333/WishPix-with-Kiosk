import { sqlOne } from '@/server/db';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

const today = (col: string) => `date(${col}, 'localtime') = date('now', 'localtime')`;

// Today's numbers for the Dashboard summary cards (local time).
export const GET = teacherRoute(async () => {
  const counts = await sqlOne<Record<string, number>>(`
    SELECT (SELECT COUNT(*) FROM sessions WHERE ${today('started_at')}) AS sessionsToday,
           (SELECT COUNT(*) FROM requests WHERE print_status = 'printed' AND ${today('created_at')}) AS printsToday,
           (SELECT COUNT(*) FROM requests WHERE status = 'success' AND ${today('created_at')}) AS generatedToday`);
  const top = await sqlOne<{ theme: string; n: number } | undefined>(
    `SELECT s.theme, COUNT(*) AS n FROM requests r JOIN sessions s ON s.id = r.session_id
     WHERE r.status = 'success' AND ${today('r.created_at')}
     GROUP BY s.theme ORDER BY n DESC LIMIT 1`
  );
  return json({ ...counts, topTheme: top ? { theme: top.theme, count: top.n } : null });
});
