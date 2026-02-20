import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAllowedGeminiModels,
  validateGeminiModel,
  validateMimeType,
  validatePayloadSize,
  validatePollFileName,
  validateUploadSize
} from '../../api/_lib/validation.ts';

const ORIGINAL_ENV = {
  ALLOWED_GEMINI_MODELS: process.env.ALLOWED_GEMINI_MODELS,
  MAX_GEMINI_PAYLOAD_BYTES: process.env.MAX_GEMINI_PAYLOAD_BYTES,
  MAX_UPLOAD_SIZE_BYTES: process.env.MAX_UPLOAD_SIZE_BYTES
};

afterEach(() => {
  process.env.ALLOWED_GEMINI_MODELS = ORIGINAL_ENV.ALLOWED_GEMINI_MODELS;
  process.env.MAX_GEMINI_PAYLOAD_BYTES = ORIGINAL_ENV.MAX_GEMINI_PAYLOAD_BYTES;
  process.env.MAX_UPLOAD_SIZE_BYTES = ORIGINAL_ENV.MAX_UPLOAD_SIZE_BYTES;
});

test('validateGeminiModel allows configured and default models', () => {
  process.env.ALLOWED_GEMINI_MODELS = 'gemini-test-model';

  const allowedFromEnv = validateGeminiModel('gemini-test-model');
  assert.equal(allowedFromEnv.ok, true);

  const allowedDefault = validateGeminiModel('gemini-2.5-flash');
  assert.equal(allowedDefault.ok, true);

  const disallowed = validateGeminiModel('not-in-list');
  assert.equal(disallowed.ok, false);
});

test('getAllowedGeminiModels includes environment overrides', () => {
  process.env.ALLOWED_GEMINI_MODELS = 'alpha-model,beta-model';
  const allowed = getAllowedGeminiModels();

  assert.equal(allowed.has('alpha-model'), true);
  assert.equal(allowed.has('beta-model'), true);
  assert.equal(allowed.has('gemini-2.5-flash'), true);
});

test('validatePayloadSize rejects large payloads', () => {
  process.env.MAX_GEMINI_PAYLOAD_BYTES = '20';
  const result = validatePayloadSize({ a: 'this payload is definitely larger than twenty bytes' });
  assert.equal(result.ok, false);
});

test('validateMimeType enforces mime format', () => {
  assert.equal(validateMimeType('audio/mp3').ok, true);
  assert.equal(validateMimeType('bad mime').ok, false);
});

test('validateUploadSize enforces positive and max size', () => {
  process.env.MAX_UPLOAD_SIZE_BYTES = '100';
  assert.equal(validateUploadSize(50).ok, true);
  assert.equal(validateUploadSize(0).ok, false);
  assert.equal(validateUploadSize(101).ok, false);
});

test('validatePollFileName requires files/ prefix', () => {
  assert.equal(validatePollFileName('files/abc-123').ok, true);
  assert.equal(validatePollFileName('abc-123').ok, false);
});
