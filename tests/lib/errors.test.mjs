import test from 'node:test';
import assert from 'node:assert/strict';

import { getUpstreamErrorMessage, sendError } from '../../api/_lib/errors.ts';
import { createMockRes } from '../api/mockHttp.mjs';

test('sendError returns standardized error envelope', () => {
  const res = createMockRes();

  sendError(res, {
    status: 429,
    code: 'rate_limit_exceeded',
    message: 'Rate limit exceeded.',
    requestId: 'req-123',
    retryAfterSeconds: 42
  });

  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, {
    error: {
      code: 'rate_limit_exceeded',
      message: 'Rate limit exceeded.',
      retryAfterSeconds: 42
    },
    requestId: 'req-123'
  });
});

test('getUpstreamErrorMessage extracts message from Gemini-like JSON', () => {
  const raw = JSON.stringify({ error: { message: 'Model overloaded' } });
  const message = getUpstreamErrorMessage(raw, 'fallback');

  assert.equal(message, 'Model overloaded');
});
