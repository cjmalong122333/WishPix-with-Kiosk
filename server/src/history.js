import fs from 'node:fs';
import path from 'node:path';
import { db, IMAGE_DIR } from './db.js';
import { CATEGORIES } from './safety.js';
import { PROBLEMS } from './printer.js';

// Read-only lists of past requests for the Live Session and Print
// Management pages.

const toItem = (row) => ({
  ...row,
  sheet: row.sheet ? JSON.parse(row.sheet) : null,
  image_url: row.image_file ? `/images/${row.image_file}` : null,
  category_name: row.block_category ? CATEGORIES[row.block_category] ?? row.block_category : null,
  print_error_text: row.print_error ? PROBLEMS[row.print_error] ?? row.print_error : null,
});

const REQUEST_COLUMNS = `r.id, r.session_id, r.queue_number, r.recognized_text, r.status, r.block_category,
  r.block_reason, r.block_match, r.moderation_status, r.image_file, r.sheet, r.print_status, r.print_error, r.printed_at,
  r.reprint_count, r.created_at`;

export function sessionRequests(sessionId) {
  return db
    .prepare(`SELECT ${REQUEST_COLUMNS} FROM requests r WHERE r.session_id = ? ORDER BY r.id DESC`)
    .all(sessionId)
    .map(toItem);
}

export function sessionCounts(sessionId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS requests,
              COALESCE(SUM(status = 'success'), 0) AS pictures,
              COALESCE(SUM(block_category IS NOT NULL), 0) AS blocked,
              COALESCE(SUM(status = 'failed'), 0) AS failed,
              COALESCE(SUM(print_status = 'printed'), 0) + COALESCE(SUM(reprint_count), 0) AS pages
       FROM requests WHERE session_id = ?`
    )
    .get(sessionId);
}

// view: 'all' (every finished picture) or 'failed' (prints that did not come out).
export function printHistory(view) {
  const where = view === 'failed' ? "AND r.print_status = 'failed'" : '';
  return db
    .prepare(
      `SELECT ${REQUEST_COLUMNS}, s.theme, s.activity_type, s.activity_subtype
       FROM requests r JOIN sessions s ON s.id = r.session_id
       WHERE r.status = 'success' ${where}
       ORDER BY r.id DESC LIMIT 60`
    )
    .all()
    .map(toItem);
}

export function printSummary() {
  return db
    .prepare(
      `SELECT COALESCE(SUM(print_status = 'printed' AND date(printed_at, 'localtime') = date('now', 'localtime')), 0) AS printedToday,
              COALESCE(SUM(status = 'success' AND print_status = 'failed'), 0) AS failed
       FROM requests`
    )
    .get();
}

// Real numbers: the generated pictures saved on this laptop.
export function storageUsage() {
  let files = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(IMAGE_DIR)) {
    const stat = fs.statSync(path.join(IMAGE_DIR, name));
    if (stat.isFile()) {
      files += 1;
      bytes += stat.size;
    }
  }
  return { files, bytes };
}
