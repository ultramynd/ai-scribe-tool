import { sendError, getUpstreamErrorMessage } from './_lib/errors';
import { callGeminiWithFallback } from './_lib/gemini';
import { applyBaseHeaders, getClientIp, getHeader, parseBody, resolveRequestId } from './_lib/http';
import { logApiEvent } from './_lib/observability';
import { enforceOriginPolicy } from './_lib/origin';
import { checkRateLimit } from './_lib/rateLimit';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types';
import { validateGeminiModel, validatePayloadSize } from './_lib/validation';

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

    const modelResult = validateGeminiModel((body as any).model);
    if (!modelResult.ok) {
      finalStatus = 400;
      const modelMessage = 'message' in modelResult ? modelResult.message : 'Model is invalid.';
      sendError(res, {
        status: 400,
        code: 'invalid_model',
        message: modelMessage,
        requestId
      });
      return;
    }

    const payloadResult = validatePayloadSize((body as any).payload);
    if (!payloadResult.ok) {
      const payloadMessage = 'message' in payloadResult ? payloadResult.message : 'Payload is invalid.';
      finalStatus = payloadMessage.includes('exceeds') ? 413 : 400;
      sendError(res, {
        status: finalStatus,
        code: finalStatus === 413 ? 'payload_too_large' : 'invalid_payload',
        message: payloadMessage,
        requestId
      });
      return;
    }

    const rateLimit = await checkRateLimit({
      key: `gemini:${getClientIp(req)}`,
      limit: Number(process.env.RATE_LIMIT_GEMINI_MAX || 30),
      windowSeconds: Number(process.env.RATE_LIMIT_GEMINI_WINDOW_SECONDS || 60),
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
      path: `/v1beta/models/${modelResult.value}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      },
      body: JSON.stringify((body as any).payload)
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
        message: getUpstreamErrorMessage(upstreamText, 'Gemini request failed.'),
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
      message: error?.message || 'Proxy request failed.',
      requestId
    });
  } finally {
    logApiEvent({
      endpoint: '/api/gemini',
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
