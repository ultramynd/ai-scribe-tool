import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { enforceOriginPolicy } from '../../api/_lib/origin.ts';

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;

afterEach(() => {
  process.env.APP_ORIGIN = ORIGINAL_APP_ORIGIN;
});

test('origin policy allows all when APP_ORIGIN is not configured', () => {
  delete process.env.APP_ORIGIN;
  const result = enforceOriginPolicy({ headers: {} });

  assert.equal(result.ok, true);
  assert.equal(result.allowOrigin, '*');
});

test('origin policy blocks missing origin when APP_ORIGIN is configured', () => {
  process.env.APP_ORIGIN = 'https://app.example.com';
  const result = enforceOriginPolicy({ headers: {} });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'origin_required');
});

test('origin policy accepts listed origin', () => {
  process.env.APP_ORIGIN = 'https://app.example.com,https://staging.example.com';

  const result = enforceOriginPolicy({
    headers: { origin: 'https://staging.example.com' }
  });

  assert.equal(result.ok, true);
  assert.equal(result.allowOrigin, 'https://staging.example.com');
});
