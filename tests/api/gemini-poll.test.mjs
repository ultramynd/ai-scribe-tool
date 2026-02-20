import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/gemini-poll.ts';
import { createMockReq, createMockRes } from './mockHttp.mjs';

const ORIGINAL_ENV = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  APP_ORIGIN: process.env.APP_ORIGIN,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_TOKEN: process.env.REDIS_TOKEN
};
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env.GEMINI_API_KEY = ORIGINAL_ENV.GEMINI_API_KEY;
  process.env.APP_ORIGIN = ORIGINAL_ENV.APP_ORIGIN;
  process.env.REDIS_URL = ORIGINAL_ENV.REDIS_URL;
  process.env.REDIS_TOKEN = ORIGINAL_ENV.REDIS_TOKEN;
  globalThis.fetch = ORIGINAL_FETCH;
});

test('POST /api/gemini-poll proxies upstream state', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.APP_ORIGIN = 'https://app.example.com';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ state: 'ACTIVE' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

  const req = createMockReq({
    body: { fileName: 'files/abc123' },
    headers: {
      origin: 'https://app.example.com',
      'x-forwarded-for': '10.0.0.30'
    }
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, JSON.stringify({ state: 'ACTIVE' }));
});

test('POST /api/gemini-poll rejects invalid fileName format', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.APP_ORIGIN = 'https://app.example.com';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  globalThis.fetch = async () => new Response('{}', { status: 200 });

  const req = createMockReq({
    body: { fileName: 'abc123' },
    headers: {
      origin: 'https://app.example.com',
      'x-forwarded-for': '10.0.0.31'
    }
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'invalid_file_name');
});
