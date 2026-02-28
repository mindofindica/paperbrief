/**
 * Simple in-memory IP-based rate limiter.
 *
 * This resets on cold starts (no cross-instance state), which is acceptable
 * for MVP. For production scale, swap for Upstash Redis or a Supabase table.
 */

const store = new Map<string, number[]>();

export type RateLimiterOptions = {
  windowMs?: number; // default: 1 hour
  maxAttempts?: number; // default: 3
};

export function checkRateLimit(
  ip: string,
  opts: RateLimiterOptions = {}
): { limited: boolean; remaining: number } {
  const windowMs = opts.windowMs ?? 60 * 60 * 1000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const now = Date.now();

  const attempts = (store.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (attempts.length >= maxAttempts) {
    return { limited: true, remaining: 0 };
  }

  attempts.push(now);
  store.set(ip, attempts);
  return { limited: false, remaining: maxAttempts - attempts.length };
}

/** Clear the store — for testing only */
export function _resetStore(): void {
  store.clear();
}
