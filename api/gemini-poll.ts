import { sendError, getUpstreamErrorMessage } from './_lib/errors';
import { callGeminiWithFallback } from './_lib/gemini';
import { applyBaseHeaders, getClientIp, getHeader, parseBody, resolveRequestId } from './_lib/http';
import { logApiEvent } from './_lib/observability';
import { enforceOriginPolicy } from './_lib/origin';
import { checkRateLimit } from './_lib/rateLimit';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types';
import { validatePollFileName } from './_lib/validation';

export const config = {
  runtime: 'edge'
};

export default async function handler(req: ApiRequestLike, res: ApiResponseLike) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(getHeader(req, 'x-request-id'));
  const originCheck = enforceOriginPolicy(req);

  applyBaseHeaders(res, {
    requestId,
    allowedOrigin: originCheck.allowOrigin,
    allowMethods: 'POST, OPTIONS'
  });

  if (req.method === 'OPTIONS') {
    if (!originCheck.ok) {
      sendError(res, {
        status: 403,
        code: originCheck.code || 'origin_not_allowed',
        message: originCheck.reason || 'Origin is not allowed.',
        requestId
      });
      return;
    }

    res.status(204).end();
    return;
  }

  let finalStatus = 500;
  let upstreamStatus: number | undefined;
  let usedFallbackKey = false;
  let rateLimitBackend: 'redis' | 'memory' | undefined;

  try {
    if (!originCheck.ok) {
      finalStatus = 403;
      sendError(res, {
        status: 403,
        code: originCheck.code || 'origin_not_allowed',
        message: originCheck.reason || 'Origin is not allowed.',
        requestId
      });
      return;
    }

    if (req.method !== 'POST') {
      finalStatus = 405;
      sendError(res, {
        status: 405,
        code: 'method_not_allowed',
        message: 'Method not allowed.',
        requestId
      });
      return;
    }

    const body = parseBody(req.body);
    if (!body) {
      finalStatus = 400;
      sendError(res, {
        status: 400,
        code: 'invalid_json',
        message: 'Request body must be valid JSON.',
        requestId
      });
      return;
    }

    const fileNameResult = validatePollFileName((body as any).fileName);
    if (!fileNameResult.ok) {
      finalStatus = 400;
      const fileNameMessage = 'message' in fileNameResult ? fileNameResult.message : 'fileName is invalid.';
      sendError(res, {
        status: 400,
        code: 'invalid_file_name',
        message: fileNameMessage,
        requestId
      });
      return;
    }

    const rateLimit = await checkRateLimit({
      key: `gemini-poll:${getClientIp(req)}`,
      limit: Number(process.env.RATE_LIMIT_POLL_MAX || 60),
      windowSeconds: Number(process.env.RATE_LIMIT_POLL_WINDOW_SECONDS || 60),
      prefix: process.env.RATE_LIMIT_PREFIX || 'scrybe'
    });
    rateLimitBackend = rateLimit.backend;

    if (!rateLimit.allowed) {
      finalStatus = 429;
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      sendError(res, {
        status: 429,
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded.',
        requestId,
        retryAfterSeconds: rateLimit.retryAfterSeconds
      });
      return;
    }

    const upstream = await callGeminiWithFallback({
      path: `/v1beta/${fileNameResult.value}`,
      method: 'GET',
      headers: {
        'X-Request-Id': requestId
      }
    });

    usedFallbackKey = upstream.usedFallback;
    upstreamStatus = upstream.response.status;

    const upstreamText = await upstream.response.text();

    if (!upstream.response.ok) {
      finalStatus = upstream.response.status;
      const retryAfter = Number(upstream.response.headers.get('retry-after') || 0);

      sendError(res, {
        status: upstream.response.status,
        code: 'upstream_error',
        message: getUpstreamErrorMessage(upstreamText, 'Polling failed.'),
        requestId,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      });
      return;
    }

    finalStatus = upstream.response.status;
    res.setHeader('Content-Type', 'application/json');
    res.status(upstream.response.status).send(upstreamText);
  } catch (error: any) {
    finalStatus = 500;
    sendError(res, {
      status: 500,
      code: 'proxy_error',
      message: error?.message || 'Polling failed.',
      requestId
    });
  } finally {
    logApiEvent({
      endpoint: '/api/gemini-poll',
      method: req.method || 'UNKNOWN',
      requestId,
      status: finalStatus,
      latencyMs: Date.now() - startedAt,
      rateLimitBackend,
      usedFallbackKey,
      upstreamStatus
    });
  }
}
