import { createReport, listReports, REPORT_TYPES } from '@/server/insights';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { body, fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async () => json({ reports: await listReports() }));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

export const POST = teacherRoute(async (req, teacher) => {
  const b = await body(req);
  const type = String(b.type ?? '');
  const [date, from, to] = [dateOrNull(b.date), dateOrNull(b.from), dateOrNull(b.to)];
  if (!REPORT_TYPES.includes(type)) return fail('Choose a report type.');
  if ([date, from, to].some((d) => d !== null && !DATE.test(d))) return fail('Choose a valid date.');
  if (type === 'session' && !b.sessionId) return fail('Choose a session.');
  if (from && to && from > to) return fail('The start date must be before the end date.');
  const report = await createReport(type, { date: date ?? undefined, sessionId: Number(b.sessionId) || undefined, from, to });
  if (!report) return fail('That session was not found.', 404);
  await logEvent('report_create', { reportId: report.id, reportType: type }, teacher.id);
  return json({ report });
});
