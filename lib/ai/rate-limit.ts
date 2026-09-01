type RateLimitEntry = {
  count: number;
  windowStart: number;
};

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup to prevent memory leaks in long-running processes.
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const maxWindow = Math.max(...Object.values(DEFAULT_LIMITS).map((l) => l.windowMs));
  for (const [key, entry] of store) {
    if (now - entry.windowStart > maxWindow) {
      store.delete(key);
    }
  }
}

export type RateLimitConfig = {
  /** Max requests per window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
};

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  "recovery:sweep": { maxRequests: 5, windowMs: 60_000 },
  "recovery:action": { maxRequests: 10, windowMs: 60_000 },
  "recovery:detail": { maxRequests: 30, windowMs: 60_000 },
  "recovery:diagnose": { maxRequests: 20, windowMs: 60_000 },
  "recovery:promise": { maxRequests: 30, windowMs: 60_000 },
  "llm:call": { maxRequests: 20, windowMs: 60_000 },
  "revenue:ingest": { maxRequests: 120, windowMs: 60_000 },
  "revenue:batch": { maxRequests: 10, windowMs: 60_000 },
};

/**
 * In-memory sliding-window rate limiter.
 *
 * Key format: `<scope>:<identifier>` e.g. `recovery:sweep:userId123`.
 * For production, replace with Redis-backed limiter.
 */
export function checkRateLimit(
  key: string,
  config?: RateLimitConfig,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  cleanup();

  // Find matching limit config by checking which DEFAULT_LIMITS key is a prefix
  const matchedScope = Object.keys(DEFAULT_LIMITS).find((scope) => key.startsWith(scope + ":"));
  const limit = config || (matchedScope ? DEFAULT_LIMITS[matchedScope] : { maxRequests: 30, windowMs: 60_000 });
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > limit.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit.maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= limit.maxRequests) {
    const retryAfterMs = limit.windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit.maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Express/Next.js middleware-style helper.
 * Returns a NextResponse 429 if rate limited, or null if allowed.
 */
export function rateLimitResponse(
  scope: string,
  identifier: string,
  config?: RateLimitConfig,
): { ok: true; remaining: number } | { ok: false; status: 429; body: Record<string, unknown> } {
  const key = `${scope}:${identifier}`;
  const result = checkRateLimit(key, config);

  if (result.allowed) {
    return { ok: true, remaining: result.remaining };
  }

  return {
    ok: false,
    status: 429,
    body: {
      error: "Rate limit exceeded",
      scope,
      retryAfterMs: result.retryAfterMs,
      retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
    },
  };
}

export function getRateLimitHeaders(
  scope: string,
  identifier: string,
): Record<string, string> {
  const key = `${scope}:${identifier}`;
  const limit = DEFAULT_LIMITS[scope] || { maxRequests: 30, windowMs: 60_000 };
  const entry = store.get(key);
  const remaining = entry ? Math.max(0, limit.maxRequests - entry.count) : limit.maxRequests;
  const resetAt = entry ? entry.windowStart + limit.windowMs : Date.now() + limit.windowMs;

  return {
    "X-RateLimit-Limit": String(limit.maxRequests),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

export function resetRateLimits() {
  store.clear();
}
