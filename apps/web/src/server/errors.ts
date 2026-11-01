// "fetch failed" alone hides the real reason (DNS, refused, timeout...).
export function describeError(err: unknown) {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: string; message?: string } | undefined;
  return cause ? `${err.message} (${cause.code ?? cause.message ?? 'unknown cause'})` : err.message;
}
