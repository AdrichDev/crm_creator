// Unit test del catálogo fijo de secretos por-tenant (crm-onboarding-tenant-keys WU1).
// Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TENANT_SECRET_CATALOG, findSecretSlot } from '../catalog.js';

describe('TENANT_SECRET_CATALOG', () => {
  test('tiene exactamente los 5 slots con scope/envVarName/provider exactos', () => {
    assert.equal(TENANT_SECRET_CATALOG.length, 5);

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
