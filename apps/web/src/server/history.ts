import fs from 'node:fs/promises';
import path from 'node:path';
import { sql, sqlOne } from './db';
import { env } from './env';
import { parseJson } from './json';
import { PROBLEMS } from './printer';
import { CATEGORIES } from './safety';

// Read-only lists of past requests for the Live Session and Print
// Management pages.

const toItem = (row: Record<string, unknown>) => ({
  ...row,
  sheet: parseJson(row.sheet as string | null, null),
  image_url: row.image_file ? `/images/${row.image_file}` : null,
  category_name: row.block_category ? CATEGORIES[row.block_category as string] ?? row.block_category : null,
  print_error_text: row.print_error ? PROBLEMS[row.print_error as string] ?? row.print_error : null,
});

const REQUEST_COLUMNS = `r.id, r.session_id, r.queue_number, r.recognized_text, r.status, r.block_category,
  r.block_reason, r.block_match, r.block_source, r.moderation_status, r.image_file, r.image_provider, r.sheet,
  r.label_en, r.label_fil, r.print_status, r.print_error, r.printed_at, r.reprint_count, r.created_at`;

export async function sessionRequests(sessionId: number) {
  const rows = await sql(`SELECT ${REQUEST_COLUMNS} FROM requests r WHERE r.session_id = @sessionId ORDER BY r.id DESC`, { sessionId });
  return rows.map(toItem);
}

export function sessionCounts(sessionId: number) {
  return sqlOne<Record<string, number>>(
    `SELECT COUNT(*) AS requests,
            COALESCE(SUM(status = 'success'), 0) AS pictures,
            COALESCE(SUM(block_category IS NOT NULL), 0) AS blocked,
            COALESCE(SUM(status = 'failed'), 0) AS failed,
            COALESCE(SUM(print_status = 'printed'), 0) + COALESCE(SUM(reprint_count), 0) AS pages
     FROM requests WHERE session_id = @sessionId`,
    { sessionId }
  );
}

// view: 'all' (every finished picture) or 'failed' (prints that did not come out).
export async function printHistory(view: string | null) {
  const where = view === 'failed' ? "AND r.print_status = 'failed'" : '';
  const rows = await sql(
    `SELECT ${REQUEST_COLUMNS}, s.theme, s.activity_type, s.activity_subtype
     FROM requests r JOIN sessions s ON s.id = r.session_id
     WHERE r.status = 'success' ${where}
     ORDER BY r.id DESC LIMIT 60`
  );
  return rows.map(toItem);
}

// printedToday and failed count children's pictures only; teacherToday is
// the pages teachers printed today with Print to Kiosk ("Teacher Print"),
// counted apart so they never mix with the children's.
export function printSummary() {
  return sqlOne<{ printedToday: number; failed: number; teacherToday: number }>(
    `SELECT COALESCE(SUM(print_status = 'printed' AND date(printed_at, 'localtime') = date('now', 'localtime')), 0) AS printedToday,
            COALESCE(SUM(status = 'success' AND print_status = 'failed'), 0) AS failed,
            (SELECT COALESCE(SUM(sheets_done), 0) FROM print_jobs
              WHERE status = 'done' AND date(printed_at, 'localtime') = date('now', 'localtime')) AS teacherToday
     FROM requests`
  );
}

// The generated pictures saved on the kiosk.
export async function storageUsage() {
  let files = 0;
  let bytes = 0;
  for (const name of await fs.readdir(env.IMAGE_DIR)) {
    const stat = await fs.stat(path.join(env.IMAGE_DIR, name));
    if (stat.isFile()) {
      files += 1;
      bytes += stat.size;
    }
  }
  return { files, bytes };
}
