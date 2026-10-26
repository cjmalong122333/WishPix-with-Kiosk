import fs from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_DIR } from './db.js';

// Pollinations.ai is free and needs no API key. The free tier allows one
// image every 45 seconds per IP and is sometimes busy (503), so requests
// wait and retry. One image takes about 10-60 seconds.
const BASE_URL = 'https://image.pollinations.ai/prompt/';
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function generateImage({ prompt, negative }, requestId) {
  const params = new URLSearchParams({
    width: '1024',
    height: '1024',
    safe: 'true',
    seed: String(Math.floor(Math.random() * 1e9)),
    ...(negative ? { negative_prompt: negative } : {}),
  });
  const url = `${BASE_URL}${encodeURIComponent(prompt)}?${params}`;

  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.ok || attempt === MAX_ATTEMPTS) break;
    if (res.status === 402) {
      // "Free limit reached ... Retry after 28s"
      const body = await res.text();
      const wait = Number(body.match(/Retry after (\d+)s/)?.[1] ?? 45);
      await sleep((wait + 1) * 1000);
    } else if (res.status >= 500) {
      await sleep(5000);
    } else {
      break;
    }
  }
  if (!res.ok) throw new Error(`Image service returned ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`Image service returned ${type || 'no image'}`);

  const ext = type.includes('png') ? 'png' : 'jpg';
  const file = `request-${requestId}.${ext}`;
  await fs.writeFile(path.join(IMAGE_DIR, file), Buffer.from(await res.arrayBuffer()));
  return file;
}

export async function checkInternet() {
  try {
    const res = await fetch('https://image.pollinations.ai/', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return res.status < 500;
  } catch {
    return false;
  }
}
