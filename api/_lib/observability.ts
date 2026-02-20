interface ApiLogEvent {
  endpoint: string;
  method: string;
  requestId: string;
  status: number;
  latencyMs: number;
  rateLimitBackend?: 'redis' | 'memory';
  usedFallbackKey?: boolean;
  upstreamStatus?: number;
}

const ALERT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_ALERT_THRESHOLD = 5;
const statusBuckets: Record<string, number[]> = {
  status_429: [],
  status_5xx: []
};
const lastAlertAt: Record<string, number> = {
  status_429: 0,
  status_5xx: 0
};

const getAlertThreshold = (): number => {
  const parsed = Number(process.env.ERROR_ALERT_THRESHOLD);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_ALERT_THRESHOLD;
};

const trackStatus = (status: number): void => {
  const now = Date.now();
  const threshold = getAlertThreshold();

  if (status === 429) {
    statusBuckets.status_429 = statusBuckets.status_429.filter((at) => now - at <= ALERT_WINDOW_MS);
    statusBuckets.status_429.push(now);

    if (statusBuckets.status_429.length >= threshold && now - lastAlertAt.status_429 > 60_000) {
      lastAlertAt.status_429 = now;
      console.warn('[alert] Sustained upstream/client throttling detected.', {
        count: statusBuckets.status_429.length,
        windowMs: ALERT_WINDOW_MS
      });
    }
  }

  if (status >= 500) {
    statusBuckets.status_5xx = statusBuckets.status_5xx.filter((at) => now - at <= ALERT_WINDOW_MS);
    statusBuckets.status_5xx.push(now);

    if (statusBuckets.status_5xx.length >= threshold && now - lastAlertAt.status_5xx > 60_000) {
      lastAlertAt.status_5xx = now;
      console.warn('[alert] Sustained server/upstream errors detected.', {
        count: statusBuckets.status_5xx.length,
        windowMs: ALERT_WINDOW_MS
      });
    }
  }
};

export const logApiEvent = (event: ApiLogEvent): void => {
  const payload = {
    ts: new Date().toISOString(),
    type: 'api_request',
    ...event
  };

  console.log(JSON.stringify(payload));
  trackStatus(event.status);
};
