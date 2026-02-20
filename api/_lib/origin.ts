import { getHeader } from './http';
import type { ApiRequestLike } from './types';

export interface OriginCheckResult {
  ok: boolean;
  allowOrigin: string;
  reason?: string;
  code?: string;
}

export const getAllowedOrigins = (): string[] => {
  const raw = process.env.APP_ORIGIN || '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const enforceOriginPolicy = (req: ApiRequestLike): OriginCheckResult => {
  const origin = getHeader(req, 'origin');
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.length === 0) {
    return {
      ok: true,
      allowOrigin: origin || '*'
    };
  }

  if (!origin) {
    return {
      ok: false,
      allowOrigin: 'null',
      reason: 'Origin header is required for this API.',
      code: 'origin_required'
    };
  }

  if (!allowedOrigins.includes(origin)) {
    return {
      ok: false,
      allowOrigin: 'null',
      reason: 'Request origin is not allowed.',
      code: 'origin_not_allowed'
    };
  }

  return {
    ok: true,
    allowOrigin: origin
  };
};
