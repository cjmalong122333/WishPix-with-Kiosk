import type { NextRequest } from 'next/server';

// Query-string filters shared by the Activity Logs and Analytics routes.
const RANGES = ['today', '7d', '30d', 'all'];

export const rangeOf = (req: NextRequest) => {
  const range = req.nextUrl.searchParams.get('range') ?? '';
  return RANGES.includes(range) ? range : '7d';
};

export const pageOf = (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  return { limit: Math.min(100, Number(q.get('limit')) || 30), offset: Math.max(0, Number(q.get('offset')) || 0) };
};

export const requestFilters = (req: NextRequest) => ({
  range: rangeOf(req),
  status: req.nextUrl.searchParams.get('status'),
  q: req.nextUrl.searchParams.get('q'),
});
