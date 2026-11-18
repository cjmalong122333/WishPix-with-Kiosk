'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Droplet, Eye, FileText, FlaskConical, Power, Printer, RotateCw, Wrench } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { PROBLEM_NAMES, themeName } from '@/lib/labels';
import { requestStatus, when } from '@/lib/status';
import type { PrinterState, RequestItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet } from '@/components/kiosk/sheet';
import { useLive } from '@/components/teacher/auth';
import { Empty, PageTitle, Panel, Row, Tag, Tint } from '@/components/teacher/ui';

// Practice problems for the simulated printer (services/hardware, mock mode).
const SIMULATIONS = [
  ['jam', 'Paper jam', 'Simulated: paper jam.'],
  ['offline', 'Turn printer off', 'Simulated: printer turned off.'],
  ['low_paper', 'Low paper', 'Simulated: low paper.'],
  ['low_ink', 'Low ink', 'Simulated: low ink.'],
  ['no_ink', 'Out of ink', 'Simulated: out of ink.'],
] as const;

const JOB_NAMES: Record<string, string> = {
  child: 'Printing a child’s picture',
  reprint: 'Printing a reprint',
  test: 'Printing a test page',
  file: 'Printing a teacher’s file',
};

type Data = { items: RequestItem[]; summary: { printedToday: number; failed: number; teacherToday: number } };
type Act = (path: string, message: string | ((res: Record<string, unknown>) => string), body?: unknown) => Promise<void>;

