import { checkSafety } from '@/server/safety';
import { currentSession } from '@/server/kiosk';
import { teacherRoute } from '@/server/auth';
import { body, json } from '@/server/http';

const LEVELS = ['strict', 'standard', 'custom'];
const list = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 100) : []);

// Try a phrase against the word filter without sending anything to the
// kiosk. Uses the current session's rules unless a safety level is given.
export const POST = teacherRoute(async (req) => {
  const b = await body(req);
  const session = await currentSession();
  const level = LEVELS.includes(String(b.safetyLevel)) ? String(b.safetyLevel) : (session?.safety_level ?? 'standard');
  const rules =
    session && level === session.safety_level
      ? { safetyLevel: level, blockedWords: session.blocked_words, allowedWords: session.allowed_words }
      : { safetyLevel: level, blockedWords: list(b.blockedWords), allowedWords: list(b.allowedWords) };
  return json({ level, ...checkSafety(String(b.text ?? '').slice(0, 200), rules) });
});
