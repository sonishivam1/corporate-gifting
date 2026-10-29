/**
 * A fixed-window counter per key (for example "sign-in:ada@example.com"),
 * in memory. Enough for the POC's single API instance; it moves to MongoDB
 * before the API runs on more than one (ADR 0015).
 */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();
  const current = (key: string) => {
    const w = windows.get(key);
    if (!w || w.resetAt <= now()) return null;
    return w;
  };
  return {
    /** Seconds until the key may try again, or 0 when it may now. */
    retryAfter(key: string): number {
      const w = current(key);
      return w && w.count >= options.limit ? Math.ceil((w.resetAt - now()) / 1000) : 0;
    },
    hit(key: string): void {
      const w = current(key);
      if (w) w.count += 1;
      else windows.set(key, { count: 1, resetAt: now() + options.windowMs });
      if (windows.size > 10_000) for (const [k, v] of windows) if (v.resetAt <= now()) windows.delete(k);
    },
    reset(key: string): void {
      windows.delete(key);
    },
  };
}
