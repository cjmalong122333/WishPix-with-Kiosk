import { prisma, sql, sqlOne, type Row } from './db';
import { EVENT_GROUPS } from './events';
import { parseJson } from './json';

// Activity Logs, Analytics and Reports. All dates are the kiosk's local
// dates (times are stored in UTC, so every comparison converts with 'localtime').

type Range = string | { from?: string | null; to?: string | null } | null | undefined;
type DayRange = { from: string | null; to: string | null };

// range: 'today' | '7d' | '30d' | 'all', or { from, to } as 'YYYY-MM-DD'.
export async function resolveRange(range: Range): Promise<DayRange> {
  if (range && typeof range === 'object') return { from: range.from ?? null, to: range.to ?? null };
  const days = ({ today: 0, '7d': 6, '30d': 29 } as Record<string, number>)[range ?? ''];
  if (days === undefined) return { from: null, to: null };
  return sqlOne<DayRange>(`SELECT date('now', 'localtime', '-${days} days') AS "from", date('now', 'localtime') AS "to"`);
}

// Every query binds @from, @to and @sessionId, so filters can be left empty (null).
const inRange = (col: string) =>
  `(@from IS NULL OR date(${col}, 'localtime') >= @from) AND (@to IS NULL OR date(${col}, 'localtime') <= @to)`;
const R = `${inRange('r.created_at')} AND (@sessionId IS NULL OR r.session_id = @sessionId)`;

const REQUEST_COLUMNS = `r.id, r.session_id, r.queue_number, r.recognized_text, r.language, r.status, r.block_category,
  r.block_match, r.block_reason, r.block_source, r.moderation_status, r.image_file, r.image_provider, r.label_en, r.label_fil,
  r.print_status, r.print_error, r.reprint_count, r.created_at, r.generated_at,
  datetime(r.created_at, 'localtime') AS local_time,
  s.theme, s.activity_type, s.activity_subtype, s.safety_level`;

const withImage = (row: Row) => ({ ...row, image_url: row.image_file ? `/images/${row.image_file}` : null });

// ---------- Activity Logs ----------

const STATUS_FILTERS: Record<string, string> = {
  printed: "r.print_status = 'printed'",
  not_printed: "r.status = 'success' AND r.print_status != 'printed'",
  blocked: 'r.block_category IS NOT NULL',
  failed: "r.status = 'failed'",
};

type RequestFilters = { range: Range; status?: string | null; q?: string | null };

async function requestFilter({ range, status, q }: RequestFilters) {
  const where = `${R} AND ${STATUS_FILTERS[status ?? ''] ?? '1'} AND (@q IS NULL OR r.recognized_text LIKE @q ESCAPE '\\')`;
  const text = String(q ?? '').trim();
  const params = { ...(await resolveRange(range)), sessionId: null, q: text ? `%${text.replace(/[\\%_]/g, '\\$&')}%` : null };
  return { where, params };
}

export async function logRequests({ range, status, q, limit = 30, offset = 0 }: RequestFilters & { limit?: number; offset?: number }) {
  const { where, params } = await requestFilter({ range, status, q });
  const from = 'FROM requests r JOIN sessions s ON s.id = r.session_id';
  const total = await sqlOne<{ n: number }>(`SELECT COUNT(*) AS n ${from} WHERE ${where}`, params);
  const items = await sql(`SELECT ${REQUEST_COLUMNS} ${from} WHERE ${where} ORDER BY r.id DESC LIMIT @limit OFFSET @offset`, {
    ...params,
    limit,
    offset,
  });
  return { total: total.n, items: items.map(withImage) };
}

const CSV_COLUMNS = [
  ['local_time', 'Time'], ['session_id', 'Session'], ['queue_number', 'Child #'], ['recognized_text', 'Said'],
  ['language', 'Language'], ['activity_type', 'Activity'], ['activity_subtype', 'Activity type'], ['theme', 'Theme'],
  ['safety_level', 'Safety level'], ['status', 'Status'], ['block_category', 'Blocked for'], ['block_match', 'Blocked word'],
  ['moderation_status', 'Teacher review'], ['print_status', 'Print'], ['reprint_count', 'Reprints'],
] as const;
const csvCell = (v: unknown) => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export async function requestsCsv(filters: RequestFilters) {
  const { where, params } = await requestFilter(filters);
  const rows = await sql(`SELECT ${REQUEST_COLUMNS} FROM requests r JOIN sessions s ON s.id = r.session_id WHERE ${where} ORDER BY r.id`, params);
  const lines = [CSV_COLUMNS.map(([, h]) => h), ...rows.map((row) => CSV_COLUMNS.map(([k]) => row[k]))];
  // The byte-order mark makes Excel open the Filipino letters (ñ) correctly.
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
}

