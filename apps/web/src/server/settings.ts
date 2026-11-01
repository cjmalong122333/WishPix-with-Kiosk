import { prisma } from './db';

// Settings the teacher can change on the Settings page, plus hidden values
// the kiosk keeps (brightness). Stored as text.
export const DEFAULTS: Record<string, string> = {
  language: 'en',
  volume: '70',
  theme_color: 'deep_blue',
  auto_sleep: 'true',
  auto_sleep_minutes: '15',
  auto_logout: 'true',
  auto_logout_minutes: '30',
  kiosk_brightness: '100',
};

type Rule = { values: string[] } | { min: number; max: number } | { bool: true };

const SCHEMA: Record<string, Rule> = {
  language: { values: ['en', 'fil'] }, // Teacher App and kiosk
  volume: { min: 0, max: 100 }, // kiosk sound effects
  theme_color: { values: ['deep_blue', 'teal', 'purple', 'green', 'orange'] }, // Teacher App accent
  auto_sleep: { bool: true },
  auto_sleep_minutes: { min: 1, max: 120 },
  auto_logout: { bool: true },
  auto_logout_minutes: { min: 5, max: 240 },
};

export type Settings = {
  language: 'en' | 'fil';
  volume: number;
  theme_color: string;
  auto_sleep: boolean;
  auto_sleep_minutes: number;
  auto_logout: boolean;
  auto_logout_minutes: number;
};

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? null;
}

export async function setSetting(key: string, value: string | number | boolean) {
  await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
}

async function allSettings() {
  const rows = await prisma.setting.findMany();
  return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

function typed(key: string, raw: string) {
  const rule = SCHEMA[key];
  if ('bool' in rule) return raw === 'true';
  if ('min' in rule) return Number(raw);
  return raw;
}

export async function readSettings(): Promise<Settings> {
  const all = await allSettings();
  return Object.fromEntries(Object.keys(SCHEMA).map((k) => [k, typed(k, all[k])])) as Settings;
}

// Returns { error } or { changed: [keys that really changed] }.
export async function updateSettings(patch: unknown): Promise<{ error: string } | { changed: string[] }> {
  if (!patch || typeof patch !== 'object') return { error: 'Nothing to save.' };
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    const rule = SCHEMA[key];
    if (!rule) return { error: `Unknown setting: ${key}` };
    if ('bool' in rule) {
      if (typeof value !== 'boolean') return { error: `${key} must be on or off.` };
      clean[key] = String(value);
    } else if ('min' in rule) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < rule.min || n > rule.max) return { error: `${key} must be between ${rule.min} and ${rule.max}.` };
      clean[key] = String(n);
    } else {
      if (typeof value !== 'string' || !rule.values.includes(value)) return { error: `${key} cannot be ${String(value)}.` };
      clean[key] = value;
    }
  }
  const all = await allSettings();
  const changed = Object.keys(clean).filter((k) => all[k] !== clean[k]);
  for (const k of changed) await setSetting(k, clean[k]);
  return { changed };
}

// The parts every screen needs, sent with the live state.
export async function screenPrefs() {
  const s = await readSettings();
  return {
    language: s.language,
    volume: s.volume,
    themeColor: s.theme_color,
    autoLogout: s.auto_logout,
    autoLogoutMinutes: s.auto_logout_minutes,
  };
}
export type ScreenPrefs = Awaited<ReturnType<typeof screenPrefs>>;
