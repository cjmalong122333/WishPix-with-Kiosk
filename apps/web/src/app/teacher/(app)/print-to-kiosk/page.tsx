'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, FileImage, FileText, Minus, Plus, RotateCcw, Send, Upload, X } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLive } from '@/components/teacher/auth';
import { Empty, ErrorText, PageTitle, Panel, SectionHead, Tag, Warn } from '@/components/teacher/ui';

// Print to Kiosk: a teacher sends a PNG, JPG or PDF to the kiosk printer.
// The preview is drawn by the printer service exactly as it will print. The
// kiosk prints it the next time no child is in the middle of a wish
// (src/server/teacher-print.ts). These are "Teacher Print" pages: they are
// never counted with the children's pictures.

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf';
const MAX_COPIES = 10;

type Upload = { upload: string; fileName: string; fileType: 'png' | 'jpg' | 'pdf'; pages: number };
type Job = {
  id: number;
  fileName: string;
  fileType: string;
  pageCount: number;
  pageRange: string;
  copies: number;
  status: 'pending' | 'printing' | 'done' | 'failed' | 'cancelled';
  sheetsDone: number;
  sheetsTotal: number;
  errorMessage: string | null;
  createdAt: string;
  printedAt: string | null;
  teacherName: string;
  fileKept: boolean;
  kioskId: number | null;
};
type Jobs = { jobs: Job[]; kiosks: { id: number; name: string }[] };