export async function logEvents({ range, group, limit = 40, offset = 0 }: { range: Range; group?: string | null; limit?: number; offset?: number }) {
  const where = `${inRange('e.created_at')} AND ${EVENT_GROUPS[group ?? ''] ?? '1'}`;
  const params = await resolveRange(range);
  const total = await sqlOne<{ n: number }>(`SELECT COUNT(*) AS n FROM events e WHERE ${where}`, params);
  const items = await sql(
    `SELECT e.id, e.type, e.data, e.created_at, t.display_name AS teacher
     FROM events e LEFT JOIN teachers t ON t.id = e.teacher_id
     WHERE ${where} ORDER BY e.id DESC LIMIT @limit OFFSET @offset`,
    { ...params, limit, offset }
  );
  return { total: total.n, items: items.map((e) => ({ ...e, data: parseJson(e.data as string, {}) })) };
}

// ---------- Analytics ----------

const MAX_DAYS = 90;
const today = async () => (await sqlOne<{ d: string }>("SELECT date('now', 'localtime') AS d")).d;

function dayList(from: string, to: string) {
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days.slice(-MAX_DAYS);
}

type DayStat = { day: string; requests: number; pictures: number; blocked: number; failed: number };

// Numbers and breakdowns for a date range and/or one session.
export async function stats({ range, sessionId = null }: { range?: Range; sessionId?: number | null }) {
  const p = { ...(await resolveRange(range)), sessionId };
  const one = <T = Row>(q: string) => sqlOne<T>(q, p);
  const all = <T = Row>(q: string) => sql<T>(q, p);

  const totals = await one<Record<string, number | null>>(`
    SELECT COUNT(*) AS requests,
           COALESCE(SUM(status = 'success'), 0) AS pictures,
           COALESCE(SUM(block_category IS NOT NULL), 0) AS blocked,
           COALESCE(SUM(status = 'failed'), 0) AS failed,
           COALESCE(SUM(print_status = 'printed'), 0) + COALESCE(SUM(reprint_count), 0) AS pages,
           COALESCE(SUM(reprint_count), 0) AS reprints,
           COALESCE(SUM(moderation_status = 'pending'), 0) AS pending,
           COALESCE(SUM(moderation_status = 'kept_blocked'), 0) AS kept,
           COALESCE(SUM(moderation_status = 'overridden'), 0) AS overridden,
           AVG(CASE WHEN generated_at IS NOT NULL THEN (julianday(generated_at) - julianday(created_at)) * 86400 END) AS avgSeconds
    FROM requests r WHERE ${R}`);
  totals.avgSeconds = totals.avgSeconds == null ? null : Math.round(totals.avgSeconds);
  totals.sessions = sessionId
    ? 1
    : (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM sessions s WHERE ${inRange('s.started_at')} AND @sessionId IS NULL`)).n;

  const byDay = await all<DayStat>(`
    SELECT date(r.created_at, 'localtime') AS day, COUNT(*) AS requests,
           SUM(status = 'success') AS pictures, SUM(block_category IS NOT NULL) AS blocked, SUM(status = 'failed') AS failed
    FROM requests r WHERE ${R} GROUP BY day`);
  const first = p.from ?? byDay.map((d) => d.day).sort()[0] ?? (await today());
  const found = new Map(byDay.map((d) => [d.day, d]));
  const perDay = sessionId
    ? byDay
    : dayList(first, p.to ?? (await today())).map((day) => found.get(day) ?? { day, requests: 0, pictures: 0, blocked: 0, failed: 0 });

  const hourRows = await all<{ hour: number; n: number }>(
    `SELECT CAST(strftime('%H', r.created_at, 'localtime') AS INTEGER) AS hour, COUNT(*) AS n FROM requests r WHERE ${R} GROUP BY hour`
  );
  const hours = Array.from({ length: 24 }, (_, h) => hourRows.find((x) => x.hour === h)?.n ?? 0);

  return {
    range: { from: p.from, to: p.to },
    totals,
    perDay,
    hours,
    themes: await all(`SELECT s.theme, COUNT(*) AS n FROM requests r JOIN sessions s ON s.id = r.session_id
                       WHERE ${R} AND r.status = 'success' GROUP BY s.theme ORDER BY n DESC LIMIT 8`),
    activities: await all(`SELECT s.activity_type, s.activity_subtype, COUNT(*) AS n FROM requests r JOIN sessions s ON s.id = r.session_id
                           WHERE ${R} GROUP BY s.activity_type, s.activity_subtype ORDER BY n DESC`),
    categories: await all(`SELECT block_category AS category, COUNT(*) AS n FROM requests r
                           WHERE ${R} AND block_category IS NOT NULL GROUP BY block_category ORDER BY n DESC`),
    languages: await all(`SELECT COALESCE(language, 'unknown') AS language, COUNT(*) AS n FROM requests r WHERE ${R} GROUP BY 1 ORDER BY n DESC`),
  };
}

// ---------- Reports ----------

export function sessionList() {
  return sql(
    `SELECT s.id, s.theme, s.activity_type, s.activity_subtype, s.safety_level, s.status, s.started_at, s.ended_at,
            (SELECT COUNT(*) FROM requests WHERE session_id = s.id) AS requests
     FROM sessions s ORDER BY s.id DESC LIMIT 60`
  );
}

const sessionRequestList = async (where: string, params: Record<string, unknown>) =>
  (await sql(`SELECT ${REQUEST_COLUMNS} FROM requests r JOIN sessions s ON s.id = r.session_id WHERE ${where} ORDER BY r.id LIMIT 300`, params)).map(
    withImage
  );

type ReportParams = { date?: string; sessionId?: number; from?: string | null; to?: string | null };

const BUILDERS: Record<string, (p: ReportParams) => Promise<Record<string, unknown> | null>> = {
  // One day: everything that happened, plus each session run that day.
  async daily({ date }) {
    const day = date ?? (await today());
    return {
      params: { date: day },
      ...(await stats({ range: { from: day, to: day } })),
      sessions: await sql(
        `SELECT s.id, s.theme, s.activity_type, s.activity_subtype, s.safety_level, s.started_at, s.ended_at,
                (SELECT COUNT(*) FROM requests WHERE session_id = s.id) AS requests,
                (SELECT COUNT(*) FROM requests WHERE session_id = s.id AND status = 'success') AS pictures
         FROM sessions s WHERE date(s.started_at, 'localtime') = @day ORDER BY s.id`,
        { day }
      ),
    };
  },

  async session({ sessionId }) {
    if (!sessionId) return null;
    const session = await sqlOne(
      `SELECT s.*, t.display_name AS teacher FROM sessions s JOIN teachers t ON t.id = s.teacher_id WHERE s.id = @sessionId`,
      { sessionId }
    );
    if (!session) return null;
    session.languages = parseJson(session.languages as string, []);
    session.blocked_words = parseJson(session.blocked_words as string, []);
    session.allowed_words = parseJson(session.allowed_words as string, []);
    return {
      params: { sessionId },
      session,
      ...(await stats({ sessionId })),
      requests: await sessionRequestList('r.session_id = @sessionId', { sessionId }),
    };
  },

  // How the safety checks did over a date range (default: the last 7 days).
  async safety({ from, to }) {
    const range = from || to ? { from, to } : await resolveRange('7d');
    const p = { ...(await resolveRange(range)), sessionId: null };
    const s = await stats({ range });
    return {
      params: range,
      range: s.range,
      totals: s.totals,
      categories: s.categories,
      byLevel: await sql(
        `SELECT s.safety_level AS level, COUNT(*) AS requests, SUM(r.block_category IS NOT NULL) AS blocked
         FROM requests r JOIN sessions s ON s.id = r.session_id WHERE ${R} GROUP BY s.safety_level`,
        p
      ),
      topWords: await sql(
        `SELECT block_match AS word, block_category AS category, COUNT(*) AS n FROM requests r
         WHERE ${R} AND block_match IS NOT NULL GROUP BY block_match, block_category ORDER BY n DESC LIMIT 10`,
        p
      ),
      blocked: await sessionRequestList(`${R} AND r.block_category IS NOT NULL`, p),
    };
  },
};

export const REPORT_TYPES = Object.keys(BUILDERS);

// Builds a report and saves a snapshot of it. Returns null if there is nothing to report on.
export async function createReport(type: string, params: ReportParams = {}) {
  const data = await BUILDERS[type](params);
  if (!data) return null;
  const report = await prisma.report.create({ data: { type, data: JSON.stringify(data) } });
  return getReport(report.id);
}

export async function getReport(id: number) {
  const row = await prisma.report.findUnique({ where: { id } });
  return row && { id: row.id, type: row.type, created_at: row.createdAt.toISOString(), data: parseJson<Record<string, unknown>>(row.data, {}) };
}

export async function listReports() {
  const rows = await sql("SELECT id, type, created_at, json_extract(data, '$.params') AS params FROM reports ORDER BY id DESC LIMIT 50");
  return rows.map((r) => ({ ...r, params: parseJson(r.params as string, {}) }));
}

export const deleteReport = async (id: number) => (await prisma.report.deleteMany({ where: { id } })).count > 0;
