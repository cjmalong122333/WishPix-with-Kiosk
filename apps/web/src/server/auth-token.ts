import { SignJWT, jwtVerify } from 'jose';

// Teacher sign-in tokens (JWT in an httpOnly cookie). Also used by server.ts
// to check Socket.IO connections, so this file only reads process.env.

export const COOKIE_NAME = 'wp_session';
export const TOKEN_HOURS = 12;

export type TokenClaims = { teacherId: number; ver: number };

function secret() {
  const value = process.env.JWT_SECRET?.trim();
  if (!value && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production.');
  return new TextEncoder().encode(value || 'wishpix-development-secret-change-me');
}

export async function signToken(claims: TokenClaims) {
  return new SignJWT({ ver: claims.ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(claims.teacherId))
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_HOURS}h`)
    .sign(secret());
}

export async function verifyToken(token: string | undefined | null): Promise<TokenClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const teacherId = Number(payload.sub);
    if (!Number.isInteger(teacherId)) return null;
    return { teacherId, ver: Number(payload.ver ?? 0) };
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined | null, name = COOKIE_NAME) {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
