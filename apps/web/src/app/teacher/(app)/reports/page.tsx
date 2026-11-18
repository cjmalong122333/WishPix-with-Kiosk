'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, FileText, FlaskConical, Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { activityName, themeName } from '@/lib/labels';
import { localDay, REPORT_TYPES, reportTitle, type ReportParams } from '@/lib/report-info';
import { clock, shortDate, toDate, when } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/components/teacher/confirm';
import { Empty, ErrorText, PageTitle, Panel, SectionHead, Tint } from '@/components/teacher/ui';

type SavedReport = { id: number; type: string; created_at: string; params: ReportParams };
type SessionRow = { id: number; theme: string; activity_type: string; started_at: string; requests: number };

export default function Reports() {
  const t = useT();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [reports, setReports] = useState<SavedReport[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [type, setType] = useState<string>('daily');
  const [form, setForm] = useState({ date: localDay(), sessionId: '', from: localDay(-6), to: localDay() });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const loadReports = useCallback(() => {
    api<{ reports: SavedReport[] }>('/api/reports')
      .then((r) => setReports(r.reports))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => loadReports(), [loadReports]);
  useEffect(() => {
    api<{ sessions: SessionRow[] }>('/api/sessions')
      .then((r) => {
        setSessions(r.sessions);
        setForm((f) => ({ ...f, sessionId: f.sessionId || String(r.sessions[0]?.id ?? '') }));
      })
      .catch(() => {});
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = type === 'daily' ? { type, date: form.date } : type === 'session' ? { type, sessionId: Number(form.sessionId) } : { type, from: form.from, to: form.to };
      const { report } = await api<{ report: { id: number } }>('/api/reports', { method: 'POST', body });
      router.push(`/teacher/reports/${report.id}`);
    } catch (err) {
      setError(t.error((err as Error).message));
      setBusy(false);
    }
  }

  async function remove(r: SavedReport) {
    if (!(await confirm({ title: t('Delete this report?'), text: t('This cannot be undone.'), confirm: t('Delete'), danger: true }))) return;
    try {
      await api(`/api/reports/${r.id}`, { method: 'DELETE' });
      toast.success(t('Report deleted.'));
      loadReports();
    } catch (err) {
      toast.error(t.error((err as Error).message));
    }
  }

  const at = (time: string) => {
    const d = toDate(time)!;
    return `${shortDate(d, t)} ${clock(d, t)}`;
  };

  return (
    <div>
      <PageTitle title={t('Reports')} lead={t('Make a report to print, save as PDF or download for your records.')} small />

      <Panel className="mt-4">
        <form onSubmit={create}>
          <h2 className="m-0 mb-3 text-base font-bold">{t('New report')}</h2>
          <div className="grid gap-2.5 md:grid-cols-2" role="radiogroup" aria-label={t('Report type')}>
            {REPORT_TYPES.map(({ id, icon: Icon, tone, name, text }) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={type === id}
                className={cn('flex items-center gap-3.5 rounded-[14px] border bg-card p-3.5 text-left', type === id && 'border-2 border-primary bg-accent/50 p-[13px]')}
                onClick={() => setType(id)}
              >
                <Tint tone={tone}>
                  <Icon />
                </Tint>
                <span>
                  <b className="block text-[15px]">{t(name)}</b>
                  <small className="text-[13px] text-muted-foreground">{t(text)}</small>
                </span>
              </button>
            ))}
            <div className="flex items-center gap-3.5 rounded-[14px] border border-dashed bg-card p-3.5 opacity-60" aria-disabled="true">
              <Tint tone="gray">
                <FlaskConical />
              </Tint>
              <span>
                <b className="block text-[15px]">{t('Research Evaluation Report')}</b>
                <small className="text-[13px] text-muted-foreground">{t('Coming soon.')}</small>
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {type === 'daily' && (
              <Field label={t('Day')} id="day">
                <Input id="day" type="date" value={form.date} max={localDay()} onChange={(e) => set({ date: e.target.value })} required />
              </Field>
            )}
            {type === 'session' &&
              (sessions.length ? (
                <Field label={t('Session')} id="session" wide>
                  <Select value={form.sessionId} onValueChange={(v) => set({ sessionId: v })}>
                    <SelectTrigger id="session" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sessions.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          #{s.id} · {themeName(s.theme, t)} · {activityName(s, t)} · {at(s.started_at)} · {t(s.requests === 1 ? '1 request' : '{n} requests', { n: s.requests })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <p className="m-0 text-[13px] text-muted-foreground">{t('No sessions yet. Run a session first.')}</p>
              ))}
            {type === 'safety' && (
              <>
                <Field label={t('From')} id="from">
                  <Input id="from" type="date" value={form.from} max={form.to} onChange={(e) => set({ from: e.target.value })} required />
                </Field>
                <Field label={t('To')} id="to">
                  <Input id="to" type="date" value={form.to} min={form.from} max={localDay()} onChange={(e) => set({ to: e.target.value })} required />
                </Field>
              </>
            )}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <Button className="mt-4" disabled={busy || (type === 'session' && !sessions.length)}>
            <FileText /> {busy ? t('Making the report…') : t('Create report')}
          </Button>
        </form>
      </Panel>

      <SectionHead title={t('Saved reports')} />
      {reports && reports.length === 0 && <Empty icon={<FileText />} title={t('No reports yet')} text={t('Reports you create are saved here.')} />}
      <ul className="m-0 grid list-none gap-2 p-0">
        {reports?.map((r) => {
          const kind = REPORT_TYPES.find((x) => x.id === r.type);
          const Icon = kind?.icon ?? FileText;
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-card">
              <Tint tone={kind?.tone ?? 'gray'} size="lg" className="size-12 rounded-lg">
                <Icon />
              </Tint>
              <Link className="flex min-w-0 flex-1 flex-col gap-0.5 no-underline" href={`/teacher/reports/${r.id}`}>
                <b className="text-[15px] break-words text-foreground">{reportTitle(r.type, r.params, t)}</b>
                <small className="text-xs text-muted-foreground">{t('Made {when}', { when: when(r.created_at, t) })}</small>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => remove(r)} aria-label={t('Delete report')}>
                <Trash2 />
              </Button>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground/70" aria-hidden="true" />
            </li>
          );
        })}
      </ul>
      {confirmDialog}
    </div>
  );
}

function Field({ label, id, children, wide }: { label: string; id: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('grid gap-1.5', wide ? 'w-full' : 'w-full sm:w-48')}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
