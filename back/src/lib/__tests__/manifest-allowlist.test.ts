/**
 * back/src/lib/__tests__/manifest-allowlist.test.ts
 *
 * WU1.2: casos de filtrado del allowlist compartido + escritor unico de
 * .env.local/.env.example (crm-export-clean-manifest).
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  WEB_ALLOWLIST,
  ANDROID_ALLOWLIST,
  IOS_ALLOWLIST,
  DESKTOP_ALLOWLIST,
  NATIVE_EXCLUDE_PATHS,
  allowlistFilter,
  buildEnvContent,
  writeFreshEnvLocal,
  buildEnvExampleContent,
  writeFreshEnvExample,
} from '../export-builders/manifest-allowlist.js';
import type { TenantConfig } from '../../../../shared/generate/tenant-types.js';

const config = {
  business: { name: 'EDM San Blas', vertical: 'centro-deportivo' },
  modules: {},
  workerChips: {},
  terminology: {},
  branding: { primary: '#1E90FF', secondary: '#FF00AA', logoText: 'EDM' },
} as unknown as TenantConfig;

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// allowlistFilter
// ---------------------------------------------------------------------------

test('1.2 allowlistFilter: raiz permitida pasa', () => {
  const entry = { name: 'app/page.tsx' };
  assert.deepEqual(allowlistFilter(entry, WEB_ALLOWLIST), entry);
});

test('1.2 allowlistFilter: raiz NO permitida se descarta', () => {
  const entry = { name: 'openspec/changes/x/proposal.md' };
  assert.equal(allowlistFilter(entry, WEB_ALLOWLIST), false);
});

test('1.2 allowlistFilter: extraFiles permite un archivo puntual sin abrir toda la carpeta', () => {
  // 'build' no esta en DESKTOP_ALLOWLIST; solo 'build/icon.png' via extraFiles.
  const icon = { name: 'build/icon.png' };
  const other = { name: 'build/otro-artefacto.txt' };
  assert.deepEqual(allowlistFilter(icon, DESKTOP_ALLOWLIST, ['build/icon.png']), icon);
  assert.equal(
    allowlistFilter(other, DESKTOP_ALLOWLIST, ['build/icon.png']),
    false,
    'un archivo distinto dentro de build/ sigue descartado',
  );
});

test('1.2 allowlistFilter: normaliza separadores de Windows antes de comparar', () => {
  const entry = { name: 'app\\components\\foo.tsx' };
  assert.deepEqual(allowlistFilter(entry, WEB_ALLOWLIST), entry);
});

// ---------------------------------------------------------------------------
// Independencia de las 4 listas (AC3 — sin bloat cruzado)
// ---------------------------------------------------------------------------

test('1.2 WEB_ALLOWLIST no incluye capacitor/android/electron', () => {
  for (const forbidden of ['capacitor.config.ts', 'android', 'electron', 'electron-builder.yml']) {
    assert.ok(!WEB_ALLOWLIST.includes(forbidden), `web no debe listar ${forbidden}`);
  }
});

test('1.2 ANDROID_ALLOWLIST incluye capacitor+android, sin electron', () => {
  assert.ok(ANDROID_ALLOWLIST.includes('capacitor.config.ts'));
  assert.ok(ANDROID_ALLOWLIST.includes('android'));
  assert.ok(!ANDROID_ALLOWLIST.includes('electron'));
  assert.ok(!ANDROID_ALLOWLIST.includes('electron-builder.yml'));
});

test('1.2 IOS_ALLOWLIST incluye capacitor, SIN android ni electron', () => {
  assert.ok(IOS_ALLOWLIST.includes('capacitor.config.ts'));
  assert.ok(!IOS_ALLOWLIST.includes('android'));
  assert.ok(!IOS_ALLOWLIST.includes('electron'));
  assert.ok(!IOS_ALLOWLIST.includes('electron-builder.yml'));
});

test('1.2 DESKTOP_ALLOWLIST incluye electron, SIN android ni capacitor', () => {
  assert.ok(DESKTOP_ALLOWLIST.includes('electron'));
  assert.ok(DESKTOP_ALLOWLIST.includes('electron-builder.yml'));
  assert.ok(!DESKTOP_ALLOWLIST.includes('android'));
  assert.ok(!DESKTOP_ALLOWLIST.includes('capacitor.config.ts'));
});

// ---------------------------------------------------------------------------
// buildEnvContent / writeFreshEnvLocal (single-writer, design.md §3)
// ---------------------------------------------------------------------------

test('1.2/3.4 buildEnvContent guarda NEXT_PUBLIC_TENANT_JSON en base64 (no crudo) para que dotenv no lo trunque en el "#" de los colores hex', () => {
  const lines = buildEnvContent(config);
  const line = lines.find((l) => l.startsWith('NEXT_PUBLIC_TENANT_JSON='));
  assert.ok(line, 'debe existir la variable NEXT_PUBLIC_TENANT_JSON');

  const b64 = line!.slice('NEXT_PUBLIC_TENANT_JSON='.length);
  // Regresion: si se escribiera el JSON crudo, "#1E90FF" partiria la linea
  // para cualquier parser tipo dotenv que trata `#` como comentario.
  assert.ok(!b64.includes('#'), 'el valor NO debe contener "#" (debe ir en base64)');

  const decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  assert.equal(decoded.business.name, 'EDM San Blas');
  assert.equal(decoded.branding.primary, '#1E90FF');
});

test('1.2/2 buildEnvContent: con config.api.url escribe NEXT_PUBLIC_API_URL', () => {
  const withApi = { ...config, api: { url: 'https://api.example.com' } } as TenantConfig;
  const lines = buildEnvContent(withApi);
  assert.ok(lines.includes('NEXT_PUBLIC_API_URL=https://api.example.com'));
});

test('1.2/2 buildEnvContent: SIN config.api.url deja placeholder, nunca vacio/undefined', () => {
  const lines = buildEnvContent(config);
  assert.ok(
    lines.some((l) => l.startsWith('#') && l.includes('NEXT_PUBLIC_API_URL')),
    'debe dejar un placeholder comentado cuando no hay api.url',
  );
  assert.ok(!lines.some((l) => /^NEXT_PUBLIC_API_URL=/.test(l)));
});

test('1.2 writeFreshEnvLocal escribe exactamente las lineas dadas', () => {
  const dir = path.join(os.tmpdir(), `envlocal-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  trash.push(dir);

  writeFreshEnvLocal(dir, ['NEXT_PUBLIC_TENANT_JSON=abc', 'NEXT_PUBLIC_API_URL=https://x']);

  const content = fs.readFileSync(path.join(dir, '.env.local'), 'utf8');
  assert.equal(content, 'NEXT_PUBLIC_TENANT_JSON=abc\nNEXT_PUBLIC_API_URL=https://x\n');
});

test('1.2 writeFreshEnvLocal SIEMPRE sobreescribe: nunca deja un .env.local previo intacto', () => {
  const dir = path.join(os.tmpdir(), `envlocal-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  trash.push(dir);
  fs.writeFileSync(path.join(dir, '.env.local'), 'DEV_SECRET=shhh\n');

  writeFreshEnvLocal(dir, buildEnvContent(config));

  const content = fs.readFileSync(path.join(dir, '.env.local'), 'utf8');
  assert.ok(!content.includes('DEV_SECRET'), 'el secreto de dev no debe sobrevivir');
});

test('1.2 buildEnvExampleContent/writeFreshEnvExample: placeholder, nunca copiado del real', () => {
  const dir = path.join(os.tmpdir(), `envexample-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  trash.push(dir);
  // .env.example "real" con un valor de una sesion de desarrollo anterior.
  fs.writeFileSync(path.join(dir, '.env.example'), 'NEXT_PUBLIC_API_URL=http://old-dev-value\n');

  writeFreshEnvExample(dir, buildEnvExampleContent());

  const content = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
  assert.ok(!content.includes('old-dev-value'), 'nunca debe copiar el valor real del repo');
  assert.ok(content.includes('NEXT_PUBLIC_API_URL'), 'debe dejar el placeholder documentado');
});

// --- crm: proxies API operador (app/api) excluidos SOLO del paquete nativo ---
// Regresion: `output: export` (exe/apk/ios) no puede empaquetar route handlers
// dinamicos; se excluyen del ZIP nativo pero se conservan en web-zip.

test('nativo: app/api y su subarbol se excluyen aunque "app" este en la allowlist', () => {
  for (const list of [ANDROID_ALLOWLIST, IOS_ALLOWLIST, DESKTOP_ALLOWLIST]) {
    assert.equal(
      allowlistFilter({ name: 'app/api/ai/generate/route.ts' }, list, [], NATIVE_EXCLUDE_PATHS),
      false,
    );
    assert.equal(allowlistFilter({ name: 'app/api' }, list, [], NATIVE_EXCLUDE_PATHS), false);
    // Windows: separador invertido tambien se normaliza y excluye.
    assert.equal(
      allowlistFilter({ name: 'app\api\market-studies\route.ts' }, list, [], NATIVE_EXCLUDE_PATHS),
      false,
    );
  }
});

test('nativo: resto de app/ pasa; hermanos con "api" NO se excluyen por error', () => {
  const e = (name: string) =>
    allowlistFilter({ name }, ANDROID_ALLOWLIST, [], NATIVE_EXCLUDE_PATHS);
  assert.deepEqual(e('app/page.tsx'), { name: 'app/page.tsx' });
  assert.deepEqual(e('app/(crm)/categorias/[id]/page.tsx'), {
    name: 'app/(crm)/categorias/[id]/page.tsx',
  });
  // `lib/api/...` y `app/apitest` no matchean el prefijo `app/api/`.
  assert.deepEqual(e('lib/api/client.ts'), { name: 'lib/api/client.ts' });
});

test('web-zip: app/api SI se conserva (standalone soporta route handlers)', () => {
  assert.deepEqual(
    allowlistFilter({ name: 'app/api/ai/generate/route.ts' }, WEB_ALLOWLIST),
    { name: 'app/api/ai/generate/route.ts' },
  );
});
