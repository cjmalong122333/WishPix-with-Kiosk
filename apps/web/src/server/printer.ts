import fs from 'node:fs/promises';
import { describeError } from './errors';
import path from 'node:path';
import { env } from './env';
import type { Sheet } from './catalog';

// Client for the Python hardware service (services/hardware). That service
// lays out the page and prints it: through CUPS on the inkjet (4x6 pages,
// recommended), on an optional 58 mm thermal printer (ESC/POS), or saves it
// as a PNG in mock mode. It also draws page previews and prints the files
// teachers send (Print to Kiosk). This module keeps the latest printer
// status and tells the kiosk when it changes.

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
  mode: 'cups' | 'escpos' | 'mock' | null;
  printerName: string | null;
  format: '4x6' | '58mm' | null; // page size: inkjet sticker sheet or thermal roll
  paper: number;
  capacity: number;
  ink: number | null; // null: not known, or a thermal printer (no ink)
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
  format: null,
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

// A request to the hardware service. Throws HardwareError with the service's
// own message (for example "Only PNG, JPG and PDF files can be printed.").
export class HardwareError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function hardware(method: string, urlPath: string, body?: BodyInit | object, timeoutMs = 8000): Promise<Response> {
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
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new HardwareError(typeof data.detail === 'string' ? data.detail : `Hardware service returned ${res.status}`, res.status);
  }
  return res;
}

async function call<T>(method: string, urlPath: string, body?: BodyInit | object, timeoutMs = 8000): Promise<T> {
  return (await (await hardware(method, urlPath, body, timeoutMs)).json()) as T;
}

export async function refreshPrinter() {
  let next: PrinterState;
  try {
    const s = await call<Omit<PrinterState, 'reachable' | 'problemText'>>('GET', '/printer', undefined, 4000);
    next = { ...s, reachable: true, problemText: s.problem ? (PROBLEMS[s.problem] ?? s.problem) : null };
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
  imageFile?: string | null; // none for Trace Word (letters only)
  activityType?: string;
  theme?: string;
  sheet?: Sheet | null;
  label?: string | null; // pages saved before the bilingual words: the label in one language
  language?: 'en' | 'fil';
};

const JOB_TIMEOUT_MS = 4 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jobForm(job: PrintJob) {
  const form = new FormData();
  const { imageFile, ...meta } = job;
  form.append('meta', JSON.stringify({ ...meta, date: new Date().toISOString() }));
  if (imageFile) {
    const bytes = await fs.readFile(path.join(env.IMAGE_DIR, imageFile));
    form.append('image', new Blob([bytes]), imageFile);
  }
  return form;
}

// The page exactly as the printer would print it (same layout code, same
// paper size), as a PNG. Throws when the hardware service is not running.
export async function renderPage(job: PrintJob): Promise<Uint8Array> {
  const res = await hardware('POST', '/render', await jobForm(job), 30_000);
  return new Uint8Array(await res.arrayBuffer());
}

type JobStatus = { status: string; problem?: string | null; done?: number; total?: number };

// Waits for a hardware job. Resolves null when it is out, or the problem id.
// timeoutMs: how long it may take without printing another sheet.
async function follow(jobId: string, timeoutMs: number, onProgress?: (done: number, total: number) => void): Promise<string | null> {
  let since = Date.now();
  let last = -1;
  while (Date.now() - since < timeoutMs) {
    await sleep(1500);
    const status = await call<JobStatus>('GET', `/jobs/${jobId}`).catch(() => null);
    if (!status) continue;
    if (status.done !== undefined && status.done !== last) {
      last = status.done;
      since = Date.now();
      onProgress?.(status.done, status.total ?? 1);
    }
    if (status.status === 'done' || status.status === 'failed') {
      void refreshPrinter();
      return status.status === 'done' ? null : (status.problem ?? 'error');
    }
  }
  return 'error';
}

// Sends a page to the printer and resolves when it is out (null) or failed
// (the problem id). Never throws.
export async function print(job: PrintJob): Promise<string | null> {
  try {
    const { jobId } = await call<{ jobId: string }>('POST', '/jobs', await jobForm(job), 30_000);
    void refreshPrinter();
    return await follow(jobId, JOB_TIMEOUT_MS);
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

// ---------- Teacher files (Print to Kiosk) ----------

function fileForm(bytes: Uint8Array, fileName: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)]), fileName);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

// How many pages the file has. Throws HardwareError for a file that can't be printed.
export const inspectFile = (bytes: Uint8Array, fileName: string) =>
  call<{ type: string; pages: number }>('POST', '/files/inspect', fileForm(bytes, fileName), 30_000);

// One page (1-based) as it will print, as a PNG.
export async function previewFile(bytes: Uint8Array, fileName: string, page: number): Promise<Uint8Array> {
  const res = await hardware('POST', '/files/preview', fileForm(bytes, fileName, { page: String(page) }), 30_000);
  return new Uint8Array(await res.arrayBuffer());
}

// Prints pages ("all" or "1-3, 5"), each copies times. Resolves null when
// every sheet is out, or the problem id. Never throws.
export async function printFile(
  bytes: Uint8Array,
  fileName: string,
  pages: string,
  copies: number,
  onProgress: (done: number, total: number) => void
): Promise<string | null> {
  try {
    const form = fileForm(bytes, fileName, { pages, copies: String(copies) });
    const { jobId } = await call<{ jobId: string }>('POST', '/files/jobs', form, 60_000);
    void refreshPrinter();
    return await follow(jobId, JOB_TIMEOUT_MS, onProgress);
  } catch (err) {
    console.error('[printer] teacher file failed:', describeError(err));
    void refreshPrinter();
    return store.state.reachable ? 'error' : 'service_down';
  }
}
