import { env } from '@/server/env';
import { sttAvailable } from '@/server/ai/stt';
import { openaiAvailable } from '@/server/ai/openai';
import { geminiAvailable } from '@/server/ai/image';
import { printerState } from '@/server/printer';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

// Which services are set up, for Kiosk Management. Never returns the keys.
export const GET = teacherRoute(async () => {
  const printer = printerState();
  return json({
    version: process.env.npm_package_version ?? '1.0.0',
    speech: sttAvailable() ? { provider: 'ElevenLabs', model: env.ELEVENLABS_STT_MODEL } : { provider: 'browser', model: null },
    safety: openaiAvailable() ? { provider: 'Word filter + OpenAI', model: env.OPENAI_MODEL } : { provider: 'Word filter', model: null },
    images: geminiAvailable()
      ? { provider: 'Gemini', model: env.GEMINI_IMAGE_MODEL, fallback: env.IMAGE_FALLBACK === 'pollinations' ? 'Pollinations' : null }
      : { provider: env.IMAGE_FALLBACK === 'pollinations' ? 'Pollinations' : 'none', model: null, fallback: null },
    printer: { reachable: printer.reachable, mode: printer.mode, name: printer.printerName },
  });
});
