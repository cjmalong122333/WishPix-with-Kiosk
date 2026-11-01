import { prisma, sql, sqlOne } from './db';
import { CATEGORIES } from './safety';

// Requests the safety checks blocked. A teacher reviews each one in the
// Moderation Center: Keep Blocked, or Override to make the picture anyway.

const SELECT = `
  SELECT r.id, r.session_id, r.queue_number, r.recognized_text, r.language, r.status, r.block_match, r.block_source,
         r.block_category, r.block_reason, r.moderation_status, r.moderated_at, r.created_at,
         r.image_file, r.print_status,
         s.theme, s.activity_type, s.activity_subtype, s.safety_level, s.status AS session_status,
         t.display_name AS moderated_by_name
  FROM requests r
  JOIN sessions s ON s.id = r.session_id
  LEFT JOIN teachers t ON t.id = r.moderated_by
  WHERE r.block_category IS NOT NULL`;

export type ModerationItem = Record<string, unknown> & { id: number; recognized_text: string };

const toItem = (row: Record<string, unknown>) =>
  ({
    ...row,
    category_name: CATEGORIES[row.block_category as string] ?? row.block_category,
    image_url: row.image_file ? `/images/${row.image_file}` : null,
  }) as unknown as ModerationItem;

export async function listModeration(view: string | null) {
  const rows =
    view === 'reviewed'
      ? await sql(`${SELECT} AND r.moderation_status IN ('kept_blocked','overridden') ORDER BY r.moderated_at DESC, r.id DESC LIMIT 100`)
      : await sql(`${SELECT} AND r.moderation_status = 'pending' ORDER BY r.id DESC`);
  return rows.map(toItem);
}

export async function getModerationItem(id: number) {
  const row = await sqlOne(`${SELECT} AND r.id = @id`, { id });
  return row ? toItem(row) : null;
}

export const pendingCount = () => prisma.request.count({ where: { moderationStatus: 'pending' } });

const today = (col: string) => `date(${col}, 'localtime') = date('now', 'localtime')`;

// Numbers for the cards at the top of the Moderation Center (local time).
export async function moderationSummary() {
  const row = await sqlOne<Record<string, number>>(`
    SELECT COALESCE(SUM(moderation_status = 'pending'), 0) AS pending,
           COALESCE(SUM(block_category IS NOT NULL AND ${today('created_at')}), 0) AS blockedToday,
           COALESCE(SUM(moderation_status = 'kept_blocked' AND ${today('moderated_at')}), 0) AS keptToday,
           COALESCE(SUM(moderation_status = 'overridden' AND ${today('moderated_at')}), 0) AS overriddenToday
    FROM requests`);
  return row;
}

export async function markReviewed(id: number, decision: 'kept_blocked' | 'overridden', teacherId: number) {
  const { count } = await prisma.request.updateMany({
    where: { id, moderationStatus: 'pending' },
    data: { moderationStatus: decision, moderatedAt: new Date(), moderatedBy: teacherId },
  });
  return count > 0;
}
