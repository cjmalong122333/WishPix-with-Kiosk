import { db } from './db.js';
import { EVENT_GROUPS } from './events.js';

// Activity Logs, Analytics and Reports. All dates are the laptop's local
// dates (SQLite stores UTC, so every comparison converts with 'localtime').

// range: 'today' | '7d' | '30d' | 'all', or { from, to } as 'YYYY-MM-DD'.
export function resolveRange(range) {
  if (range && typeof range === 'object') return { from: range.from ?? null, to: range.to ?? null };
  const days = { today: 0, '7d': 6, '30d': 29 }[range];
  if (days === undefined) return { from: null, to: null };
  return db.prepare(`SELECT date('now', 'localtime', '-${days} days') AS "from", date('now', 'localtime') AS "to"`).get();
}

// Every query binds @from, @to and @sessionId, so filters can be left empty (null).
const inRange = (col) => `(@from IS NULL OR date(${col}, 'localtime') >= @from) AND (@to IS NULL OR date(${col}, 'localtime') <= @to)`;
const R = `${inRange('r.created_at')} AND (@sessionId IS NULL OR r.session_id = @sessionId)`;

const REQUEST_COLUMNS = `r.id, r.session_id, r.queue_number, r.recognized_text, r.language, r.status, r.block_category,
  r.block_match, r.block_reason, r.moderation_status, r.image_file, r.print_status, r.print_error, r.reprint_count,
  r.created_at, r.generated_at, datetime(r.created_at, 'localtime') AS local_time,
  s.theme, s.activity_type, s.activity_subtype, s.safety_level`;

const withImage = (row) => ({ ...row, image_url: row.image_file ? `/images/${row.image_file}` : null });

// ---------- Activity Logs ----------

const STATUS_FILTERS = {
  printed: "r.print_status = 'printed'",
  not_printed: "r.status = 'success' AND r.print_status != 'printed'",
  blocked: 'r.block_category IS NOT NULL',
  failed: "r.status = 'failed'",
};

function requestFilter({ range, status, q }) {
  const where = `${R} AND ${STATUS_FILTERS[status] ?? '1'} AND (@q IS NULL OR r.recognized_text LIKE @q ESCAPE '\\')`;
  const text = String(q ?? '').trim();
  const params = { ...resolveRange(range), sessionId: null, q: text ? `%${text.replace(/[\\%_]/g, '\\$&')}%` : null };
  return { where, params };
}

