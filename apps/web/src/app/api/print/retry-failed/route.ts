import { retryFailedPrints } from '@/server/kiosk';
import { logEvent } from '@/server/events';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const POST = teacherRoute(async (_req, teacher) => {
  const result = await retryFailedPrints();
  if ('error' in result) return json(result, 409);
  await logEvent('print_retry', { count: result.count }, teacher.id);
  return json(result);
});
