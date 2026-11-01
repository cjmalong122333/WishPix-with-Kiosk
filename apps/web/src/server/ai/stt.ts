import { env } from '../env';

// Speech-to-text with ElevenLabs Scribe. The recording lives only in memory
// for this one request: it is never written to disk or the database.
// Without an API key the kiosk falls back to the browser's own speech
// recognition (or typing), so this module is optional.

export type SpeechLanguage = 'en' | 'fil' | 'tl';

const LANGUAGE_CODES: Record<SpeechLanguage, string | null> = {
  en: 'en',
  fil: 'fil',
  tl: null, // Taglish: let Scribe detect the mix
};

export const sttAvailable = () => !!env.ELEVENLABS_API_KEY;

export class SpeechError extends Error {}

export async function transcribe(audio: Blob, language: SpeechLanguage): Promise<string> {
  if (!env.ELEVENLABS_API_KEY) throw new SpeechError('Speech-to-text is not set up.');
  const form = new FormData();
  form.append('file', audio, 'wish.webm');
  form.append('model_id', env.ELEVENLABS_STT_MODEL);
  form.append('tag_audio_events', 'false');
  const code = LANGUAGE_CODES[language];
  if (code) form.append('language_code', code);

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.error(`[stt] ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw new SpeechError(`Speech service returned ${res.status}`);
  }
  const data = (await res.json()) as { text?: string };
  return String(data.text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
