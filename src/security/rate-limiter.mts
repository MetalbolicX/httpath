export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

export interface RateLimiterOptions {
  maxAttempts?: number;
  maxEntries?: number;
  now?: () => number;
  windowMs?: number;
}

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 1_000;

const purgeExpiredEntries = (
  entries: Map<string, RateLimitEntry>,
  now: number,
): void => {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
    }
  }
};

const evictOldestEntries = (
  entries: Map<string, RateLimitEntry>,
  maxEntries: number,
): void => {
  while (entries.size > maxEntries) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) break;
    entries.delete(oldestKey);
  }
};

export const createRateLimiter = (options: RateLimiterOptions = {}) => {
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
  );
  const windowMs = Math.max(
    1,
    Math.floor(options.windowMs ?? DEFAULT_WINDOW_MS),
  );
  const maxEntries = Math.max(
    1,
    Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES),
  );
  const now = options.now ?? Date.now;
  const entries = new Map<string, RateLimitEntry>();

  const check = (key: string): RateLimitResult => {
    const currentTime = now();
    purgeExpiredEntries(entries, currentTime);

    const existing = entries.get(key);
    if (!existing) {
      if (entries.size >= maxEntries) {
        evictOldestEntries(entries, maxEntries - 1);
      }

      entries.set(key, {
        count: 1,
        expiresAt: currentTime + windowMs,
      });

      return {
        allowed: true,
        remaining: maxAttempts - 1,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    if (existing.expiresAt <= currentTime) {
      existing.count = 1;
      existing.expiresAt = currentTime + windowMs;
      return {
        allowed: true,
        remaining: maxAttempts - 1,
        retryAfter: Math.ceil(windowMs / 1000),
      };
    }

    existing.count += 1;
    const allowed = existing.count <= maxAttempts;
    return {
      allowed,
      remaining: allowed ? maxAttempts - existing.count : 0,
      retryAfter: Math.ceil((existing.expiresAt - currentTime) / 1000),
    };
  };

  const reset = (key?: string): void => {
    if (key === undefined) {
      entries.clear();
      return;
    }

    entries.delete(key);
  };

  return { check, reset };
};
