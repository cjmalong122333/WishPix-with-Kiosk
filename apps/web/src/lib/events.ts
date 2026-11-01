import type { T } from '@/i18n';
import { ACTIVITY_NAMES } from './labels';

// Words for the teacher and system events the server logs (src/server/events.ts).

const SIMULATED: Record<string, string> = { jam: 'paper jam', offline: 'printer off', low_paper: 'low paper', low_ink: 'low ink', no_ink: 'out of ink' };
const REPORTS: Record<string, string> = { daily: 'Daily summary', session: 'Session report', safety: 'Safety report' };
const SETTING_NAMES: Record<string, string> = {
  language: 'language',
  volume: 'kiosk volume',
  theme_color: 'theme color',
  auto_sleep: 'auto-sleep',
  auto_sleep_minutes: 'auto-sleep time',
  auto_logout: 'auto sign-out',
  auto_logout_minutes: 'auto sign-out time',
};

export type LoggedEvent = { id: number; type: string; data: Record<string, unknown>; created_at: string; teacher: string | null };

export const eventGroupOf = (type: string) =>
  type.startsWith('session_') ? 'sessions'
    : type.startsWith('moderation_') ? 'moderation'
      : type.startsWith('print') ? 'printing'
        : type.startsWith('kiosk_') ? 'kiosk'
          : 'account';

export function eventText(e: LoggedEvent, t: T) {
  const d = (e.data ?? {}) as Record<string, string | number | boolean | string[] | undefined>;
  const theme = d.theme ? t(String(d.theme)) : '';
  switch (e.type) {
    case 'login': return t('Signed in');
    case 'logout': return t('Signed out');
    case 'session_start': return t('Started a session: {theme} · {activity}', { theme, activity: t(ACTIVITY_NAMES[String(d.activity)] ?? String(d.activity)) });
    case 'session_pause': return t('Paused the session ({theme})', { theme });
    case 'session_resume': return t('Resumed the session ({theme})', { theme });
    case 'session_end': return d.replaced ? t('Ended the session ({theme}) by starting a new one', { theme }) : t('Ended the session ({theme})', { theme });
    case 'moderation_keep': return t('Kept a request blocked: “{text}”', { text: String(d.text) });
    case 'moderation_override': return t('Overrode the filter: “{text}”', { text: String(d.text) });
    case 'print_reprint': return t('Sent a picture to print again');
    case 'print_retry': return t(d.count === 1 ? 'Sent 1 failed print to the printer' : 'Sent {n} failed prints to the printer', { n: Number(d.count) });
    case 'printer_refill': return t('Refilled the paper');
    case 'printer_ink': return t('Replaced the ink');
    case 'printer_clear': return d.problem === 'jam' ? t('Cleared a paper jam') : d.problem === 'offline' ? t('Turned the printer on') : t('Cleared a printer problem');
    case 'printer_test': return t('Printed a test page');
    case 'printer_simulate': return t('Simulated a printer problem: {problem}', { problem: t(SIMULATED[String(d.problem)] ?? String(d.problem)) });
    case 'kiosk_restart': return t('Restarted the kiosk');
    case 'kiosk_sleep': return d.auto ? t('The kiosk went to sleep because nobody used it') : t('Put the kiosk to sleep');
    case 'kiosk_wake': return t('Woke the kiosk');
    case 'kiosk_rename': return t('Renamed the kiosk to “{name}”', { name: String(d.name) });
    case 'settings_change': return t('Changed settings: {list}', { list: ((d.keys as string[]) ?? []).map((k) => t(SETTING_NAMES[k] ?? k)).join(', ') });
    case 'password_change': return t('Changed the password');
    case 'profile_change': return t('Changed the display name');
    case 'report_create': return t('Created a report: {type}', { type: t(REPORTS[String(d.reportType)] ?? String(d.reportType)) });
    default: return e.type;
  }
}