const STATUS: Record<Job['status'], { label: string; tone: 'blue' | 'amber' | 'green' | 'red' | 'gray' }> = {
  pending: { label: 'Pending', tone: 'amber' },
  printing: { label: 'Printing', tone: 'blue' },
  done: { label: 'Done', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export default function PrintToKiosk() {
  const t = useT();
  const live = useLive();
  const [file, setFile] = useState<Upload | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [copies, setCopies] = useState(1);
  const [allPages, setAllPages] = useState(true);
  const [range, setRange] = useState('');
  const [kioskId, setKioskId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [data, setData] = useState<Jobs | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<Jobs>('/api/print-jobs')
      .then(setData)
      .catch((e: Error) => toast.error(t.error(e.message)));
  }, [t]);

  // The list follows the kiosk: a job starts, prints page by page, finishes.
  const printing = live?.teacherPrint?.printing;
  const pending = live?.teacherPrint?.pending;
  useEffect(load, [load, pending, printing?.id, printing?.done]);

  const reset = () => {
    setFile(null);
    setPage(1);
    setCopies(1);
    setAllPages(true);
    setRange('');
    setError(null);
    if (input.current) input.current.value = '';
  };

  async function choose(chosen: File | undefined) {
    reset();
    if (!chosen) return;
    // Checked here for a quick answer, and again on the server.
    if (!/\.(png|jpe?g|pdf)$/i.test(chosen.name)) return setError(t('Only PNG, JPG and PDF files can be printed.'));
    if (chosen.size > MAX_BYTES) return setError(t('The file is larger than 10 MB. Make it smaller and try again.'));
    setChecking(true);
    try {
      const form = new FormData();
      form.append('file', chosen);
      setFile(await api<Upload>('/api/print-files', { method: 'POST', form }));
    } catch (err) {
      setError(t.error((err as Error).message));
    } finally {
      setChecking(false);
    }
  }

  async function send() {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      await api('/api/print-jobs', {
        method: 'POST',
        body: { upload: file.upload, copies, pageRange: allPages ? 'all' : range, kioskId: kioskId ? Number(kioskId) : undefined },
      });
      toast.success(t('Sent. The kiosk prints it as soon as no child is using it.'));
      reset();
      load();
    } catch (err) {
      setError(t.error((err as Error).message));
    } finally {
      setSending(false);
    }
  }

  async function act(job: Job, action: 'cancel' | 'retry') {
    try {
      await api(`/api/print-jobs/${job.id}/${action}`, { method: 'POST' });
      toast.success(action === 'cancel' ? t('Cancelled.') : t('Sent again. It prints when the kiosk is free.'));
      load();
    } catch (err) {
      toast.error(t.error((err as Error).message));
    }
  }

  const format = live?.printer?.format;
  const paper = format === '58mm' ? t('a 58 mm thermal roll (black and white)') : t('a 4×6 sticker sheet');
  const kiosks = data?.kiosks ?? [];

  return (
    <div className="grid gap-4">
      <PageTitle title={t('Print to Kiosk')} lead={t('Send a PNG, JPG or PDF to the kiosk printer. It prints when no child is in the middle of a wish.')} small />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <SectionHead title={t('Send a file')} lead={t('PNG, JPG or PDF, up to 10 MB.')} />
          <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void choose(e.target.files?.[0])} aria-label={t('Choose a file')} />

          {!file ? (
            <button
              className="mt-3 flex w-full flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#b6c0cf] bg-[#fafbfd] px-6 py-10 text-center"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer.files?.[0]);
              }}
              disabled={checking}
            >
              <Upload className="size-8 text-muted-foreground" />
              <b className="text-foreground">{checking ? t('Checking the file…') : t('Choose a file')}</b>
              <small className="text-muted-foreground">{t('or drop it here')}</small>
            </button>
          ) : (
            <div className="mt-3 grid gap-4">
              <div className="flex items-center gap-3 rounded-xl border bg-[#fafbfd] p-3">
                {file.fileType === 'pdf' ? <FileText className="shrink-0 text-red-600" /> : <FileImage className="shrink-0 text-blue-600" />}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{file.fileName}</b>
                  <small className="text-muted-foreground">
                    {file.fileType.toUpperCase()} · {file.pages === 1 ? t('1 page') : t('{n} pages', { n: file.pages })}
                  </small>
                </span>
                <Button variant="ghost" size="sm" onClick={reset} aria-label={t('Remove the file')}>
                  <X />
                </Button>
              </div>

              <figure className="m-0">
                <div className="grid min-h-48 place-items-center rounded-xl border bg-[repeating-conic-gradient(#f1f4f8_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`${file.upload}-${page}-${format}`}
                    src={`/api/print-files/${file.upload}/preview?page=${page}&fmt=${format ?? ''}`}
                    alt={t('Page {n} as it will print', { n: page })}
                    className="max-h-[420px] max-w-full bg-white shadow-card"
                  />
                </div>
                <figcaption className="mt-2 flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
                  <span>{t('Preview: as it will print on {paper}.', { paper })}</span>
                  {file.pages > 1 && (
                    <span className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label={t('Previous page')}>
                        <ChevronLeft />
                      </Button>
                      <b className="min-w-16 text-center text-foreground">{t('{n} of {total}', { n: page, total: file.pages })}</b>
                      <Button variant="outline" size="icon" className="size-8" onClick={() => setPage((p) => Math.min(file.pages, p + 1))} disabled={page === file.pages} aria-label={t('Next page')}>
                        <ChevronRight />
                      </Button>
                    </span>
                  )}
                </figcaption>
              </figure>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-bold">
                  {t('Copies')}
                  <span className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => setCopies((c) => Math.max(1, c - 1))} disabled={copies <= 1} aria-label={t('Fewer copies')}>
                      <Minus />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_COPIES}
                      value={copies}
                      onChange={(e) => setCopies(Math.min(MAX_COPIES, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                      className="w-16 text-center"
                    />
                    <Button variant="outline" size="icon" onClick={() => setCopies((c) => Math.min(MAX_COPIES, c + 1))} disabled={copies >= MAX_COPIES} aria-label={t('More copies')}>
                      <Plus />
                    </Button>
                  </span>
                </label>

                {kiosks.length > 1 && (
                  <label className="grid gap-1.5 text-sm font-bold">
                    {t('Kiosk')}
                    <Select value={kioskId || String(kiosks[0].id)} onValueChange={setKioskId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {kiosks.map((k) => (
                          <SelectItem key={k.id} value={String(k.id)}>
                            {k.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                )}
              </div>

              {file.pages > 1 && (
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="mb-1.5 text-sm font-bold">{t('Pages')}</legend>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="pages" checked={allPages} onChange={() => setAllPages(true)} />
                    {t('All {n} pages', { n: file.pages })}
                  </label>
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="radio" name="pages" checked={!allPages} onChange={() => setAllPages(false)} />
                    {t('Only these pages:')}
                    <Input
                      value={range}
                      onFocus={() => setAllPages(false)}
                      onChange={(e) => setRange(e.target.value)}
                      placeholder={t('e.g. 1-3, 5')}
                      maxLength={60}
                      className="h-8 w-40"
                      aria-label={t('Pages to print')}
                    />
                  </label>
                  <small className="text-muted-foreground">{t('Each page prints as its own sheet.')}</small>
                </fieldset>
              )}

              <Button onClick={() => void send()} disabled={sending || (!allPages && !range.trim())}>
                <Send /> {sending ? t('Sending…') : t('Send to Kiosk')}
              </Button>
            </div>
          )}
          {error && <ErrorText>{error}</ErrorText>}
          {live?.printer?.problem && <Warn>{t('The printer has a problem ({problem}). Files wait, or fail, until it is fixed in Print Management.', { problem: t(live.printer.problemText ?? live.printer.problem) })}</Warn>}
        </Panel>

        <Panel>
          <SectionHead title={t('Teacher prints')} lead={t('Newest first. Not counted with the children’s pictures.')} />
          {!data ? (
            <p className="text-[13px] text-muted-foreground">{t('Loading…')}</p>
          ) : data.jobs.length === 0 ? (
            <Empty icon={<Send />} title={t('Nothing sent yet')} text={t('Files you send to the kiosk appear here with their status.')} />
          ) : (
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {data.jobs.map((job) => (
                <JobRow key={job.id} job={job} live={printing?.id === job.id ? printing : null} onAct={act} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function JobRow({ job, live, onAct }: { job: Job; live: { done: number; total: number } | null; onAct: (job: Job, action: 'cancel' | 'retry') => void }) {
  const t = useT();
  const status = STATUS[job.status];
  const done = live?.done ?? job.sheetsDone;
  const pages = job.pageRange === 'all' ? (job.pageCount === 1 ? t('1 page') : t('{n} pages', { n: job.pageCount })) : t('Pages {range}', { range: job.pageRange });
  const when = new Date(job.printedAt ?? job.createdAt).toLocaleString(t.locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        {job.fileType === 'pdf' ? <FileText className="mt-0.5 shrink-0 text-red-600" size={20} /> : <FileImage className="mt-0.5 shrink-0 text-blue-600" size={20} />}
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">{job.fileName}</b>
          <small className="text-muted-foreground">
            {pages} · {job.copies === 1 ? t('1 copy') : t('{n} copies', { n: job.copies })} · {job.teacherName} · {when}
          </small>
        </span>
        <Tag tone={status.tone}>
          {t(status.label)}
          {job.status === 'printing' && ` ${t('{n} of {total}', { n: done, total: job.sheetsTotal })}`}
        </Tag>
      </div>
      {job.status === 'printing' && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9eef5]">
          <div className="h-full rounded-full bg-blue-accent transition-[width] duration-700" style={{ width: `${Math.max(5, (100 * done) / Math.max(1, job.sheetsTotal))}%` }} />
        </div>
      )}
      {job.status === 'pending' && <p className="m-0 mt-2 text-[13px] text-muted-foreground">{t('Waiting until no child is using the kiosk.')}</p>}
      {job.errorMessage && <p className={cn('m-0 mt-2 text-[13px]', job.status === 'failed' ? 'text-danger' : 'text-muted-foreground')}>{t(job.errorMessage)}</p>}
      {(job.status === 'pending' || (job.status === 'failed' && job.fileKept)) && (
        <div className="mt-2 flex justify-end">
          {job.status === 'pending' ? (
            <Button variant="outline" size="sm" onClick={() => onAct(job, 'cancel')}>
              <X /> {t('Cancel')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onAct(job, 'retry')}>
              <RotateCcw /> {t('Retry')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
