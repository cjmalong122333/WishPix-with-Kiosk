import { CalendarDays, ShieldCheck, Zap } from 'lucide-react';
import type { T } from '@/i18n';
import { fromDay, longDate, shortDate } from './status';

export const REPORT_TYPES = [
  { id: 'daily', icon: CalendarDays, tone: 'blue', name: 'Daily summary', text: 'Everything that happened on one day.' },
  { id: 'session', icon: Zap, tone: 'indigo', name: 'Session report', text: 'One session: its settings and every request.' },
  { id: 'safety', icon: ShieldCheck, tone: 'red', name: 'Safety report', text: 'What the safety filter blocked, and what teachers decided.' },
] as const;

export type ReportParams = { date?: string; sessionId?: number; from?: string | null; to?: string | null };

// "Daily summary · Tuesday, October 27, 2026"
export function reportTitle(type: string, params: ReportParams, t: T) {
  const kind = t(REPORT_TYPES.find((r) => r.id === type)?.name ?? type);
  if (type === 'daily' && params.date) return `${kind} · ${longDate(fromDay(params.date), t)}`;
  if (type === 'session') return `${kind} · ${t('Session #{n}', { n: params.sessionId ?? '' })}`;
  if (type === 'safety' && params.from && params.to) return `${kind} · ${shortDate(fromDay(params.from), t)} – ${shortDate(fromDay(params.to), t)}`;
  return kind;
}

// Today (or another day) as 'YYYY-MM-DD' in the kiosk's time zone.
export function localDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A list of rows as a CSV file the browser downloads.
export function downloadCsv(filename: string, head: string[], rows: unknown[][]) {
  const cell = (v: unknown) => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const text = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// Categorical chart colors in fixed order. Validated as a set for color-blind
// separation (light surface); never reorder or cycle them.
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'];
