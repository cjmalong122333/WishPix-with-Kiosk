import { heard } from '@/server/kiosk';
import { SpeechError, sttAvailable, transcribe, type SpeechLanguage } from '@/server/ai/stt';
import { fail, json, kioskRoute } from '@/server/http';

const MAX_BYTES = 5 * 1024 * 1024; // about 2 minutes of compressed speech

// The kiosk microphone recording, turned into text. The audio is only held
// in memory for this request and never saved.
export const POST = kioskRoute(async (req) => {
  if (!sttAvailable()) return fail('Speech-to-text is not set up.', 503);
  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) return fail("I didn't hear anything. Try again!");
  if (audio.size > MAX_BYTES) return fail('That was a long wish! Try a shorter one.');
  const raw = String(form?.get('language') ?? 'en');
  const language: SpeechLanguage = raw === 'fil' || raw === 'tl' ? raw : 'en';
  try {
    const text = await transcribe(audio, language);
    const result = await heard(text, language);
    if ('error' in result) return fail(result.error, 409);
    return json({ text });
  } catch (err) {
    if (err instanceof SpeechError) return fail("I didn't catch that. Try again!", 502);
    throw err;
  }
});
