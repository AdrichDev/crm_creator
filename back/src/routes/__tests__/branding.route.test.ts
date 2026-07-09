// Unit tests de POST /api/branding/extract (crm-env-contract-tiers WU2.2 —
// adopción de referencia de getTenantSecret). Runner: node --import tsx --test
//
// Estrategia (patrón del repo, ver tenant-config.route.test.ts): se ejercita el
// handler REAL con deps inyectadas (getTenantSecret / extractWithAnthropic
// fakeadas) — sin red ni Prisma real.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { extractHandler, type BrandingExtractDeps } from '../branding.js';
import { env } from '../../env.js';

function mockRes() {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number;
    body?: unknown;
    status(code: number): typeof res;
    json(body: unknown): typeof res;
  };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

function mockReq(body: unknown): Request {
  return { body } as unknown as Request;
}

const ORIGINAL_ANTHROPIC_KEY = env.anthropicApiKey;
beforeEach(() => { env.anthropicApiKey = ''; });
afterEach(() => { env.anthropicApiKey = ORIGINAL_ANTHROPIC_KEY; });

const SAMPLE_BODY = { text: '.brand-primary { color: #1E90FF; }' };
const SAMPLE_TOKENS = { palette: { primary: '#1E90FF' }, typography: {}, shape: {}, logo: { found: false } };

describe('POST /branding/extract — con businessId (getTenantSecret)', () => {
  test('negocio con clave IA propia → usa esa clave (source=tenant)', async () => {
    let calledWith: unknown;
    const deps: BrandingExtractDeps = {
      getTenantSecret: async (businessId, name, opts) => {
        calledWith = { businessId, name, opts };
        return { value: 'sk-tenant-propia', source: 'tenant' };
      },
      extractWithAnthropic: async (_source, apiKey) => {
        assert.equal(apiKey, 'sk-tenant-propia');
        return SAMPLE_TOKENS;
      },
    };

    const res = mockRes();
    await extractHandler(deps, mockReq({ ...SAMPLE_BODY, businessId: 'biz-1' }), res);

    assert.deepEqual(calledWith, {
      businessId: 'biz-1',
      name: 'ANTHROPIC_API_KEY',
      opts: { fallbackEnv: 'ANTHROPIC_API_KEY' },
    });
    assert.deepEqual((res.body as { source: string; tokens: unknown }).source, 'ai');
  });

  test('negocio sin clave propia → getTenantSecret cae a operador (comportamiento delegado, sin regresión)', async () => {
    const deps: BrandingExtractDeps = {
      getTenantSecret: async () => ({ value: 'sk-operador', source: 'operator' }),
      extractWithAnthropic: async (_source, apiKey) => {
        assert.equal(apiKey, 'sk-operador');
        return SAMPLE_TOKENS;
      },
    };
    const res = mockRes();
    await extractHandler(deps, mockReq({ ...SAMPLE_BODY, businessId: 'biz-1' }), res);
    assert.equal((res.body as { source: string }).source, 'ai');
  });

  test('negocio sin clave propia ni fallback → "no configurada", sin llamar a la IA', async () => {
    const deps: BrandingExtractDeps = {
      getTenantSecret: async () => null,
      extractWithAnthropic: async () => { throw new Error('no debería llamarse'); },
    };
    const res = mockRes();
    await extractHandler(deps, mockReq({ ...SAMPLE_BODY, businessId: 'biz-1' }), res);
    const body = res.body as { source: string; tokens: unknown; message?: string };
    assert.equal(body.source, 'none');
    assert.equal(body.tokens, null);
  });
});

describe('POST /branding/extract — sin businessId (onboarding, comportamiento anterior intacto)', () => {
  test('con ANTHROPIC_API_KEY del operador → usa esa clave directamente, sin invocar getTenantSecret', async () => {
    env.anthropicApiKey = 'sk-operador-global';
    const deps: BrandingExtractDeps = {
      getTenantSecret: async () => { throw new Error('no debería llamarse sin businessId'); },
      extractWithAnthropic: async (_source, apiKey) => {
        assert.equal(apiKey, 'sk-operador-global');
        return SAMPLE_TOKENS;
      },
    };
    const res = mockRes();
    await extractHandler(deps, mockReq(SAMPLE_BODY), res);
    assert.equal((res.body as { source: string }).source, 'ai');
  });

  test('sin ANTHROPIC_API_KEY del operador → "IA no configurada" (mensaje idéntico al anterior)', async () => {
    env.anthropicApiKey = '';
    const deps: BrandingExtractDeps = {
      getTenantSecret: async () => { throw new Error('no debería llamarse sin businessId'); },
      extractWithAnthropic: async () => { throw new Error('no debería llamarse'); },
    };
    const res = mockRes();
    await extractHandler(deps, mockReq(SAMPLE_BODY), res);
    const body = res.body as { source: string; tokens: unknown; message?: string };
    assert.equal(body.source, 'none');
    assert.equal(body.tokens, null);
    assert.match(body.message ?? '', /ANTHROPIC_API_KEY/);
  });
});

describe('POST /branding/extract — validación y errores', () => {
  test('sin files ni text → 422', async () => {
    const deps: BrandingExtractDeps = {
      getTenantSecret: async () => null,
      extractWithAnthropic: async () => { throw new Error('no debería llamarse'); },
    };
    const res = mockRes();
    await extractHandler(deps, mockReq({}), res);
    assert.equal(res.statusCode, 422);
  });

  test('fallo de la IA → 502, sin filtrar la clave en el mensaje', async () => {
    env.anthropicApiKey = 'sk-operador-global';
    const deps: BrandingExtractDeps = {
      getTenantSecret: async () => null,
      extractWithAnthropic: async () => { throw new Error('Anthropic 500: fallo de red'); },
    };
    const res = mockRes();
    await extractHandler(deps, mockReq(SAMPLE_BODY), res);
    assert.equal(res.statusCode, 502);
    const body = res.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'ai_failed');
    assert.ok(!body.error.message.includes('sk-operador-global'));
  });
});
