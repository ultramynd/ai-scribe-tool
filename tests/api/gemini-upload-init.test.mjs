import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/gemini-upload-init.ts';
import { createMockReq, createMockRes } from './mockHttp.mjs';

const ORIGINAL_ENV = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  APP_ORIGIN: process.env.APP_ORIGIN,
  MAX_UPLOAD_SIZE_BYTES: process.env.MAX_UPLOAD_SIZE_BYTES,
  ALLOWED_GEMINI_MODELS: process.env.ALLOWED_GEMINI_MODELS,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_TOKEN: process.env.REDIS_TOKEN
};
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env.GEMINI_API_KEY = ORIGINAL_ENV.GEMINI_API_KEY;
  process.env.APP_ORIGIN = ORIGINAL_ENV.APP_ORIGIN;
  process.env.MAX_UPLOAD_SIZE_BYTES = ORIGINAL_ENV.MAX_UPLOAD_SIZE_BYTES;
  process.env.ALLOWED_GEMINI_MODELS = ORIGINAL_ENV.ALLOWED_GEMINI_MODELS;
  process.env.REDIS_URL = ORIGINAL_ENV.REDIS_URL;
  process.env.REDIS_TOKEN = ORIGINAL_ENV.REDIS_TOKEN;
  globalThis.fetch = ORIGINAL_FETCH;
});

test('POST /api/gemini-upload-init returns uploadUrl from upstream headers', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.APP_ORIGIN = 'https://app.example.com';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  globalThis.fetch = async () =>
    new Response('', {
      status: 200,
      headers: {
        'x-goog-upload-url': 'https://upload-session.example.com/abc123'
      }
    });

  const req = createMockReq({
    body: {
      displayName: 'meeting.mp3',
      mimeType: 'audio/mpeg',
      size: 1_024
    },
    headers: {
      origin: 'https://app.example.com',
      'x-forwarded-for': '10.0.0.20'
    }
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.uploadUrl, 'https://upload-session.example.com/abc123');
  assert.ok(res.body.requestId);
});

test('POST /api/gemini-upload-init enforces upload size limits', async () => {
  process.env.GEMINI_API_KEY = 'primary';
  process.env.APP_ORIGIN = 'https://app.example.com';
  process.env.MAX_UPLOAD_SIZE_BYTES = '100';
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TOKEN;

  globalThis.fetch = async () => new Response('{}', { status: 200 });

  const req = createMockReq({
    body: {
      displayName: 'big-file.mp3',
      mimeType: 'audio/mpeg',
      size: 1_000
    },
    headers: {
      origin: 'https://app.example.com',
      'x-forwarded-for': '10.0.0.21'
    }
  });
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 413);
  assert.equal(res.body.error.code, 'invalid_size');
});
