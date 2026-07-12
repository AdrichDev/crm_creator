// Unit test del catálogo fijo de secretos por-tenant (crm-onboarding-tenant-keys WU1).
// Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TENANT_SECRET_CATALOG, findSecretSlot, ENV_KEY_NAME_PATTERN, inferScope } from '../catalog.js';

describe('TENANT_SECRET_CATALOG', () => {
  test('tiene exactamente los 7 slots con scope/envVarName/provider exactos', () => {
    assert.equal(TENANT_SECRET_CATALOG.length, 7);

    const byName = new Map(TENANT_SECRET_CATALOG.map((s) => [s.name, s]));

    assert.deepEqual(byName.get('OPENAI_API_KEY'), {
      name: 'OPENAI_API_KEY', label: 'OpenAI', scope: 'BACKEND_SECRET', provider: 'openai', group: 'ai',
    });
    assert.deepEqual(byName.get('GEMINI_API_KEY'), {
      name: 'GEMINI_API_KEY', label: 'Gemini', scope: 'BACKEND_SECRET', provider: 'gemini', group: 'ai',
    });
    assert.deepEqual(byName.get('ANTHROPIC_API_KEY'), {
      name: 'ANTHROPIC_API_KEY', label: 'Anthropic', scope: 'BACKEND_SECRET', provider: 'anthropic', group: 'ai',
    });
    assert.deepEqual(byName.get('GOOGLE_MAPS_API_KEY'), {
      name: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps', scope: 'FRONTEND_PUBLIC', provider: 'maps',
      envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', group: 'maps',
    });
    assert.deepEqual(byName.get('DATABASE_URL'), {
      name: 'DATABASE_URL', label: 'URL (BD)', scope: 'BACKEND_SECRET', provider: 'database', group: 'database',
    });
    assert.deepEqual(byName.get('NEXT_PUBLIC_SUPABASE_URL'), {
      name: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', scope: 'FRONTEND_PUBLIC', provider: 'supabase_url',
      envVarName: 'NEXT_PUBLIC_SUPABASE_URL', group: 'database',
    });
    assert.deepEqual(byName.get('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase anon key', scope: 'FRONTEND_PUBLIC', provider: 'supabase_anon',
      envVarName: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', group: 'database',
    });
  });

  test('findSecretSlot de los slots Supabase devuelve scope FRONTEND_PUBLIC, group database y envVarName == name', () => {
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const) {
      const slot = findSecretSlot(name);
      assert.ok(slot, `findSecretSlot(${name}) no debe ser undefined`);
      assert.equal(slot?.scope, 'FRONTEND_PUBLIC');
      assert.equal(slot?.group, 'database');
      assert.equal(slot?.envVarName, name);
    }
  });

  test('findSecretSlot devuelve el slot exacto para cada nombre del catálogo', () => {
    for (const slot of TENANT_SECRET_CATALOG) {
      assert.deepEqual(findSecretSlot(slot.name), slot);
    }
  });

  test('findSecretSlot devuelve undefined (no lanza) para un nombre fuera del catálogo', () => {
    assert.equal(findSecretSlot('FOO'), undefined);
    assert.equal(findSecretSlot(''), undefined);
  });
});

describe('ENV_KEY_NAME_PATTERN (crm-tenant-keys-freeform)', () => {
  test('acepta MAYUS_CON_GUION_BAJO empezando por letra', () => {
    assert.equal(ENV_KEY_NAME_PATTERN.test('NEXT_PUBLIC_SUPABASE_ANON_KEY'), true);
    assert.equal(ENV_KEY_NAME_PATTERN.test('STRIPE_SECRET_KEY'), true);
    assert.equal(ENV_KEY_NAME_PATTERN.test('A'), true);
    assert.equal(ENV_KEY_NAME_PATTERN.test('A1'), true);
  });

  test('rechaza minúsculas, espacios y nombres que empiezan por dígito', () => {
    assert.equal(ENV_KEY_NAME_PATTERN.test('stripe_key'), false);
    assert.equal(ENV_KEY_NAME_PATTERN.test('KEY CON ESPACIO'), false);
    assert.equal(ENV_KEY_NAME_PATTERN.test('1KEY'), false);
    assert.equal(ENV_KEY_NAME_PATTERN.test(''), false);
  });
});

describe('inferScope (crm-tenant-keys-freeform)', () => {
  test('NEXT_PUBLIC_* infiere FRONTEND_PUBLIC', () => {
    assert.equal(inferScope('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'FRONTEND_PUBLIC');
    assert.equal(inferScope('NEXT_PUBLIC_X'), 'FRONTEND_PUBLIC');
  });

  test('cualquier otro nombre infiere BACKEND_SECRET', () => {
    assert.equal(inferScope('STRIPE_SECRET_KEY'), 'BACKEND_SECRET');
    assert.equal(inferScope('DATABASE_URL'), 'BACKEND_SECRET');
  });
});
