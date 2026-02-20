interface MemoryCounter {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
  prefix: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  backend: 'redis' | 'memory';
}

const memoryCounters = new Map<string, MemoryCounter>();
let redisWarningLogged = false;

const sanitizeKey = (key: string): string => key.replace(/[^A-Za-z0-9:_-]/g, '_');

const toPositiveInteger = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
};

const runMemoryRateLimit = (options: RateLimitOptions): RateLimitResult => {
  const now = Date.now();
  const namespacedKey = `${options.prefix}:${sanitizeKey(options.key)}`;
  const entry = memoryCounters.get(namespacedKey);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + options.windowSeconds * 1000;
    memoryCounters.set(namespacedKey, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSeconds: options.windowSeconds,
      backend: 'memory'
    };
  }

  entry.count += 1;

  return {
    allowed: entry.count <= options.limit,
    remaining: Math.max(0, options.limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    backend: 'memory'
  };
};

const callRedis = async (command: string[]): Promise<any> => {
  const redisUrl = process.env.REDIS_URL;
  const redisToken = process.env.REDIS_TOKEN;

  if (!redisUrl || !redisToken) {
    return null;
  }

  const endpoint = `${redisUrl.replace(/\/$/, '')}/${command.map((segment) => encodeURIComponent(segment)).join('/')}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${redisToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Redis command failed (${response.status})`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data?.result;
};

const runRedisRateLimit = async (options: RateLimitOptions): Promise<RateLimitResult> => {
  const namespacedKey = `${options.prefix}:${sanitizeKey(options.key)}`;

  const countRaw = await callRedis(['INCR', namespacedKey]);
  const count = toPositiveInteger(countRaw);
  if (count === null) {
    throw new Error('Invalid Redis INCR response');
  }

  if (count === 1) {
    await callRedis(['EXPIRE', namespacedKey, String(options.windowSeconds)]);
  }

  let ttl = options.windowSeconds;
  if (count > options.limit) {
    const ttlRaw = await callRedis(['TTL', namespacedKey]);
    const ttlParsed = toPositiveInteger(ttlRaw);
    if (ttlParsed !== null && ttlParsed > 0) {
      ttl = ttlParsed;
    }
  }

  return {
    allowed: count <= options.limit,
    remaining: Math.max(0, options.limit - count),
    retryAfterSeconds: Math.max(1, ttl),
    backend: 'redis'
  };
};

export const checkRateLimit = async (options: RateLimitOptions): Promise<RateLimitResult> => {
  const redisConfigured = Boolean(process.env.REDIS_URL && process.env.REDIS_TOKEN);

  if (!redisConfigured) {
    return runMemoryRateLimit(options);
  }

  try {
    return await runRedisRateLimit(options);
  } catch (error) {
    if (!redisWarningLogged) {
      redisWarningLogged = true;
      console.warn('[rate_limit] Falling back to in-memory limiter because Redis failed.', error);
    }
    return runMemoryRateLimit(options);
  }
};
