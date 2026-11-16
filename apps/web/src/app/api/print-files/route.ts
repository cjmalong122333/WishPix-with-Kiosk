import { teacherRoute } from '@/server/auth';
import { fail, json } from '@/server/http';
import { PrintFileError, upload } from '@/server/teacher-print';

export const dynamic = 'force-dynamic';

// Print to Kiosk, step 1: a teacher uploads a PNG, JPG or PDF (at most 10 MB).
// It is checked and kept for an hour for the preview; nothing prints yet.
export const POST = teacherRoute(async (req) => {
  let file: FormDataEntryValue | null = null;
  try {
    file = (await req.formData()).get('file');
  } catch {
    return fail('The file did not arrive. Try again.');
  }
  if (!(file instanceof File)) return fail('Choose a file to print.');
  try {
    return json(await upload(file));
  } catch (err) {
    if (err instanceof PrintFileError) return fail(err.message, 422);
    throw err;
  }
});
