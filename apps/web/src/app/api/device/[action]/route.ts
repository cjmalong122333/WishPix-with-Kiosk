import { cancelListening, heard, kioskNext, startListening, submitWish, wakeKiosk } from '@/server/kiosk';
import { body, fail, json, kioskRoute } from '@/server/http';

const LANGS = ['en', 'fil', 'tl'];
const reply = (r: { error: string } | { ok: true }) => ('error' in r ? fail(r.error, 409) : json(r));

// What the child does at the kiosk: tap to talk, confirm the idea, finish.
export const POST = kioskRoute<{ params: Promise<{ action: string }> }>(async (req, ctx) => {
  const b = await body(req);
  switch ((await ctx.params).action) {
    case 'listen':
      return reply(await startListening());
    case 'cancel':
      await cancelListening();
      return json({ ok: true });
    // Text from the browser's own speech recognition, or typed on the screen.
    case 'heard':
      return reply(await heard(String(b.text ?? ''), LANGS.includes(String(b.language)) ? String(b.language) : null));
    case 'wish':
      return reply(await submitWish());
    case 'next':
      await kioskNext(Number(b.id));
      return json({ ok: true });
    case 'touch':
      wakeKiosk();
      return json({ ok: true });
    default:
      return fail('Unknown action.', 404);
  }
});
