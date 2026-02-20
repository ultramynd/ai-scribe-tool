import type { ApiResponseLike } from './types';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

export interface SendErrorOptions {
  status: number;
  code: string;
  message: string;
  requestId: string;
  retryAfterSeconds?: number;
}

export const sendError = (
  res: ApiResponseLike,
  { status, code, message, requestId, retryAfterSeconds }: SendErrorOptions
): void => {
  const body: ApiErrorEnvelope & { requestId: string } = {
    error: {
      code,
      message,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {})
    },
    requestId
  };

  res.status(status).json(body);
};

export const getUpstreamErrorMessage = (raw: string, fallbackMessage: string): string => {
  if (!raw) return fallbackMessage;

  try {
    const parsed = JSON.parse(raw);
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error?.details?.[0]?.message;

    return typeof message === 'string' && message.trim().length > 0
      ? message.trim()
      : fallbackMessage;
  } catch {
    return raw.slice(0, 300) || fallbackMessage;
  }
};
