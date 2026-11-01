import { NextResponse, type NextRequest } from 'next/server';
import { env } from './env';
import { isLoopback, REMOTE_HEADER } from './realtime';

// Small helpers shared by every route handler.

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<Partial<T>> {
  try {
    const data = await req.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export const remoteAddress = (req: NextRequest) => req.headers.get(REMOTE_HEADER);

// The kiosk screen runs on the same Raspberry Pi as the server, so only
// local, non-tunnelled requests may act as the kiosk.
export function isKioskRequest(req: NextRequest) {
  if (env.KIOSK_ALLOW_REMOTE) return true;
  // Next.js adds x-forwarded-for itself, so proxies are recognised by the
  // headers they add: Cloudflare, ngrok, and x-real-ip from deploy/nginx.
  const tunnelled = req.headers.has('cf-connecting-ip') || req.headers.has('ngrok-trace-id') || req.headers.has('x-real-ip');
  return isLoopback(remoteAddress(req)) && !tunnelled;
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

// Wraps a handler so an unexpected error becomes a friendly 500, not a crash page.
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err);
      return fail('Something went wrong on the kiosk server. Try again.', 500);
    }
  };
}

export function kioskRoute<C>(handler: Handler<C>): Handler<C> {
  return route(async (req, ctx) => {
    if (!isKioskRequest(req)) return fail('Only the kiosk screen can do this.', 403);
    return handler(req, ctx);
  });
}

export const idParam = async (ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};
