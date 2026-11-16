import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './db';
import { env } from './env';
import * as printer from './printer';

// Print to Kiosk: files a teacher sends to the kiosk printer (PNG, JPG, PDF).
//
// 1. upload: the file is checked (type from its first bytes, at most 10 MB)
//    and kept in data/uploads as "staged-<id>" for an hour, so the teacher
//    can look at the preview and choose pages and copies.
// 2. createJob: a PrintJob row, status "pending".
// 3. The kiosk screen asks for the next job only when no child is in the
//    middle of a wish (claimTeacherPrint in kiosk.ts), so a child is never
//    interrupted. The job is "printing", then "done" or "failed" (with the
//    printer's problem). Failed jobs can be retried; pending ones cancelled.
// 4. The file is deleted when the job is done or cancelled.
//
// Teacher prints are not children's prints: they are not counted with the
// children's pictures and appear as "Teacher Print".

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_COPIES = 10;
const STAGED_HOURS = 1;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' } as const;
export type FileType = keyof typeof TYPES;
const EXTENSIONS: Record<string, FileType> = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.pdf': 'pdf' };

export class PrintFileError extends Error {}

// From the file's first bytes, not its name.
export function detectType(bytes: Uint8Array): FileType | null {
  const head = Buffer.from(bytes.subarray(0, 1024));
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.includes('%PDF-')) return 'pdf';
  return null;
}

// "all", or pages and ranges like "1-3, 5". Returns how many pages that is,
// or an error message. The hardware service checks it again when printing.
export function countPages(range: string, pageCount: number): number | string {
  const spec = range.trim().toLowerCase();
  if (!spec || spec === 'all') return pageCount;
  const pages = new Set<number>();
  for (const part of spec.replace(/\s+/g, '').split(',').filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return `"${part}" is not a page number or a range like 2-4.`;
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    if (a < 1 || b > pageCount || a > b) return `Pages ${part} are not in this file (it has ${pageCount}).`;
    for (let p = a; p <= b; p++) pages.add(p);
  }
  return pages.size || 'Choose at least one page.';
}

const stagedPath = (id: string, type: FileType) => path.join(env.UPLOAD_DIR, `staged-${id}.${type}`);
const metaPath = (id: string) => path.join(env.UPLOAD_DIR, `staged-${id}.json`);
type Staged = { fileName: string; fileType: FileType; pages: number };

// Old previews the teacher never sent, and files of jobs that are gone.
async function sweep() {
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
  const cutoff = Date.now() - STAGED_HOURS * 3600_000;
  const kept = new Set((await prisma.printJob.findMany({ where: { filePath: { not: null } }, select: { filePath: true } })).map((j) => j.filePath));
  for (const name of await fs.readdir(env.UPLOAD_DIR)) {
    const full = path.join(env.UPLOAD_DIR, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile() || kept.has(name)) continue;
    if (!name.startsWith('staged-') || stat.mtimeMs < cutoff) await fs.unlink(full).catch(() => {});
  }
}

export async function upload(file: File) {
  const name = path.basename(file.name || 'file').slice(0, 120);
  if (file.size > MAX_FILE_BYTES) throw new PrintFileError('The file is larger than 10 MB. Make it smaller and try again.');
  if (!EXTENSIONS[path.extname(name).toLowerCase()]) throw new PrintFileError('Only PNG, JPG and PDF files can be printed.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectType(bytes);
  if (!type) throw new PrintFileError('This file is not really a PNG, JPG or PDF. Save it again as one of those and try again.');

  let pages = 1;
  try {
    pages = (await printer.inspectFile(bytes, name)).pages;
  } catch (err) {
    if (err instanceof printer.HardwareError && err.status === 422) throw new PrintFileError(err.message);
    throw new PrintFileError('The printer service is not running, so the file cannot be checked. Try again in a moment.');
  }

  await sweep();
  const id = crypto.randomUUID();
  await fs.writeFile(stagedPath(id, type), bytes);
  await fs.writeFile(metaPath(id), JSON.stringify({ fileName: name, fileType: type, pages } satisfies Staged));
  return { upload: id, fileName: name, fileType: type, pages };
}

async function staged(id: string): Promise<(Staged & { file: string }) | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  try {
    const meta = JSON.parse(await fs.readFile(metaPath(id), 'utf8')) as Staged;
    return { ...meta, file: stagedPath(id, meta.fileType) };
  } catch {
    return null;
  }
}

// One page (1-based) of a staged upload, as it will print.
export async function preview(id: string, page: number) {
  const s = await staged(id);
  if (!s) throw new PrintFileError('This upload has expired. Choose the file again.');
  if (!Number.isInteger(page) || page < 1 || page > s.pages) throw new PrintFileError('That page is not in this file.');
  try {
    return await printer.previewFile(new Uint8Array(await fs.readFile(s.file)), s.fileName, page);
  } catch (err) {
    if (err instanceof printer.HardwareError && err.status === 422) throw new PrintFileError(err.message);
    throw new PrintFileError('The printer service is not running, so there is no preview. Try again in a moment.');
  }
}

