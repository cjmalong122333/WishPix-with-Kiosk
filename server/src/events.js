import { db } from './db.js';

// Teacher and system actions for the Activity Logs page. Details are kept as
// JSON, not sentences, so the Teacher App can word each event in English or
// Filipino.
//
// Types: login, logout, session_start, session_pause, session_resume,
// session_end, moderation_keep, moderation_override, print_reprint,
// print_retry, printer_refill, printer_ink, printer_clear, printer_test,
// printer_simulate, kiosk_restart, kiosk_sleep, kiosk_wake, kiosk_rename,
// settings_change, password_change, profile_change, report_create.

const insert = db.prepare('INSERT INTO events (type, data, teacher_id) VALUES (?, ?, ?)');

export function logEvent(type, data = {}, teacherId = null) {
  insert.run(type, JSON.stringify(data), teacherId);
}

// Filter groups on the Activity Logs page.
export const EVENT_GROUPS = {
  sessions: "e.type LIKE 'session\\_%' ESCAPE '\\'",
  moderation: "e.type LIKE 'moderation\\_%' ESCAPE '\\'",
  printing: "e.type LIKE 'print%'",
  kiosk: "e.type LIKE 'kiosk\\_%' ESCAPE '\\'",
  account: "e.type IN ('login','logout','settings_change','password_change','profile_change','report_create')",
};
