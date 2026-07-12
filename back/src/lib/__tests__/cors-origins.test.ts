import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCorsOrigins, NATIVE_WEBVIEW_ORIGINS } from '../cors-origins.js';

test("'*' → true (refleja cualquier origin)", () => {
  assert.equal(resolveCorsOrigins('*'), true);
});

test('CORS_ORIGIN acotado incluye SIEMPRE los orígenes de WebView nativo (apk/ipa)', () => {
  const out = resolveCorsOrigins('https://operaos-black.vercel.app');
  assert.ok(Array.isArray(out));
  assert.ok((out as string[]).includes('https://operaos-black.vercel.app'));
  for (const o of NATIVE_WEBVIEW_ORIGINS) assert.ok((out as string[]).includes(o), `falta ${o}`);
});

test('varios dominios web + trim + dedup de orígenes nativos', () => {
  const out = resolveCorsOrigins(' https://a.com , https://b.com , https://localhost ') as string[];
  assert.ok(out.includes('https://a.com'));
  assert.ok(out.includes('https://b.com'));
  // https://localhost estaba en la config y en NATIVE → una sola vez.
  assert.equal(out.filter((o) => o === 'https://localhost').length, 1);
});
