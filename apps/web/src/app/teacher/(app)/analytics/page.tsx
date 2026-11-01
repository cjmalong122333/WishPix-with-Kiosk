'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { StatsView, type Stats } from '@/components/teacher/stats-view';
import { Chips, ErrorText, PageTitle } from '@/components/teacher/ui';

const RANGES = [['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']] as const;

// Headline numbers and charts about how the kiosk is used.
export default function Analytics() {
  const t = useT();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('7d');
  const [data, setData] = useState<{ range: string; stats: Stats } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = data?.range !== range;

  useEffect(() => {
    let stop = false;
    api<Stats>(`/api/analytics?range=${range}`)
      .then((stats) => {
        if (stop) return;
        setData({ range, stats });
        setError(null);
      })
      .catch((e: Error) => !stop && setError(e.message));
    return () => {
      stop = true;
    };
  }, [range]);

  return (
    <div>
      <PageTitle title={t('Analytics')} lead={t('How the children use the kiosk, and how well it works.')} small />
      <div className="mt-4 mb-4">
        <Chips label={t('Date range')} options={RANGES.map(([id, l]) => [id, t(l)])} value={range} onChange={setRange} />
      </div>
      {error && <ErrorText>{t.error(error)}</ErrorText>}
      {/* While a new range loads, the old numbers stay, faded. */}
      {data && (
        <div className={cn('transition-opacity', loading && 'opacity-50')}>
          <StatsView data={data.stats} />
        </div>
      )}
    </div>
  );
}
