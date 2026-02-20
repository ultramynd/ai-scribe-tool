import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../services/geminiService.ts', import.meta.url), 'utf8');

test('geminiService defaults proxy mode through resolveProxyPreference', () => {
  assert.match(source, /const USE_SERVER_PROXY = resolveProxyPreference\(\);/);
});

test('geminiService uses proxy endpoints when proxy mode is enabled', () => {
  assert.match(source, /fetch\('\/api\/gemini'/);
  assert.match(source, /fetch\('\/api\/gemini-upload-init'/);
  assert.match(source, /fetch\('\/api\/gemini-poll'/);
});

test('geminiService includes structured proxy error parsing helper', () => {
  assert.match(source, /const getProxyErrorMessage = \(status: number, text: string, requestId\?: string \| null\)/);
  assert.match(source, /parsed\?\.error\?\.message/);
});
