// In-memory fixed-window rate limiter. Deliberately simple: this app runs
// as a single Node process (dev / droplet), so per-process counters are
// correct. Limits reset on restart. NOT suitable for serverless/multi-
// instance deployments — that migration needs a shared store (e.g. Redis).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  // Periodic sweep so the map can't grow unbounded from one-off keys.
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    lastSweep = now;
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (bucket.count < limit) {
    bucket.count++;
    return { ok: true, retryAfterSeconds: 0 };
  }

  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

// Best-effort client IP: first hop of x-forwarded-for (set by the reverse
// proxy in production), else x-real-ip, else "unknown" (dev/localhost —
// all local traffic shares one bucket, which is fine).
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
