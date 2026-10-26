import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedTeachers, seedKiosk } from './seed-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
export const IMAGE_DIR = path.join(DATA_DIR, 'images');
fs.mkdirSync(IMAGE_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'wishpix.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kiosks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    firmware  TEXT NOT NULL,
    last_seen TEXT
  );

  -- One row per activity session started by a teacher.
  CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kiosk_id         INTEGER NOT NULL REFERENCES kiosks(id),
    teacher_id       INTEGER NOT NULL REFERENCES teachers(id),
    activity_type    TEXT NOT NULL,             -- color_create | trace_learn | free_play
    activity_subtype TEXT NOT NULL,
    theme            TEXT NOT NULL,
    safety_level     TEXT NOT NULL,             -- strict | standard | custom
    languages        TEXT NOT NULL,             -- JSON array
    blocked_words    TEXT NOT NULL DEFAULT '[]',-- JSON array
    allowed_words    TEXT NOT NULL DEFAULT '[]',-- JSON array
    status           TEXT NOT NULL,             -- active | paused | ended
    join_token       TEXT,                      -- QR code token; kept so a server restart keeps the same QR
    started_at       TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at         TEXT
  );

  -- One row per child request. No child names are ever stored.
  CREATE TABLE IF NOT EXISTS requests (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        INTEGER NOT NULL REFERENCES sessions(id),
    queue_number      INTEGER NOT NULL,
    original_speech   TEXT NOT NULL,
    recognized_text   TEXT NOT NULL,
    language          TEXT,
    final_prompt      TEXT,
    status            TEXT NOT NULL,            -- processing | blocked | generating | success | failed
    block_category    TEXT,
    block_reason      TEXT,
    moderation_status TEXT,                     -- pending | kept_blocked | overridden
    image_file        TEXT,
    sheet             TEXT,                     -- JSON: Trace & Learn overlay (letter, number, shape...)
    print_status      TEXT NOT NULL DEFAULT 'not_printed', -- not_printed | printed | failed
    reprint_count     INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Columns added after the first version of the database.
const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
if (!sessionColumns.includes('join_token')) db.exec('ALTER TABLE sessions ADD COLUMN join_token TEXT');
const requestColumns = db.prepare('PRAGMA table_info(requests)').all().map((c) => c.name);
if (!requestColumns.includes('sheet')) db.exec('ALTER TABLE requests ADD COLUMN sheet TEXT');

if (db.prepare('SELECT COUNT(*) AS n FROM teachers').get().n === 0) {
  const insert = db.prepare('INSERT INTO teachers (username, password_hash, display_name) VALUES (?, ?, ?)');
  for (const t of seedTeachers) insert.run(t.username, bcrypt.hashSync(t.password, 10), t.displayName);
}

if (db.prepare('SELECT COUNT(*) AS n FROM kiosks').get().n === 0) {
  db.prepare('INSERT INTO kiosks (name, firmware) VALUES (?, ?)').run(seedKiosk.name, seedKiosk.firmware);
}

const defaultSettings = {
  language: 'en',
  volume: '70',
  theme_color: 'deep_blue',
  auto_sleep: 'true',
  auto_sleep_minutes: '15',
  auto_logout: 'true',
  auto_logout_minutes: '30',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) insertSetting.run(k, v);

export const parseSession = (row) =>
  row && {
    ...row,
    languages: JSON.parse(row.languages),
    blocked_words: JSON.parse(row.blocked_words),
    allowed_words: JSON.parse(row.allowed_words),
  };
