import fs from 'node:fs/promises';
import { describeError } from './errors';
import path from 'node:path';
import { env } from './env';
import type { Sheet } from './catalog';

// Client for the Python hardware service (services/hardware). That service
// lays out the page and prints it through CUPS, or saves it as a PNG when it
// runs in mock mode. This module keeps the latest printer status and tells
// the kiosk when it changes.

export const PROBLEMS: Record<string, string> = {
  offline: 'The printer is turned off',
  jam: 'Paper jam',
  no_paper: 'Out of paper',
  no_ink: 'Out of ink',
  service_down: 'The printer service is not running',
  error: 'The printer reported an error',
};

export type PrinterState = {
  reachable: boolean;
  mode: 'cups' | 'mock' | null;
  printerName: string | null;
  paper: number;
  capacity: number;
  ink: number | null;
  problem: string | null;
  problemText: string | null;
  lowPaper: boolean;
  lowInk: boolean;
  printing: { requestId: number | null; kind: string } | null;
  queue: { requestId: number | null; kind: string }[];
};

const DOWN: PrinterState = {
  reachable: false,
  mode: null,
  printerName: null,
  paper: 0,
  capacity: 0,
  ink: null,
  problem: 'service_down',
  problemText: PROBLEMS.service_down,
  lowPaper: false,
  lowInk: false,
  printing: null,
  queue: [],
};

type Store = { state: PrinterState; listeners: Set<() => void>; polling: boolean };
const g = globalThis as unknown as { __wishpixPrinter?: Store };
const store: Store = (g.__wishpixPrinter ??= { state: DOWN, listeners: new Set(), polling: false });

export const printerState = () => store.state;
export const problem = () => store.state.problem;
export const onPrinterChange = (fn: () => void) => store.listeners.add(fn);

async function call<T>(method: string, urlPath: string, body?: BodyInit | object, timeoutMs = 8000): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`${env.HARDWARE_URL}${urlPath}`, {
    method,
    headers: {
      ...(env.HARDWARE_TOKEN ? { Authorization: `Bearer ${env.HARDWARE_TOKEN}` } : {}),
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Hardware service returned ${res.status}`);
  return data as T;
}

export async function refreshPrinter() {
  let next: PrinterState;
  try {
    const s = await call<Omit<PrinterState, 'reachable' | 'problemText'>>('GET', '/printer', undefined, 4000);
    next = { ...s, reachable: true, problemText: s.problem ? PROBLEMS[s.problem] ?? s.problem : null };
  } catch {
    next = DOWN;
  }
  if (JSON.stringify(next) !== JSON.stringify(store.state)) {
    store.state = next;
    for (const fn of store.listeners) fn();
  }
  return next;
}

// Polls the hardware service so a jam or an empty tray shows up for the
// teacher even when nothing is printing.
export function startPrinterPolling() {
  if (store.polling) return;
  store.polling = true;
  void refreshPrinter();
  setInterval(() => void refreshPrinter(), 3000).unref();
}

export type PrintJob = {
  requestId: number | null;
  kind: 'child' | 'reprint' | 'test';
  imageFile?: string | null;
  colorful?: boolean;
  activityType?: string;
  theme?: string;
  sheet?: Sheet | null;
  label?: string | null;
  caption?: string | null;
  language?: 'en' | 'fil';
};

const JOB_TIMEOUT_MS = 4 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sends a page to the printer and resolves when it is out (null) or failed
// (the problem id). Never throws.
export async function print(job: PrintJob): Promise<string | null> {
  try {
    const form = new FormData();
    const { imageFile, ...meta } = job;
    form.append('meta', JSON.stringify({ ...meta, date: new Date().toISOString() }));
    if (imageFile) {
      const bytes = await fs.readFile(path.join(env.IMAGE_DIR, imageFile));
      form.append('image', new Blob([bytes]), imageFile);
    }
    const { jobId } = await call<{ jobId: string }>('POST', '/jobs', form, 30_000);
    void refreshPrinter();

    const started = Date.now();
    while (Date.now() - started < JOB_TIMEOUT_MS) {
      await sleep(1500);
      const status = await call<{ status: string; problem?: string | null }>('GET', `/jobs/${jobId}`).catch(() => null);
      if (!status) continue;
      if (status.status === 'done') {
        void refreshPrinter();
        return null;
      }
      if (status.status === 'failed') {
        void refreshPrinter();
        return status.problem ?? 'error';
      }
    }
    return 'error';
  } catch (err) {
    console.error('[printer] print failed:', describeError(err));
    void refreshPrinter();
    return store.state.reachable ? 'error' : 'service_down';
  }
}

// ---------- Teacher fixes ----------

const action = (urlPath: string, body?: object) => async () => {
  await call('POST', urlPath, body ?? {});
  await refreshPrinter();
};

export const refillPaper = action('/printer/paper');
export const replaceInk = action('/printer/ink');
export const clearFault = action('/printer/clear');

// Practice problems; the hardware service only allows these in mock mode.
export const SIMULATIONS = ['jam', 'offline', 'low_paper', 'low_ink', 'no_ink'] as const;
export const simulate = (name: string) => action('/printer/simulate', { problem: name })();
