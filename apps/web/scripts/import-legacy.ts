// Copies the data from the old WishPix simulator (server/data/wishpix.db and
// its images) into this app's empty database. Run once:
//   npm run db:import-legacy -- <path to old wishpix.db>
// Old times are SQLite UTC text ("YYYY-MM-DD HH:MM:SS") and become real dates.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client';

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('Usage: npm run db:import-legacy -- <path to the old wishpix.db>');
  process.exit(1);
}

const url = (process.env.DATABASE_URL ?? 'file:./data/wishpix.db').replace(/^file:/, '');
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: path.resolve(url) }) });
const old = new Database(source, { readonly: true });
const imageDir = path.resolve(process.env.DATA_DIR ?? './data', 'images');
const oldImageDir = path.join(path.dirname(source), 'images');

type Row = Record<string, unknown>;
const all = (table: string): Row[] => old.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all() as Row[];
const date = (v: unknown) => (v ? new Date(String(v).replace(' ', 'T') + 'Z') : null);
const text = (v: unknown) => (v == null ? null : String(v));

async function main() {
  if ((await prisma.request.count()) > 0 || (await prisma.session.count()) > 0) {
    throw new Error('This database already has sessions or requests. Import only into a fresh database.');
  }

  // Teachers keep their passwords (bcrypt hashes are compatible).
  const teacherIds = new Map<number, number>();
  for (const t of all('teachers')) {
    const existing = await prisma.teacher.findUnique({ where: { username: String(t.username) } });
    const row =
      existing ??
      (await prisma.teacher.create({
        data: { username: String(t.username), passwordHash: String(t.password_hash), displayName: String(t.display_name), createdAt: date(t.created_at) ?? undefined },
      }));
    teacherIds.set(Number(t.id), row.id);
  }

  const kiosk = all('kiosks')[0];
  if (kiosk) await prisma.kiosk.upsert({ where: { id: 1 }, update: { name: String(kiosk.name) }, create: { id: 1, name: String(kiosk.name), firmware: '1.0.0' } });

  const sessionIds = new Map<number, number>();
  for (const s of all('sessions')) {
    const row = await prisma.session.create({
      data: {
        kioskId: 1,
        teacherId: teacherIds.get(Number(s.teacher_id)) ?? [...teacherIds.values()][0],
        activityType: String(s.activity_type),
        activitySubtype: String(s.activity_subtype),
        theme: String(s.theme),
        safetyLevel: String(s.safety_level),
        languages: String(s.languages),
        blockedWords: String(s.blocked_words ?? '[]'),
        allowedWords: String(s.allowed_words ?? '[]'),
        // A session left running in the simulator is closed.
        status: 'ended',
        startedAt: date(s.started_at) ?? new Date(),
        endedAt: date(s.ended_at) ?? date(s.started_at),
      },
    });
    sessionIds.set(Number(s.id), row.id);
  }

  let images = 0;
  fs.mkdirSync(imageDir, { recursive: true });
  for (const r of all('requests')) {
    const sessionId = sessionIds.get(Number(r.session_id));
    if (!sessionId) continue;
    const created = await prisma.request.create({
      data: {
        sessionId,
        queueNumber: Number(r.queue_number),
        originalSpeech: String(r.original_speech),
        recognizedText: String(r.recognized_text),
        language: text(r.language),
        finalPrompt: text(r.final_prompt),
        status: ['processing', 'generating'].includes(String(r.status)) ? 'failed' : String(r.status),
        blockCategory: text(r.block_category),
        blockReason: text(r.block_reason),
        blockMatch: text(r.block_match),
        blockSource: r.block_category ? 'filter' : null,
        moderationStatus: text(r.moderation_status),
        moderatedAt: date(r.moderated_at),
        moderatedBy: r.moderated_by ? (teacherIds.get(Number(r.moderated_by)) ?? null) : null,
        imageProvider: r.image_file ? 'pollinations' : null,
        generatedAt: date(r.generated_at),
        sheet: text(r.sheet),
        printStatus: String(r.print_status ?? 'not_printed'),
        printedAt: date(r.printed_at),
        printError: text(r.print_error),
        reprintCount: Number(r.reprint_count ?? 0),
        createdAt: date(r.created_at) ?? new Date(),
        updatedAt: date(r.updated_at) ?? new Date(),
      },
    });
    // Pictures are renamed to the new request id.
    if (r.image_file) {
      const from = path.join(oldImageDir, String(r.image_file));
      if (fs.existsSync(from)) {
        const file = `request-${created.id}${path.extname(from)}`;
        fs.copyFileSync(from, path.join(imageDir, file));
        await prisma.request.update({ where: { id: created.id }, data: { imageFile: file } });
        images++;
      }
    }
  }

  for (const e of all('events')) {
    await prisma.event.create({
      data: { type: String(e.type), data: String(e.data ?? '{}'), teacherId: e.teacher_id ? (teacherIds.get(Number(e.teacher_id)) ?? null) : null, createdAt: date(e.created_at) ?? new Date() },
    });
  }

  // Teacher-facing settings carry over; printer counters belong to the hardware service now.
  for (const key of ['language', 'volume', 'theme_color', 'auto_sleep', 'auto_sleep_minutes', 'auto_logout', 'auto_logout_minutes', 'kiosk_brightness']) {
    const row = old.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (row) await prisma.setting.upsert({ where: { key }, update: { value: row.value }, create: { key, value: row.value } });
  }

  console.log(`Imported ${teacherIds.size} teachers, ${sessionIds.size} sessions, ${all('requests').length} requests (${images} pictures), ${all('events').length} events.`);
  console.log('Saved reports were not imported; make them again from the Reports page.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    old.close();
    await prisma.$disconnect();
  });
