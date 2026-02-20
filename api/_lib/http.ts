import { randomUUID } from 'crypto';
import type { ApiRequestLike, ApiResponseLike, HeaderValue } from './types';

const REQUEST_ID_REGEX = /^[A-Za-z0-9._:-]{1,128}$/;

export const parseBody = (body: unknown): any | null => {
  if (!body) return null;

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  return body;
};

const toSingleHeaderValue = (value: HeaderValue): string | undefined => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

export const getHeader = (req: ApiRequestLike, name: string): string | undefined => {
  const headers = req.headers || {};
  const direct = toSingleHeaderValue(headers[name]);
  if (direct) return direct;

  const loweredName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === loweredName) {
      const resolved = toSingleHeaderValue(value);
      if (resolved) return resolved;
    }
  }

  return undefined;
};

export const getClientIp = (req: ApiRequestLike): string => {
  const forwarded = getHeader(req, 'x-forwarded-for');
  if (forwarded && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
};

export const resolveRequestId = (incoming?: string): string => {
  const candidate = (incoming || '').trim();
  if (REQUEST_ID_REGEX.test(candidate)) {
    return candidate;
  }

  if (typeof randomUUID === 'function') {
    return randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export interface HeaderOptions {
  requestId: string;
  allowedOrigin: string;
  allowMethods: string;
  allowHeaders?: string;
}

export const applyBaseHeaders = (res: ApiResponseLike, options: HeaderOptions): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', options.requestId);
  res.setHeader('Access-Control-Allow-Origin', options.allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', options.allowMethods);
  res.setHeader('Access-Control-Allow-Headers', options.allowHeaders || 'Content-Type, X-Request-Id');
  res.setHeader('Vary', 'Origin');
};
