import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/health.ts';
import { createMockReq, createMockRes } from './mockHttp.mjs';

test('GET /api/health returns status payload', async () => {
  const req = createMockReq({ method: 'GET' });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(typeof res.body.requestId, 'string');
  assert.equal(typeof res.body.checks.geminiKeyConfigured, 'boolean');
});