export default function PrintManagement() {
  const live = useLive();
  const t = useT();
  const [view, setView] = useState<'all' | 'failed'>('all');
  const [data, setData] = useState<Data | null>(null);
  const [preview, setPreview] = useState<RequestItem | null>(null);
  const printer = live?.printer;

  const load = useCallback(() => {
    api<Data>(`/api/print/history?view=${view}`)
      .then(setData)
      .catch((e: Error) => toast.error(t.error(e.message)));
  }, [view, t]);
  // Reload as pages finish printing and new pictures are made.
  useEffect(() => load(), [load, printer?.printing?.requestId, printer?.queue.length, printer?.problem, live?.mode]);

  const act: Act = async (path, message, body) => {
    try {
      const res = await api(path, { method: 'POST', body: body ?? {} });
      toast.success(typeof message === 'function' ? message(res) : message);
    } catch (err) {
      toast.error(t.error((err as Error).message));
    }
  };

  const failed = data?.summary.failed ?? 0;
  const items = data?.items ?? [];

  return (
    <div>
      <PageTitle title={t('Print Management')} lead={t('The kiosk printer, its paper and ink, and every picture it has printed.')} small />

      {printer && <PrinterCard printer={printer} printedToday={data?.summary.printedToday} teacherToday={data?.summary.teacherToday} act={act} />}

      {failed > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#f6c9d2] bg-danger-bg px-4 py-3.5 text-sm text-foreground">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-danger" /> {t(failed === 1 ? '1 picture did not print.' : '{n} pictures did not print.', { n: failed })}
          </span>
          <button
            className="border-0 bg-transparent p-0 text-[13px] font-bold text-primary"
            onClick={() =>
              act('/api/print/retry-failed', (r) => t(r.count === 1 ? 'Sending 1 picture to the printer.' : 'Sending {n} pictures to the printer.', { n: Number(r.count) }))
            }
          >
            {t(failed === 1 ? 'Print it now' : 'Print them now')} →
          </button>
        </div>
      )}

      <div className="mt-4 mb-4 flex rounded-xl bg-accent p-1">
        {(
          [
            ['all', 'All pictures', 0],
            ['failed', 'Did not print', failed],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[9px] border-0 bg-transparent py-2 text-[13px] font-semibold text-muted-foreground',
              view === id && 'bg-white text-primary shadow-sm'
            )}
            onClick={() => setView(id)}
            aria-pressed={view === id}
          >
            {t(label)}
            {count > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{count}</span>}
          </button>
        ))}
      </div>

      {data && items.length === 0 && (
        <Empty
          icon={<Printer />}
          title={view === 'failed' ? t('Every picture printed') : t('No pictures yet')}
          text={view === 'failed' ? t('Pictures that did not come out of the printer appear here.') : t('Pictures the kiosk makes appear here, ready to reprint.')}
        />
      )}

      <ul className="m-0 grid list-none gap-2 p-0 lg:grid-cols-2">
        {items.map((r) => {
          const status = requestStatus(r, t);
          const busy = printer?.printing?.requestId === r.id || printer?.queue.some((j) => j.requestId === r.id);
          return (
            <li key={r.id}>
              <Row>
                <button
                  className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-white p-0"
                  onClick={() => setPreview(r)}
                  aria-label={t('Preview the page for {text}', { text: r.recognized_text })}
                >
                  {/* Trace Word pages have no picture: show the page itself. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.image_url ?? `/api/pages/${r.id}`} alt="" className="size-full object-cover" />
                  <Eye size={14} className="absolute right-[3px] bottom-[3px] box-content rounded bg-foreground/70 p-0.5 text-white" />
                </button>
                <span className="flex min-w-[140px] flex-1 flex-col items-start gap-0.5">
                  <b className="max-w-full truncate text-[15px] text-foreground">“{r.recognized_text}”</b>
                  <small className="text-xs text-muted-foreground">
                    {t('Child #{n}', { n: r.queue_number })} · {themeName(r.theme, t)} · {when(r.created_at, t)}
                  </small>
                  <Tag tone={busy ? 'blue' : status.tone} className="mt-1">
                    {busy ? t('Printing…') : status.text}
                  </Tag>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto shrink-0"
                  disabled={busy}
                  onClick={() => act(`/api/print/${r.id}/reprint`, r.print_status === 'printed' ? t('Reprinting…') : t('Printing…'))}
                >
                  <RotateCw /> {r.print_status === 'printed' ? t('Reprint') : t('Print')}
                </Button>
              </Row>
            </li>
          );
        })}
      </ul>

      {printer?.mode === 'mock' && (
        <Panel className="mt-6 border-dashed">
          <h2 className="m-0 flex items-center gap-2 text-base font-bold">
            <FlaskConical size={18} /> {t('Hardware simulator')}
          </h2>
          <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">{t('The printer service is in practice mode. Give the pretend printer a problem to practise fixing it.')}</p>
          <div className="flex flex-wrap gap-2">
            {SIMULATIONS.filter(([id]) => printer.format !== '58mm' || !id.includes('ink')).map(([id, label, done]) => (
              <Button key={id} variant="outline" size="sm" onClick={() => act('/api/printer/simulate', t(done), { problem: id })}>
                {t(label)}
              </Button>
            ))}
          </div>
        </Panel>
      )}

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle>“{preview.recognized_text}”</DialogTitle>
                <DialogDescription>
                  {t('Child #{n}', { n: preview.queue_number })} · {themeName(preview.theme, t)}
                </DialogDescription>
              </DialogHeader>
              <div className="mx-auto w-full max-w-[340px] border shadow-card">
                <Sheet
                  current={{
                    id: preview.id,
                    queueNumber: preview.queue_number,
                    recognizedText: preview.recognized_text,
                    language: preview.language ?? null,
                    status: preview.status,
                    imageUrl: preview.image_url ?? null,
                    sheet: preview.sheet ?? null,
                    label: preview.label_en ? { en: preview.label_en, fil: preview.label_fil ?? preview.label_en } : null,
                  }}
                  activityType={preview.activity_type}
                  theme={preview.theme}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PrinterCard({ printer, printedToday, teacherToday, act }: { printer: PrinterState; printedToday?: number; teacherToday?: number; act: Act }) {
  const t = useT();
  // An optional 58 mm thermal printer has a paper roll and no ink.
  const thermal = printer.format === '58mm';
  const job = printer.printing;
  const status = printer.problem
    ? { tone: 'bad', text: t(PROBLEM_NAMES[printer.problem] ?? printer.problem) }
    : job
      ? { tone: 'busy', text: t(JOB_NAMES[job.kind] ?? job.kind) }
      : { tone: 'ok', text: t('Ready') };
  const waiting = printer.queue.length;
  return (
    <Panel className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tint tone="purple" size="lg">
          <Printer />
        </Tint>
        <div className="min-w-[160px] flex-1">
          <small className="block text-xs text-muted-foreground">
            {t('Kiosk printer')}
            {printer.printerName ? ` · ${printer.printerName}` : ''}
          </small>
          <b className={cn('flex items-center gap-1.5 text-base', status.tone === 'bad' ? 'text-danger' : status.tone === 'busy' ? 'text-primary' : 'text-success')}>
            <i className="size-2 rounded-full bg-current" />
            {status.text}
          </b>
        </div>
        <span className="ml-auto text-right text-xs text-muted-foreground">
          <b className="block text-xl text-foreground">{printedToday ?? '–'}</b> {t('printed today')}
          {!!teacherToday && <small className="block">{t('+ {n} Teacher Print', { n: teacherToday })}</small>}
        </span>
      </div>
      {printer.problem === 'service_down' && <p className="mt-3 mb-0 text-[13px] text-muted-foreground">{t('Start the WishPix hardware service on the kiosk, or restart the kiosk.')}</p>}
      {waiting > 0 && <p className="mt-2 mb-0 text-[13px] text-muted-foreground">{t(waiting === 1 ? '1 more page waiting.' : '{n} more pages waiting.', { n: waiting })}</p>}

      {printer.reachable && (
        <>
          <Gauge
            icon={<FileText size={16} />}
            label={t('Paper')}
            value={thermal ? t('{n} of {max} pages left on the roll', { n: printer.paper, max: printer.capacity }) : t('{n} of {max} sheets', { n: printer.paper, max: printer.capacity })}
            percent={printer.capacity ? (printer.paper / printer.capacity) * 100 : 0}
            low={printer.lowPaper || printer.paper === 0}
          />
          {thermal ? (
            <p className="mt-3 mb-0 text-[13px] text-muted-foreground">{t('Thermal printer (58 mm roll): it has no ink.')}</p>
          ) : (
          <Gauge
            icon={<Droplet size={16} />}
            label={t('Ink')}
            value={printer.ink == null ? t('Not reported') : `${printer.ink}%`}
            percent={printer.ink ?? 0}
            low={printer.lowInk || printer.ink === 0}
          />
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {printer.problem === 'jam' && (
          <Button onClick={() => act('/api/printer/clear', t('Paper jam cleared.'))}>
            <Wrench /> {t('Clear paper jam')}
          </Button>
        )}
        {(printer.problem === 'offline' || printer.problem === 'error') && (
          <Button onClick={() => act('/api/printer/clear', t('Printer is on.'))}>
            <Power /> {t('Printer is fixed')}
          </Button>
        )}
        <Button variant="outline" onClick={() => act('/api/printer/refill-paper', t('Paper tray filled.'))} disabled={!printer.reachable || printer.paper === printer.capacity}>
          <FileText /> {t('Refill paper')}
        </Button>
        {!thermal && (
          <Button variant="outline" onClick={() => act('/api/printer/replace-ink', t('New ink cartridge in.'))} disabled={!printer.reachable || printer.ink === 100}>
            <Droplet /> {t('Replace ink')}
          </Button>
        )}
        <Button variant="outline" onClick={() => act('/api/printer/test', t('Printing a test page…'))} disabled={!!printer.problem}>
          <Printer /> {t('Test page')}
        </Button>
      </div>
    </Panel>
  );
}

function Gauge({ icon, label, value, percent, low }: { icon: React.ReactNode; label: string; value: string; percent: number; low: boolean }) {
  const t = useT();
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex flex-wrap justify-between gap-1 text-[13px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon} {label}
        </span>
        <b className={low ? 'text-danger' : 'text-foreground'}>
          {value}
          {low ? ` · ${t('low')}` : ''}
        </b>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-accent" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <i className={cn('block h-full rounded-full transition-[width]', low ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
    </div>
  );
}
