import { applyBaseHeaders, getHeader, resolveRequestId } from './_lib/http';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types';

export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  const requestId = resolveRequestId(getHeader(req, 'x-request-id'));

  applyBaseHeaders(res, {
    requestId,
    allowedOrigin: '*',
    allowMethods: 'GET, OPTIONS'
  });

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({
      error: {
        code: 'method_not_allowed',
        message: 'Method not allowed.'
      },
      requestId
    });
    return;
  }

  res.status(200).json({
    ok: true,
    service: 'scribeai-api',
    timestamp: new Date().toISOString(),
    requestId,
    checks: {
      geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
      fallbackKeyConfigured: Boolean(process.env.GEMINI_API_KEY_FALLBACK),
      redisConfigured: Boolean(process.env.REDIS_URL && process.env.REDIS_TOKEN)
    }
  });
}
