import fs from 'node:fs/promises';
import { describeError } from '../errors';
import path from 'node:path';
import { env } from '../env';
import type { BuiltPrompt } from '../catalog';

// Image generation. Gemini (Flash Image) is the main provider; when it has
// no key or fails, the free Pollinations.ai service is used instead (set
// IMAGE_FALLBACK=none to turn that off).

export type ImageResult = { file: string; provider: 'gemini' | 'pollinations' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const geminiAvailable = () => !!env.GEMINI_API_KEY;

export async function generateImage(built: BuiltPrompt, requestId: number): Promise<ImageResult> {
  if (env.GEMINI_API_KEY) {
    try {
      const image = await gemini(built);
      return { file: await save(image, requestId), provider: 'gemini' };
    } catch (err) {
      console.error(`[image] Gemini failed for request ${requestId}:`, describeError(err));
      if (env.IMAGE_FALLBACK === 'none') throw err;
    }
  } else if (env.IMAGE_FALLBACK === 'none') {
    throw new Error('No image provider is set up (GEMINI_API_KEY is empty and IMAGE_FALLBACK=none).');
  }
  const image = await pollinations(built);
  return { file: await save(image, requestId), provider: 'pollinations' };
}

type Image = { bytes: Buffer; mime: string };

async function save({ bytes, mime }: Image, requestId: number) {
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const file = `request-${requestId}.${ext}`;
  await fs.writeFile(path.join(env.IMAGE_DIR, file), bytes);
  return file;
}

async function gemini({ prompt, negative }: BuiltPrompt): Promise<Image> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_IMAGE_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${prompt}.\nAvoid: ${negative}.` }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Gemini returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  type Part = { inlineData?: { mimeType: string; data: string } };
  const data = (await res.json()) as { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[] };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData) throw new Error(`Gemini returned no image (${data.candidates?.[0]?.finishReason ?? 'no candidates'})`);
  return { bytes: Buffer.from(part.inlineData.data, 'base64'), mime: part.inlineData.mimeType };
}

// Pollinations.ai is free and needs no key. The free tier allows one image
// every 45 seconds per IP and is sometimes busy, so requests wait and retry.
async function pollinations({ prompt, negative }: BuiltPrompt): Promise<Image> {
  const params = new URLSearchParams({
    width: '1024',
    height: '1024',
    safe: 'true',
    nologo: 'true',
    seed: String(Math.floor(Math.random() * 1e9)),
    negative_prompt: negative,
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`;
  let res: Response | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (res.ok) break;
    if (res.status === 402 || res.status === 429) {
      const wait = Number((await res.text()).match(/Retry after (\d+)s/)?.[1] ?? 45);
      await sleep((wait + 1) * 1000);
    } else if (res.status >= 500) {
      await sleep(5000);
    } else break;
  }
  if (!res?.ok) throw new Error(`Pollinations returned ${res?.status}`);
  const mime = res.headers.get('content-type') ?? '';
  if (!mime.startsWith('image/')) throw new Error(`Pollinations returned ${mime || 'no image'}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime };
}

// Online when either image service answers (any HTTP reply counts).
export async function checkInternet() {
  const targets = ['https://generativelanguage.googleapis.com/', 'https://image.pollinations.ai/'];
  try {
    await Promise.any(
      targets.map(async (url) => {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
        if (res.status >= 500) throw new Error(String(res.status));
      })
    );
    return true;
  } catch {
    return false;
  }
}
