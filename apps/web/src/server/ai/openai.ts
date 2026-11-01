import { z } from 'zod';
import { env } from '../env';

// OpenAI does two jobs after the built-in word filter has passed a wish:
//   1. moderation: a second, smarter safety check (free moderation model)
//   2. prompt processing: turns what the child said (English, Filipino or
//      Taglish) into a short English subject for the image model, double-
//      checks it is right for preschoolers, and writes the bilingual label
//      printed on the sheet.
// Without an API key both are skipped and the word filter alone decides.

export const openaiAvailable = () => !!env.OPENAI_API_KEY;

const API = 'https://api.openai.com/v1';

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`OpenAI ${path} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// OpenAI moderation categories mapped onto the WishPix ones.
const MODERATION_MAP: Record<string, string> = {
  violence: 'violence',
  'violence/graphic': 'violence',
  sexual: 'adult',
  'sexual/minors': 'adult',
  harassment: 'hate',
  'harassment/threatening': 'hate',
  hate: 'hate',
  'hate/threatening': 'hate',
  'self-harm': 'self_harm',
  'self-harm/intent': 'self_harm',
  'self-harm/instructions': 'self_harm',
  illicit: 'drugs',
  'illicit/violent': 'weapons',
};

export type ModerationResult = { flagged: false } | { flagged: true; category: string };

export async function moderate(text: string): Promise<ModerationResult> {
  const data = await post<{ results: { flagged: boolean; categories: Record<string, boolean> }[] }>(
    '/moderations',
    { model: env.OPENAI_MODERATION_MODEL, input: text },
    15_000
  );
  const result = data.results?.[0];
  if (!result?.flagged) return { flagged: false };
  const hit = Object.entries(result.categories).find(([, on]) => on)?.[0] ?? '';
  return { flagged: true, category: MODERATION_MAP[hit] ?? 'violence' };
}

const WishSchema = z.object({
  subject: z.string().max(120),
  label_en: z.string().max(40),
  label_fil: z.string().max(40),
  safe: z.boolean(),
  category: z.enum(['none', 'violence', 'weapons', 'adult', 'drugs', 'bad_language', 'hate', 'self_harm', 'personal_info', 'scary', 'rough_play']),
});
export type ProcessedWish = z.infer<typeof WishSchema>;

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'label_en', 'label_fil', 'safe', 'category'],
  properties: {
    subject: { type: 'string', description: 'What to draw, in simple English, max 12 words. No style words.' },
    label_en: { type: 'string', description: 'Short English label for the printed sheet, 1-3 words, e.g. "Happy cat".' },
    label_fil: { type: 'string', description: 'The same label in Filipino (Tagalog), 1-3 words, e.g. "Masayang pusa".' },
    safe: { type: 'boolean', description: 'False if the idea is not right for children aged 3 to 5.' },
    category: {
      type: 'string',
      enum: ['none', 'violence', 'weapons', 'adult', 'drugs', 'bad_language', 'hate', 'self_harm', 'personal_info', 'scary', 'rough_play'],
    },
  },
};

export type WishContext = { activity: string; theme: string; strict: boolean; language: string };

export async function processWish(text: string, ctx: WishContext): Promise<ProcessedWish> {
  const rules = [
    'You help a picture-printing kiosk in a Philippine daycare for children aged 3 to 5.',
    'A child said what they want to see, in English, Filipino or Taglish. Speech recognition may have small mistakes.',
    'Return the subject to draw in simple English, keeping the child\'s idea (do not add new objects, keep numbers they said).',
    'Write a 1-3 word label in English and in Filipino.',
    'Mark safe=false (with a category) for violence, weapons, adult content, drugs or alcohol, bad words, hate, self-harm or personal information.',
    ctx.strict ? 'Strict mode: also mark scary things (monsters, ghosts) and rough play (fighting, pirates, swords) as unsafe.' : '',
    'Silly and imaginative ideas are fine (a dragon eating pizza, a flying dog).',
  ]
    .filter(Boolean)
    .join(' ');

  const data = await post<{ choices: { message: { content: string | null; refusal?: string | null } }[] }>(
    '/chat/completions',
    {
      model: env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: rules },
        { role: 'user', content: `Activity: ${ctx.activity}. Theme: ${ctx.theme}. Spoken language: ${ctx.language}.\nChild said: "${text}"` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'wish', strict: true, schema: JSON_SCHEMA } },
    },
    20_000
  );
  const message = data.choices?.[0]?.message;
  if (!message?.content) {
    // A refusal means the model would not touch the request: treat it as unsafe.
    return { subject: text, label_en: '', label_fil: '', safe: false, category: 'violence' };
  }
  return WishSchema.parse(JSON.parse(message.content));
}
