import { teacherRoute } from '@/server/auth';
import { fail } from '@/server/http';
import { preview, PrintFileError } from '@/server/teacher-print';

export const dynamic = 'force-dynamic';

// One page of an uploaded file exactly as the kiosk printer will print it:
// on a 4x6 page for the inkjet, or scaled to the 58 mm roll, black and white
// and dithered, for a thermal printer. ?page=2 for page 2 of a PDF.
export const GET = teacherRoute<{ params: Promise<{ upload: string }> }>(async (req, _teacher, ctx) => {
  const id = (await ctx.params).upload;
  const page = Number(req.nextUrl.searchParams.get('page') ?? 1);
  try {
    const png = await preview(id, page);
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } });
  } catch (err) {
    if (err instanceof PrintFileError) return fail(err.message, 422);
    throw err;
  }
});
