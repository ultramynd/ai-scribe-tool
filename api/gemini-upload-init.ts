import { sendError, getUpstreamErrorMessage } from './_lib/errors';
import { callGeminiWithFallback } from './_lib/gemini';
import { applyBaseHeaders, getClientIp, getHeader, parseBody, resolveRequestId } from './_lib/http';
import { logApiEvent } from './_lib/observability';
import { enforceOriginPolicy } from './_lib/origin';
import { checkRateLimit } from './_lib/rateLimit';
import type { ApiRequestLike, ApiResponseLike } from './_lib/types';
import { sanitizeDisplayName, validateMimeType, validateUploadSize } from './_lib/validation';

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

    const mimeTypeResult = validateMimeType((body as any).mimeType);
    if (!mimeTypeResult.ok) {
      finalStatus = 400;
      const mimeTypeMessage = 'message' in mimeTypeResult ? mimeTypeResult.message : 'mimeType is invalid.';
      sendError(res, {
        status: 400,
        code: 'invalid_mime_type',
        message: mimeTypeMessage,
        requestId
      });
      return;
    }

    const sizeResult = validateUploadSize((body as any).size);
    if (!sizeResult.ok) {
      finalStatus = 413;
      const sizeMessage = 'message' in sizeResult ? sizeResult.message : 'size is invalid.';
      sendError(res, {
        status: 413,
        code: 'invalid_size',
        message: sizeMessage,
        requestId
      });
      return;
    }

    const displayName = sanitizeDisplayName((body as any).displayName);

    const rateLimit = await checkRateLimit({
      key: `gemini-upload-init:${getClientIp(req)}`,
      limit: Number(process.env.RATE_LIMIT_UPLOAD_MAX || 30),
      windowSeconds: Number(process.env.RATE_LIMIT_UPLOAD_WINDOW_SECONDS || 60),
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
      path: '/upload/v1beta/files',
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(sizeResult.value),
        'X-Goog-Upload-Header-Content-Type': mimeTypeResult.value,
        'Content-Type': 'application/json',
        'X-Request-Id': requestId
      },
      body: JSON.stringify({
        file: {
          display_name: displayName,
          mime_type: mimeTypeResult.value
        }
      })
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
        message: getUpstreamErrorMessage(upstreamText, 'Failed to initialize upload session.'),
        requestId,
        retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      });
      return;
    }

    const uploadUrl = upstream.response.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      finalStatus = 502;
      sendError(res, {
        status: 502,
        code: 'missing_upload_url',
        message: 'Upload session URL was not returned by Gemini.',
        requestId
      });
      return;
    }

    finalStatus = 200;
    res.status(200).json({ uploadUrl, requestId });
  } catch (error: any) {
    finalStatus = 500;
    sendError(res, {
      status: 500,
      code: 'proxy_error',
      message: error?.message || 'Upload session init failed.',
      requestId
    });
  } finally {
    logApiEvent({
      endpoint: '/api/gemini-upload-init',
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
