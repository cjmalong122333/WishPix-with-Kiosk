import { db } from './db.js';
import { CATEGORIES } from './safety.js';

// Requests the safety filter blocked. A teacher reviews each one in the
// Moderation Center: Keep Blocked, or Override to make the picture anyway.

const SELECT = `
  SELECT r.id, r.session_id, r.queue_number, r.recognized_text, r.language, r.status, r.block_match,
         r.block_category, r.block_reason, r.moderation_status, r.moderated_at, r.created_at,
         r.image_file, r.print_status,
         s.theme, s.activity_type, s.activity_subtype, s.safety_level, s.status AS session_status,
         t.display_name AS moderated_by_name
  FROM requests r
  JOIN sessions s ON s.id = r.session_id
  LEFT JOIN teachers t ON t.id = r.moderated_by
  WHERE r.block_category IS NOT NULL`;

const toItem = (row) => ({
  ...row,
  category_name: CATEGORIES[row.block_category] ?? row.block_category,
  image_url: row.image_file ? `/images/${row.image_file}` : null,
});

export function listModeration(view) {
  const rows =
    view === 'reviewed'
      ? db.prepare(`${SELECT} AND r.moderation_status IN ('kept_blocked','overridden') ORDER BY r.moderated_at DESC, r.id DESC LIMIT 100`).all()
      : db.prepare(`${SELECT} AND r.moderation_status = 'pending' ORDER BY r.id DESC`).all();
  return rows.map(toItem);
}

export const getModerationItem = (id) => {
  const row = db.prepare(`${SELECT} AND r.id = ?`).get(id);
  return row && toItem(row);
};

export const pendingCount = () =>
  db.prepare("SELECT COUNT(*) AS n FROM requests WHERE moderation_status = 'pending'").get().n;

// Numbers for the cards at the top of the Moderation Center (local time).
export function moderationSummary() {
  const today = (col) => `date(${col}, 'localtime') = date('now', 'localtime')`;
  const count = (where) => db.prepare(`SELECT COUNT(*) AS n FROM requests WHERE ${where}`).get().n;
  return {
    pending: pendingCount(),
    blockedToday: count(`block_category IS NOT NULL AND ${today('created_at')}`),
    keptToday: count(`moderation_status = 'kept_blocked' AND ${today('moderated_at')}`),
    overriddenToday: count(`moderation_status = 'overridden' AND ${today('moderated_at')}`),
  };
}

export function markReviewed(id, decision, teacherId) {
  return db
    .prepare(
      `UPDATE requests SET moderation_status = ?, moderated_at = datetime('now'), moderated_by = ?, updated_at = datetime('now')
       WHERE id = ? AND moderation_status = 'pending'`
    )
    .run(decision, teacherId, id).changes > 0;
}
