import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/gemini.ts';
import { createMockReq, createMockRes } from './mockHttp.mjs';

const ORIGINAL_ENV = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_API_KEY_FALLBACK: process.env.GEMINI_API_KEY_FALLBACK,
  APP_ORIGIN: process.env.APP_ORIGIN,
  RATE_LIMIT_GEMINI_MAX: process.env.RATE_LIMIT_GEMINI_MAX,
  RATE_LIMIT_GEMINI_WINDOW_SECONDS: process.env.RATE_LIMIT_GEMINI_WINDOW_SECONDS,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_TOKEN: process.env.REDIS_TOKEN,
  ALLOWED_GEMINI_MODELS: process.env.ALLOWED_GEMINI_MODELS
};
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env.GEMINI_API_KEY = ORIGINAL_ENV.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY_FALLBACK = ORIGINAL_ENV.GEMINI_API_KEY_FALLBACK;
  process.env.APP_ORIGIN = ORIGINAL_ENV.APP_ORIGIN;
  process.env.RATE_LIMIT_GEMINI_MAX = ORIGINAL_ENV.RATE_LIMIT_GEMINI_MAX;
  process.env.RATE_LIMIT_GEMINI_WINDOW_SECONDS = ORIGINAL_ENV.RATE_LIMIT_GEMINI_WINDOW_SECONDS;
  process.env.REDIS_URL = ORIGINAL_ENV.REDIS_URL;
  process.env.REDIS_TOKEN = ORIGINAL_ENV.REDIS_TOKEN;
  process.env.ALLOWED_GEMINI_MODELS = ORIGINAL_ENV.ALLOWED_GEMINI_MODELS;
  globalThis.fetch = ORIGINAL_FETCH;
});

test('POST /api/gemini returns upstream success body', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.APP_ORIGIN = 'https://app.example.com';
  process.env.ALLOWED_GEMINI_MODELS = 'gemini-test';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const req = createMockReq({
    body: {
      model: 'gemini-test',
      payload: { contents: [{ parts: [{ text: 'hello' }] }] }
    },
    headers: {
      origin: 'https://app.example.com',
      'x-forwarded-for': '10.0.0.10'
    }
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body, 'string');
  assert.match(res.body, /hello from gemini/);
  assert.ok(res.headers.get('x-request-id'));
});

test('POST /api/gemini rejects disallowed model', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.APP_ORIGIN = 'https://app.example.com';
  process.env.ALLOWED_GEMINI_MODELS = 'gemini-test';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  globalThis.fetch = async () => new Response('{}', { status: 200 });

  const req = createMockReq({
    body: { model: 'gemini-2.5-pro', payload: { hello: 'world' } },
    headers: { origin: 'https://app.example.com', 'x-forwarded-for': '10.0.0.11' }
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.error?.code, 'invalid_model');
});

test('POST /api/gemini falls back to backup key on 429', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.GEMINI_API_KEY_FALLBACK = 'backup';
  process.env.APP_ORIGIN = 'https://app.example.com';
  process.env.ALLOWED_GEMINI_MODELS = 'gemini-test';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('key=primary')) {
      return new Response(JSON.stringify({ error: { message: 'quota exhausted' } }), { status: 429 });
    }

    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'from backup' }] } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const req = createMockReq({
    body: {
      model: 'gemini-test',
      payload: { contents: [{ parts: [{ text: 'hello' }] }] }
    },
    headers: {
      origin: 'https://app.example.com',
      'x-forwarded-for': '10.0.0.12'
    }
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const geminiUrls = urls.filter((url) => url.includes('generativelanguage.googleapis.com'));
  assert.equal(geminiUrls.length, 2);
  assert.match(geminiUrls[0], /key=primary/);
  assert.match(geminiUrls[1], /key=backup/);
});

test('POST /api/gemini enforces rate limits', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.APP_ORIGIN = 'https://app.example.com';
  process.env.RATE_LIMIT_GEMINI_MAX = '1';
  process.env.ALLOWED_GEMINI_MODELS = 'gemini-test';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }]
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const firstReq = createMockReq({
    body: { model: 'gemini-test', payload: { hello: 1 } },
    headers: { origin: 'https://app.example.com', 'x-forwarded-for': '10.0.0.13' }
  });
  const secondReq = createMockReq({
    body: { model: 'gemini-test', payload: { hello: 2 } },
    headers: { origin: 'https://app.example.com', 'x-forwarded-for': '10.0.0.13' }
  });

  const firstRes = createMockRes();
  const secondRes = createMockRes();

  await handler(firstReq, firstRes);
  await handler(secondReq, secondRes);

  assert.equal(firstRes.statusCode, 200);
  assert.equal(secondRes.statusCode, 429);
  assert.equal(secondRes.body?.error?.code, 'rate_limit_exceeded');
});
