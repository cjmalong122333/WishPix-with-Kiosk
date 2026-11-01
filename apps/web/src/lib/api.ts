// Calls the WishPix API. Teacher sign-in travels in an httpOnly cookie, so
// nothing secret is kept in the page. Errors throw with the server's message.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

const listeners = new Set<() => void>();
// The Teacher App signs out when any call finds the sign-in expired.
export const onSignedOut = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export async function api<T = Record<string, unknown>>(path: string, { method = 'GET', body, form, signal }: Options = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) listeners.forEach((fn) => fn());
    throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}
