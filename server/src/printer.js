import { getSetting, setSetting } from './db.js';

// Simulated kiosk printer. It holds paper and ink, prints one page at a time
// and can be given problems from the Print Management simulator panel, so a
// teacher can practise fixing them. Paper, ink and faults survive a restart.

export const PAPER_CAPACITY = 50;
const PAGE_MS = 4500; // also how long the kiosk's printing animation runs
const LOW_PAPER = 5;
const LOW_INK = 15;

export const PROBLEMS = {
  offline: 'The printer is turned off',
  jam: 'Paper jam',
  no_paper: 'Out of paper',
  no_ink: 'Out of ink',
};

const state = {
  paper: Number(getSetting('printer_paper', PAPER_CAPACITY)),
  ink: Number(getSetting('printer_ink', 100)),
  fault: getSetting('printer_fault', 'none'), // none | jam | offline
  printing: null, // the job on the printer right now
  queue: [],
};

let notify = () => {};
export const onPrinterChange = (fn) => { notify = fn; };

function save() {
  setSetting('printer_paper', state.paper);
  setSetting('printer_ink', state.ink);
  setSetting('printer_fault', state.fault);
}

// Why the printer cannot print right now, or null when it can.
export function problem() {
  if (state.fault !== 'none') return state.fault;
  if (state.paper <= 0) return 'no_paper';
  if (state.ink <= 0) return 'no_ink';
  return null;
}

export function printerState() {
  const p = problem();
  return {
    paper: state.paper,
    capacity: PAPER_CAPACITY,
    ink: Math.round(state.ink),
    problem: p,
    problemText: p && PROBLEMS[p],
    lowPaper: state.paper > 0 && state.paper <= LOW_PAPER,
    lowInk: state.ink > 0 && state.ink <= LOW_INK,
    printing: state.printing && { requestId: state.printing.requestId, kind: state.printing.kind },
    queue: state.queue.map((j) => ({ requestId: j.requestId, kind: j.kind })),
  };
}

// job: { requestId, kind: 'child' | 'reprint' | 'test', ink: percent used }.
// done(problem) runs when the page is out (problem = null) or could not print.
export function print(job, done) {
  state.queue.push({ ...job, done });
  next();
  notify();
}

function next() {
  if (state.printing) return;
  // A broken printer fails everything that is waiting.
  const p = problem();
  if (p) {
    for (const job of state.queue.splice(0)) job.done(p);
    return;
  }
  const job = state.queue.shift();
  if (!job) return;
  state.printing = job;
  setTimeout(() => {
    state.printing = null;
    // A jam or power-off while printing loses the page.
    const fault = state.fault !== 'none' ? state.fault : null;
    if (!fault) {
      state.paper -= 1;
      state.ink = Math.max(0, state.ink - job.ink);
      save();
    }
    job.done(fault);
    next();
    notify();
  }, PAGE_MS);
}

// ---------- Teacher fixes ----------

export function refillPaper() {
  state.paper = PAPER_CAPACITY;
  save();
  notify();
}

export function replaceInk() {
  state.ink = 100;
  save();
  notify();
}

// Clears a paper jam, or turns the printer back on.
export function clearFault() {
  state.fault = 'none';
  save();
  notify();
}

// ---------- Simulator panel ----------

export const SIMULATIONS = {
  jam: () => { state.fault = 'jam'; },
  offline: () => { state.fault = 'offline'; },
  low_paper: () => { state.paper = Math.min(state.paper, 3); },
  low_ink: () => { state.ink = Math.min(state.ink, 10); },
  no_ink: () => { state.ink = 0; },
};

export function simulate(name) {
  SIMULATIONS[name]();
  save();
  notify();
}