export function logRequests({ range, status, q, limit = 30, offset = 0 }) {
  const { where, params } = requestFilter({ range, status, q });
  const from = 'FROM requests r JOIN sessions s ON s.id = r.session_id';
  return {
    total: db.prepare(`SELECT COUNT(*) AS n ${from} WHERE ${where}`).get(params).n,
    items: db
      .prepare(`SELECT ${REQUEST_COLUMNS} ${from} WHERE ${where} ORDER BY r.id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset })
      .map(withImage),
  };
}

const CSV_COLUMNS = [
  ['local_time', 'Time'], ['session_id', 'Session'], ['queue_number', 'Child #'], ['recognized_text', 'Said'],
  ['language', 'Language'], ['activity_type', 'Activity'], ['activity_subtype', 'Activity type'], ['theme', 'Theme'],
  ['safety_level', 'Safety level'], ['status', 'Status'], ['block_category', 'Blocked for'], ['block_match', 'Blocked word'],
  ['moderation_status', 'Teacher review'], ['print_status', 'Print'], ['reprint_count', 'Reprints'],
];
const csvCell = (v) => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function requestsCsv(filters) {
  const { where, params } = requestFilter(filters);
  const rows = db
    .prepare(`SELECT ${REQUEST_COLUMNS} FROM requests r JOIN sessions s ON s.id = r.session_id WHERE ${where} ORDER BY r.id`)
    .all(params);
  const lines = [CSV_COLUMNS.map(([, h]) => h), ...rows.map((row) => CSV_COLUMNS.map(([k]) => row[k]))];
  // The byte-order mark makes Excel open the Filipino letters (ñ) correctly.
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
}

export function logEvents({ range, group, limit = 40, offset = 0 }) {
  const where = `${inRange('e.created_at')} AND ${EVENT_GROUPS[group] ?? '1'}`;
  const params = resolveRange(range);
  return {
    total: db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${where}`).get(params).n,
    items: db
      .prepare(
        `SELECT e.id, e.type, e.data, e.created_at, t.display_name AS teacher
         FROM events e LEFT JOIN teachers t ON t.id = e.teacher_id
         WHERE ${where} ORDER BY e.id DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset })
      .map((e) => ({ ...e, data: JSON.parse(e.data) })),
  };
}

// ---------- Analytics ----------

const MAX_DAYS = 90;
const today = () => db.prepare("SELECT date('now', 'localtime') AS d").get().d;

function dayList(from, to) {
  const days = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days.slice(-MAX_DAYS);
}

// Numbers and breakdowns for a date range and/or one session.
export function stats({ range, sessionId = null }) {
  const p = { ...resolveRange(range), sessionId };
  const one = (sql) => db.prepare(sql).get(p);
  const all = (sql) => db.prepare(sql).all(p);

  const totals = one(`
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
    : one(`SELECT COUNT(*) AS n FROM sessions s WHERE ${inRange('s.started_at')} AND @sessionId IS NULL`).n;

  const byDay = all(`
    SELECT date(r.created_at, 'localtime') AS day, COUNT(*) AS requests,
           SUM(status = 'success') AS pictures, SUM(block_category IS NOT NULL) AS blocked, SUM(status = 'failed') AS failed
    FROM requests r WHERE ${R} GROUP BY day`);
  const first = p.from ?? byDay.map((d) => d.day).sort()[0] ?? today();
  const found = new Map(byDay.map((d) => [d.day, d]));
  const perDay = sessionId
    ? byDay
    : dayList(first, p.to ?? today()).map((day) => found.get(day) ?? { day, requests: 0, pictures: 0, blocked: 0, failed: 0 });

  const hourRows = all(`SELECT CAST(strftime('%H', r.created_at, 'localtime') AS INTEGER) AS hour, COUNT(*) AS n FROM requests r WHERE ${R} GROUP BY hour`);
  const hours = Array.from({ length: 24 }, (_, h) => hourRows.find((x) => x.hour === h)?.n ?? 0);

  return {
    range: { from: p.from, to: p.to },
    totals,
    perDay,
    hours,
    themes: all(`SELECT s.theme, COUNT(*) AS n FROM requests r JOIN sessions s ON s.id = r.session_id
                 WHERE ${R} AND r.status = 'success' GROUP BY s.theme ORDER BY n DESC LIMIT 8`),
    activities: all(`SELECT s.activity_type, s.activity_subtype, COUNT(*) AS n FROM requests r JOIN sessions s ON s.id = r.session_id
                     WHERE ${R} GROUP BY s.activity_type, s.activity_subtype ORDER BY n DESC`),
    categories: all(`SELECT block_category AS category, COUNT(*) AS n FROM requests r
                     WHERE ${R} AND block_category IS NOT NULL GROUP BY block_category ORDER BY n DESC`),
    languages: all(`SELECT COALESCE(language, 'unknown') AS language, COUNT(*) AS n FROM requests r WHERE ${R} GROUP BY 1 ORDER BY n DESC`),
  };
}

// ---------- Reports ----------

export function sessionList() {
  return db
    .prepare(
      `SELECT s.id, s.theme, s.activity_type, s.activity_subtype, s.safety_level, s.status, s.started_at, s.ended_at,
              (SELECT COUNT(*) FROM requests WHERE session_id = s.id) AS requests
       FROM sessions s ORDER BY s.id DESC LIMIT 60`
    )
    .all();
}

const sessionRequestList = (where, params) =>
  db
    .prepare(`SELECT ${REQUEST_COLUMNS} FROM requests r JOIN sessions s ON s.id = r.session_id WHERE ${where} ORDER BY r.id LIMIT 300`)
    .all(params)
    .map(withImage);

const BUILDERS = {
  // One day: everything that happened, plus each session run that day.
  daily({ date = today() }) {
    const range = { from: date, to: date };
    return {
      params: { date },
      ...stats({ range }),
      sessions: db
        .prepare(
          `SELECT s.id, s.theme, s.activity_type, s.activity_subtype, s.safety_level, s.started_at, s.ended_at,
                  (SELECT COUNT(*) FROM requests WHERE session_id = s.id) AS requests,
                  (SELECT COUNT(*) FROM requests WHERE session_id = s.id AND status = 'success') AS pictures
           FROM sessions s WHERE date(s.started_at, 'localtime') = ? ORDER BY s.id`
        )
        .all(date),
    };
  },

  session({ sessionId }) {
    const session = db
      .prepare(`SELECT s.*, t.display_name AS teacher FROM sessions s JOIN teachers t ON t.id = s.teacher_id WHERE s.id = ?`)
      .get(sessionId);
    if (!session) return null;
    session.languages = JSON.parse(session.languages);
    session.blocked_words = JSON.parse(session.blocked_words);
    session.allowed_words = JSON.parse(session.allowed_words);
    delete session.join_token;
    return {
      params: { sessionId },
      session,
      ...stats({ sessionId }),
      requests: sessionRequestList('r.session_id = @sessionId', { sessionId }),
    };
  },

  // How the safety filter did over a date range (default: the last 7 days).
  safety({ from, to }) {
    const range = from || to ? { from, to } : resolveRange('7d');
    const p = { ...resolveRange(range), sessionId: null };
    const s = stats({ range });
    return {
      params: range,
      range: s.range,
      totals: s.totals,
      categories: s.categories,
      byLevel: db
        .prepare(
          `SELECT s.safety_level AS level, COUNT(*) AS requests, SUM(r.block_category IS NOT NULL) AS blocked
           FROM requests r JOIN sessions s ON s.id = r.session_id WHERE ${R} GROUP BY s.safety_level`
        )
        .all(p),
      topWords: db
        .prepare(
          `SELECT block_match AS word, block_category AS category, COUNT(*) AS n FROM requests r
           WHERE ${R} AND block_match IS NOT NULL GROUP BY block_match, block_category ORDER BY n DESC LIMIT 10`
        )
        .all(p),
      blocked: sessionRequestList(`${R} AND r.block_category IS NOT NULL`, p),
    };
  },
};

export const REPORT_TYPES = Object.keys(BUILDERS);

// Builds a report and saves a snapshot of it. Returns null if there is nothing to report on.
export function createReport(type, params = {}) {
  const data = BUILDERS[type](params);
  if (!data) return null;
  const id = db.prepare('INSERT INTO reports (type, data) VALUES (?, ?)').run(type, JSON.stringify(data)).lastInsertRowid;
  return getReport(Number(id));
}

export function getReport(id) {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  return row && { ...row, data: JSON.parse(row.data) };
}

export function listReports() {
  return db
    .prepare("SELECT id, type, created_at, json_extract(data, '$.params') AS params FROM reports ORDER BY id DESC LIMIT 50")
    .all()
    .map((r) => ({ ...r, params: JSON.parse(r.params ?? '{}') }));
}

export const deleteReport = (id) => db.prepare('DELETE FROM reports WHERE id = ?').run(id).changes > 0;
