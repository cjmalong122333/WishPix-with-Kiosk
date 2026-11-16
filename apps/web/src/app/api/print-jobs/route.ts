import { z } from 'zod';
import { teacherRoute } from '@/server/auth';
import { prisma } from '@/server/db';
import { logEvent } from '@/server/events';
import { body, fail, json } from '@/server/http';
import { broadcast } from '@/server/kiosk';
import { createJob, listJobs, MAX_COPIES, PrintFileError } from '@/server/teacher-print';

export const dynamic = 'force-dynamic';

// Print to Kiosk: the jobs (newest first) and the kiosks a job can go to.
export const GET = teacherRoute(async () => {
  const [jobs, kiosks] = await Promise.all([listJobs(), prisma.kiosk.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })]);
  return json({
    kiosks,
    jobs: jobs.map(({ teacher, filePath, ...job }) => ({ ...job, teacherName: teacher.displayName, fileKept: !!filePath })),
  });
});

const Send = z.object({
  upload: z.string().min(1, 'Choose a file to print.'),
  copies: z.coerce.number().int().min(1).max(MAX_COPIES, `Copies must be between 1 and ${MAX_COPIES}.`).default(1),
  pageRange: z.string().max(60).default('all'),
  kioskId: z.coerce.number().int().positive().optional(),
});

// "Send to Kiosk": the uploaded file joins the queue. The kiosk prints it
// the next time no child is in the middle of a wish.
export const POST = teacherRoute(async (req, teacher) => {
  const parsed = Send.safeParse(await body(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the print settings.');
  const { kioskId, ...input } = parsed.data;
  const kiosk = kioskId ? await prisma.kiosk.findUnique({ where: { id: kioskId } }) : await prisma.kiosk.findFirst({ orderBy: { id: 'asc' } });
  if (!kiosk) return fail('That kiosk was not found.', 404);
  try {
    const job = await createJob(teacher.id, kiosk.id, input);
    await logEvent('print_teacher_send', { jobId: job.id, fileName: job.fileName, copies: job.copies, pages: job.pageRange }, teacher.id);
    await broadcast();
    return json({ job });
  } catch (err) {
    if (err instanceof PrintFileError) return fail(err.message, 422);
    throw err;
  }
});
