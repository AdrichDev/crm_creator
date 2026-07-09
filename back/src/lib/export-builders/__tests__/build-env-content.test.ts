/**
 * back/src/lib/export-builders/__tests__/build-env-content.test.ts
 *
 * crm-env-contract-tiers (WU3.5): puente build-time secreto->variable de
 * build (`public-env-secrets.ts`) + integración con `buildEnvContent`
 * (escritor único de `.env.local`, `manifest-allowlist.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvContent } from '../manifest-allowlist.js';
import { buildPublicEnvSecretsLines, BASE_ENV_VAR_NAMES } from '../public-env-secrets.js';
import type { TenantConfig } from '../../../../../shared/generate/tenant-types.js';

const config = {
  business: { name: 'EDM San Blas', vertical: 'centro-deportivo' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#1E90FF', secondary: '#FF00AA', logoText: 'EDM' },
} as unknown as TenantConfig;

// ---------------------------------------------------------------------------
// buildPublicEnvSecretsLines — unidad
// ---------------------------------------------------------------------------

test('buildPublicEnvSecretsLines: FRONTEND_PUBLIC con envVarName produce línea NEXT_PUBLIC_*', () => {
  const lines = buildPublicEnvSecretsLines([{ envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', value: 'AIzaSy-real-key' }]);
  assert.deepEqual(lines, ['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy-real-key']);
});

test('buildPublicEnvSecretsLines: colisión con variable base → se descarta, gana la base', () => {
  const lines = buildPublicEnvSecretsLines([{ envVarName: 'NEXT_PUBLIC_API_URL', value: 'https://malicioso.example.com' }]);
  assert.deepEqual(lines, []);
});

test('buildPublicEnvSecretsLines: envVarName inválido (defensa en profundidad) → se descarta', () => {
  const lines = buildPublicEnvSecretsLines([{ envVarName: 'GOOGLE_MAPS_KEY', value: 'x' }]);
  assert.deepEqual(lines, []);
});

test('buildPublicEnvSecretsLines: valor con salto de línea (defensa en profundidad) → se descarta', () => {
  const lines = buildPublicEnvSecretsLines([{ envVarName: 'NEXT_PUBLIC_FOO', value: 'v1\nEXTRA=inyectado' }]);
  assert.deepEqual(lines, []);
});

test('buildPublicEnvSecretsLines: lista vacía → sin líneas', () => {
  assert.deepEqual(buildPublicEnvSecretsLines([]), []);
});

test('BASE_ENV_VAR_NAMES incluye las variables que buildEnvContent siempre puede emitir', () => {
  assert.deepEqual([...BASE_ENV_VAR_NAMES].sort(), ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_TENANT_JSON']);
});

// ---------------------------------------------------------------------------
// Integración con buildEnvContent (extraLines)
// ---------------------------------------------------------------------------

test('buildEnvContent: secreto horneable aparece como línea NEXT_PUBLIC_* junto a las líneas base', () => {
  const lines = buildEnvContent(config, {
    extraLines: buildPublicEnvSecretsLines([{ envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', value: 'AIzaSy-real-key' }]),
  });
  assert.ok(lines.some((l) => l === 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy-real-key'));
  assert.ok(lines.some((l) => l.startsWith('NEXT_PUBLIC_TENANT_JSON=')));
});

test('buildEnvContent: un BACKEND_SECRET nunca llega aquí (no hay ruta que lo convierta en línea)', () => {
  // Contrato por construcción: readBakeableSecrets filtra scope=FRONTEND_PUBLIC
  // en el WHERE de Prisma — un BACKEND_SECRET nunca entra a esta función. Este
  // test documenta que, aunque llegara por error, la única transformación
  // disponible (buildPublicEnvSecretsLines) no distingue scope: la barrera
  // real vive en la query, no aquí. Se deja constancia explícita del límite.
  const secretlikeButNotFromBakeable = [{ envVarName: 'NEXT_PUBLIC_LEAKED_BACKEND_KEY', value: 'sk-live-should-not-be-here' }];
  const lines = buildEnvContent(config, { extraLines: buildPublicEnvSecretsLines(secretlikeButNotFromBakeable) });
  // Si el nombre respeta el patrón NEXT_PUBLIC_ (como haría un envVarName
  // válido asignado a un FRONTEND_PUBLIC), sí se hornea — el gate de scope
  // está en la query (readBakeableSecrets), no en esta capa.
  assert.ok(lines.some((l) => l === 'NEXT_PUBLIC_LEAKED_BACKEND_KEY=sk-live-should-not-be-here'));
});

test('buildEnvContent: sin secretos públicos → comportamiento previo intacto (solo líneas base)', () => {
  const lines = buildEnvContent(config, { extraLines: buildPublicEnvSecretsLines([]) });
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('NEXT_PUBLIC_TENANT_JSON='));
  assert.equal(lines[1], '# NEXT_PUBLIC_API_URL sin configurar');
});

test('buildEnvContent: secretos públicos + runtimeConfig-style extraLines conviven sin pisarse', () => {
  const runtimeLines = ['PLATFORM_API_URL=https://api.example.com', 'TENANT_ID=biz-1', 'TENANT_API_KEY=tk_abc'];
  const publicLines = buildPublicEnvSecretsLines([{ envVarName: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', value: 'AIzaSy-real-key' }]);
  const lines = buildEnvContent(config, { extraLines: [...runtimeLines, ...publicLines] });
  assert.ok(lines.includes('PLATFORM_API_URL=https://api.example.com'));
  assert.ok(lines.includes('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy-real-key'));
});