export async function createJob(teacherId: number, kioskId: number, input: { upload: string; copies: number; pageRange: string }) {
  const s = await staged(input.upload);
  if (!s) throw new PrintFileError('This upload has expired. Choose the file again.');
  const copies = Math.round(input.copies);
  if (!(copies >= 1 && copies <= MAX_COPIES)) throw new PrintFileError(`Copies must be between 1 and ${MAX_COPIES}.`);
  const pageRange = s.fileType === 'pdf' ? input.pageRange.trim() || 'all' : 'all';
  const count = countPages(pageRange, s.pages);
  if (typeof count === 'string') throw new PrintFileError(count);

  const kept = `job-${input.upload}.${s.fileType}`;
  await fs.rename(s.file, path.join(env.UPLOAD_DIR, kept));
  await fs.unlink(metaPath(input.upload)).catch(() => {});
  return prisma.printJob.create({
    data: {
      fileName: s.fileName,
      filePath: kept,
      fileType: s.fileType,
      pageCount: s.pages,
      pageRange,
      copies,
      sheetsTotal: count * copies,
      createdBy: teacherId,
      kioskId,
    },
  });
}

export const listJobs = () =>
  prisma.printJob.findMany({ orderBy: { id: 'desc' }, take: 40, include: { teacher: { select: { displayName: true } } } });

export const pendingJobs = () => prisma.printJob.count({ where: { status: 'pending' } });

async function removeFile(job: { id: number; filePath: string | null }) {
  if (!job.filePath) return;
  await fs.unlink(path.join(env.UPLOAD_DIR, path.basename(job.filePath))).catch(() => {});
  await prisma.printJob.update({ where: { id: job.id }, data: { filePath: null } });
}

// Only a job that has not started can be cancelled.
export async function cancelJob(id: number) {
  const { count } = await prisma.printJob.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled' } });
  if (!count) return false;
  await removeFile(await prisma.printJob.findUniqueOrThrow({ where: { id } }));
  return true;
}

// A failed job goes back in the queue (its file is kept until it prints).
export async function retryJob(id: number) {
  const job = await prisma.printJob.findUnique({ where: { id } });
  if (!job || job.status !== 'failed') return 'Only a failed job can be printed again.';
  if (!job.filePath) return 'The file of this job is gone. Send it again.';
  await prisma.printJob.update({ where: { id }, data: { status: 'pending', sheetsDone: 0, errorMessage: null } });
  return null;
}

// Takes the oldest pending job, marking it "printing" (only one caller can win).
export async function takeNextJob() {
  const next = await prisma.printJob.findFirst({ where: { status: 'pending' }, orderBy: { id: 'asc' } });
  if (!next) return null;
  const { count } = await prisma.printJob.updateMany({ where: { id: next.id, status: 'pending' }, data: { status: 'printing' } });
  return count ? { ...next, status: 'printing' } : null;
}

export async function failJob(id: number, problem: string) {
  await prisma.printJob.update({ where: { id }, data: { status: 'failed', errorMessage: printer.PROBLEMS[problem] ?? problem } });
}

// Prints a taken job. Resolves when it is done or failed. Never throws.
export async function runJob(job: { id: number; filePath: string | null; fileName: string; pageRange: string; copies: number }, onProgress: (done: number, total: number) => void) {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await fs.readFile(path.join(env.UPLOAD_DIR, path.basename(job.filePath ?? ''))));
  } catch {
    await prisma.printJob.update({ where: { id: job.id }, data: { status: 'failed', errorMessage: 'The file is missing. Send it again.' } });
    return;
  }
  const problem = await printer.printFile(bytes, job.fileName, job.pageRange, job.copies, (done, total) => {
    onProgress(done, total);
    void prisma.printJob.update({ where: { id: job.id }, data: { sheetsDone: done } }).catch(() => {});
  });
  if (problem) {
    await failJob(job.id, problem);
    return;
  }
  await prisma.printJob.update({ where: { id: job.id }, data: { status: 'done', printedAt: new Date(), errorMessage: null } });
  await removeFile(job);
}

// After a restart, a job that was printing did not finish: it failed (the
// teacher can retry it).
export async function recoverJobs() {
  await prisma.printJob.updateMany({ where: { status: 'printing' }, data: { status: 'failed', errorMessage: 'The kiosk restarted while printing. Print it again.' } });
  await sweep().catch(() => {});
}

export const fileType = (type: string) => TYPES[type as FileType] ?? 'application/octet-stream';
