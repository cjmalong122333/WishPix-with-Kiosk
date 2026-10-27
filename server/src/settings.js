import { getSetting, setSetting } from './db.js';

// Settings the teacher can change on the Settings page. Each one says how to
// check a new value; values are stored as text in the settings table.
const SCHEMA = {
  language: { values: ['en', 'fil'] }, // Teacher App, kiosk and child phone
  volume: { min: 0, max: 100 }, // kiosk sound effects
  theme_color: { values: ['deep_blue', 'teal', 'purple', 'green', 'orange'] }, // Teacher App accent
  auto_sleep: { bool: true },
  auto_sleep_minutes: { min: 1, max: 120 },
  auto_logout: { bool: true },
  auto_logout_minutes: { min: 5, max: 240 },
};

function read(key) {
  const raw = getSetting(key);
  const rule = SCHEMA[key];
  if (rule.bool) return raw === 'true';
  if ('min' in rule) return Number(raw);
  return raw;
}

export function readSettings() {
  return Object.fromEntries(Object.keys(SCHEMA).map((k) => [k, read(k)]));
}

// Returns { error } or { changed: [keys that really changed] }.
export function updateSettings(patch) {
  const clean = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    const rule = SCHEMA[key];
    if (!rule) return { error: `Unknown setting: ${key}` };
    if (rule.bool) {
      if (typeof value !== 'boolean') return { error: `${key} must be on or off.` };
      clean[key] = String(value);
    } else if ('min' in rule) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < rule.min || n > rule.max) return { error: `${key} must be between ${rule.min} and ${rule.max}.` };
      clean[key] = String(n);
    } else {
      if (!rule.values.includes(value)) return { error: `${key} cannot be ${value}.` };
      clean[key] = value;
    }
  }
  const changed = Object.keys(clean).filter((k) => getSetting(k) !== clean[k]);
  for (const k of changed) setSetting(k, clean[k]);
  return { changed };
}

// The parts every screen needs, sent with the live state.
export function screenPrefs() {
  return {
    language: read('language'),
    volume: read('volume'),
    themeColor: read('theme_color'),
    autoLogout: read('auto_logout'),
    autoLogoutMinutes: read('auto_logout_minutes'),
  };
}
