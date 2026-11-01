import { z } from 'zod';
import { findActivity } from '@/server/catalog';
import { currentSession, startSession } from '@/server/kiosk';
import { sessionList } from '@/server/insights';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { body, fail, json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const GET = teacherRoute(async () => json({ sessions: await sessionList() }));

const words = z.array(z.string().trim().max(40)).max(100).default([]);
const Config = z.object({
  activityType: z.string(),
  activitySubtype: z.string(),
  theme: z.string().trim().min(1, 'Choose a theme.').max(40),
  safetyLevel: z.enum(['strict', 'standard', 'custom'], { error: 'Choose a safety level.' }),
  languages: z.array(z.string()).min(1, 'Choose at least one language.'),
  blockedWords: words,
  allowedWords: words,
});

export const POST = teacherRoute(async (req, teacher) => {
  const b = await body(req);
  if (!findActivity(b.activityType, b.activitySubtype)) return fail('Choose an activity.');
  const parsed = Config.safeParse(b);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the session settings.');
  const config = { ...parsed.data, blockedWords: parsed.data.blockedWords.filter(Boolean), allowedWords: parsed.data.allowedWords.filter(Boolean) };

  const previous = await currentSession();
  if (previous) await logEvent('session_end', { sessionId: previous.id, theme: previous.theme, replaced: true }, teacher.id);
  const session = await startSession(teacher.id, config);
  await logEvent(
    'session_start',
    { sessionId: session.id, theme: session.theme, activity: session.activity_type, subtype: session.activity_subtype, safety: session.safety_level },
    teacher.id
  );
  return json({ session });
});
