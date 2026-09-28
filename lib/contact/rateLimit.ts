type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
};

export type RateLimiter = {
  /** Records an attempt for `key`; `false` when the key is over its limit. */
  consume: (key: string) => boolean;
};

/** Above this many tracked keys, expired entries are swept on the next call. */
const sweepThreshold = 1000;

/**
 * A sliding-window limiter held in process memory. It is a baseline only:
 * state is per process, lost on restart, and not shared between instances or
 * serverless invocations, so it is not a distributed production control.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  const attempts = new Map<string, number[]>();

  function recent(key: string, since: number) {
    return (attempts.get(key) ?? []).filter((time) => time > since);
  }

  return {
    consume(key) {
      const time = now();
      const since = time - windowMs;

      if (attempts.size > sweepThreshold) {
        for (const tracked of attempts.keys()) {
          if (recent(tracked, since).length === 0) attempts.delete(tracked);
        }
      }

      const times = recent(key, since);
      if (times.length >= limit) {
        attempts.set(key, times);
        return false;
      }
      attempts.set(key, [...times, time]);
      return true;
    },
  };
}

/**
 * Best-effort client address for rate limiting only, never for authorization.
 * `x-forwarded-for` is trustworthy only when the hosting proxy overwrites it;
 * otherwise a client can vary it to evade the limit, which is the accepted
 * cost of a baseline limiter.
 */
export function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
