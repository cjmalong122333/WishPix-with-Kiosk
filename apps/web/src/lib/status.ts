'use client';

import { useEffect, useState } from 'react';
import type { T } from '@/i18n';
import type { KioskState } from '@/lib/types';
import { PROBLEM_NAMES } from './labels';

// How the kiosk, its requests and times are described across the Teacher App.
// Each helper takes t() from useT() so it speaks the chosen language.

export type Chip = 'online' | 'offline' | 'sleeping' | 'busy' | 'printing';

// Kiosk modes from the server, shown as the five status chips.
export function kioskStatus(state: KioskState | null, t: T): { chip: Chip; title: string; text: string } {
  if (!state?.kioskOnline) return { chip: 'offline', title: t('KIOSK OFFLINE'), text: t('Turn on the kiosk screen to connect it.') };
  if (state.screen?.sleeping) return { chip: 'sleeping', title: t('KIOSK SLEEPING'), text: t('The screen is resting. Any kiosk button or the Wake button turns it on.') };
  switch (state.mode) {
    case 'waiting': return { chip: 'online', title: t('WAITING FOR TEACHER'), text: t('No mode is running. Choose what the children will do next.') };
    case 'ready': return { chip: 'online', title: t('READY FOR CHILDREN'), text: t('Children hold the talk button on the kiosk and say their idea.') };
    case 'paused': return { chip: 'online', title: t('SESSION PAUSED'), text: t('Picture making is stopped. Resume when the children are ready.') };
    case 'listening': return { chip: 'busy', title: t('LISTENING'), text: t('A child is telling the kiosk what to draw.') };
    case 'heard': return { chip: 'busy', title: t('CHECKING WHAT IT HEARD'), text: t('The child is checking that the kiosk understood them.') };
    case 'processing': return { chip: 'busy', title: t('CHECKING THE IDEA'), text: t('The safety checks are looking at what the child said.') };
    case 'generating': return { chip: 'busy', title: t('MAKING A PICTURE'), text: t('The picture is being drawn. This can take up to a minute.') };
    case 'printing': return { chip: 'printing', title: t('PRINTING'), text: t('The picture is coming out of the printer.') };
    case 'preview': return { chip: 'printing', title: t('SHOWING THE PICTURE'), text: t('The child is looking at their picture.') };
    case 'blocked': return { chip: 'busy', title: t('REQUEST BLOCKED'), text: t('The safety filter stopped a request. Review it in Moderation.') };
    case 'error': return { chip: 'busy', title: t('PICTURE FAILED'), text: t('The image service did not answer. The kiosk will be ready again soon.') };
    default: return { chip: 'busy', title: t('BUSY'), text: t('A child is using the kiosk right now.') };
  }
}

export type RequestRow = {
  status: string;
  moderation_status?: string | null;
  print_status?: string | null;
  print_error?: string | null;
  reprint_count?: number | null;
};

export type Tone = 'blue' | 'red' | 'amber' | 'gray' | 'green';

// One child request as a short label and color.
export function requestStatus(r: RequestRow, t: T): { tone: Tone; text: string } {
  if (r.status === 'processing') return { tone: 'blue', text: t('Checking') };
  if (r.status === 'generating') return { tone: 'blue', text: t('Making picture') };
  if (r.status === 'failed') return { tone: 'red', text: t('Picture failed') };
  if (r.status === 'blocked') {
    if (r.moderation_status === 'pending') return { tone: 'red', text: t('Blocked · needs review') };
    if (r.moderation_status === 'overridden') return { tone: 'amber', text: t('Overridden · waiting') };
    return { tone: 'gray', text: t('Blocked') };
  }
  if (r.print_status === 'printed') {
    if (!r.reprint_count) return { tone: 'green', text: t('Printed') };
    return { tone: 'green', text: t(r.reprint_count === 1 ? 'Printed · 1 reprint' : 'Printed · {n} reprints', { n: r.reprint_count }) };
  }
  if (r.print_status === 'failed') {
    const problem = PROBLEM_NAMES[r.print_error ?? ''];
    return { tone: 'red', text: problem ? t('Print failed · {problem}', { problem: t(problem) }) : t('Print failed') };
  }
  return { tone: 'blue', text: t('Not printed yet') };
}

// Times from the server are ISO strings; rows imported from the old
// simulator may be SQLite's "YYYY-MM-DD HH:MM:SS" (UTC).
export function toDate(time: unknown): Date | null {
  if (!time) return null;
  const s = String(time);
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s);
}

export const clock = (date: Date, t: T) => date.toLocaleTimeString(t.locale, { hour: 'numeric', minute: '2-digit' });
export const shortDate = (date: Date, t: T) => date.toLocaleDateString(t.locale, { month: 'short', day: 'numeric' });
export const longDate = (date: Date, t: T) => date.toLocaleDateString(t.locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

// "just now", "5 min ago", "3:15 PM", "Oct 26, 3:15 PM"
export function when(time: unknown, t: T) {
  const date = toDate(time);
  if (!date) return '';
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return t('just now');
  if (mins < 60) return t('{n} min ago', { n: mins });
  return date.toDateString() === new Date().toDateString() ? clock(date, t) : `${shortDate(date, t)}, ${clock(date, t)}`;
}

// The current time, refreshed every few seconds, for running clocks.
export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

// "1h 05m", "12 min"
export function duration(ms: number, t: T) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  return mins < 60 ? t('{n} min', { n: mins }) : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

// A local 'YYYY-MM-DD' date (from the server) as a Date at local midnight.
export const fromDay = (day: string) => new Date(`${day}T00:00:00`);

// '42%', or '–' when there is nothing to divide by.
export const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');

// '45 sec', '3 min'
export const seconds = (s: number | null | undefined, t: T) =>
  s == null ? '–' : s < 90 ? t('{n} sec', { n: s }) : t('{n} min', { n: Math.round(s / 60) });
