import path from 'node:path';
import { z } from 'zod';

// Every setting comes from the environment (.env in development, the systemd
// unit on the Raspberry Pi). See .env.example for what each one does.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('file:./data/wishpix.db'),
  DATA_DIR: z.string().default('./data'),
  JWT_SECRET: z.string().optional(),
  KIOSK_ALLOW_REMOTE: z.stringbool().default(false),

  HARDWARE_URL: z.string().default('http://127.0.0.1:8765'),
  HARDWARE_TOKEN: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_STT_MODEL: z.string().default('scribe_v2'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5.6-luna'),
  OPENAI_MODERATION_MODEL: z.string().default('omni-moderation-latest'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().default('gemini-3.1-flash-image'),
  IMAGE_FALLBACK: z.enum(['pollinations', 'none']).default('pollinations'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid WishPix environment: ${z.prettifyError(parsed.error)}`);
}

const raw = parsed.data;
// Empty strings in .env mean "not set".
const opt = (v?: string) => (v && v.trim() ? v.trim() : undefined);

// Checked when the server runs, not while `next build` loads the modules.
const building = process.env.NEXT_PHASE === 'phase-production-build';
if (raw.NODE_ENV === 'production' && !building && !opt(raw.JWT_SECRET)) {
  throw new Error('JWT_SECRET must be set in production (any long random string).');
}

export const env = {
  ...raw,
  JWT_SECRET: opt(raw.JWT_SECRET) ?? 'wishpix-development-secret-change-me',
  HARDWARE_TOKEN: opt(raw.HARDWARE_TOKEN),
  ELEVENLABS_API_KEY: opt(raw.ELEVENLABS_API_KEY),
  OPENAI_API_KEY: opt(raw.OPENAI_API_KEY),
  GEMINI_API_KEY: opt(raw.GEMINI_API_KEY),
  DATA_DIR: path.resolve(raw.DATA_DIR),
  IMAGE_DIR: path.resolve(raw.DATA_DIR, 'images'),
};

export const isProduction = env.NODE_ENV === 'production';
