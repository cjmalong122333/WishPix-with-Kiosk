import * as printer from '@/server/printer';
import { testPrint } from '@/server/kiosk';
import { logEvent, type EventType } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { body, fail, json } from '@/server/http';

const FIXES: Record<string, [() => Promise<void>, EventType]> = {
  'refill-paper': [printer.refillPaper, 'printer_refill'],
  'replace-ink': [printer.replaceInk, 'printer_ink'],
  clear: [printer.clearFault, 'printer_clear'],
};

export const POST = teacherRoute<{ params: Promise<{ action: string }> }>(async (req, teacher, ctx) => {
  const action = (await ctx.params).action;

  if (action === 'test') {
    const error = testPrint();
    if (error) return fail(error, 409);
    await logEvent('printer_test', {}, teacher.id);
    return json({ ok: true });
  }

  // Practice problems, only while the hardware service runs in mock mode.
  if (action === 'simulate') {
    const problem = String((await body(req)).problem ?? '');
    if (!(printer.SIMULATIONS as readonly string[]).includes(problem)) return fail('Unknown problem.');
    if (printer.printerState().mode !== 'mock') return fail('Practice problems only work with the simulated printer.', 409);
    await printer.simulate(problem);
    await logEvent('printer_simulate', { problem }, teacher.id);
    return json({ ok: true });
  }

  const entry = FIXES[action];
  if (!entry) return fail('Unknown printer action.', 404);
  const [run, type] = entry;
  const problem = printer.problem();
  try {
    await run();
  } catch (err) {
    return fail(`The printer did not respond: ${(err as Error).message}`, 502);
  }
  await logEvent(type, type === 'printer_clear' ? { problem } : {}, teacher.id);
  return json({ ok: true });
});
