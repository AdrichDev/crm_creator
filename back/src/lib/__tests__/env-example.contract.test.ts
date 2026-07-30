// crm-env-contract-tiers (WU1.4): verificación estática de que `front/.env.example`
// documenta TODA variable `process.env.*` consumida en el código real del front
// (design.md §5/§8, validation.md AC2). Escanea `front/` en disco (patrón ya usado
// por `exports.ts`: `back/` y `front/` son directorios hermanos) y compara contra el
// contenido del `.env.example` regenerado en este change.
//
// Exclusiones deliberadas (documentadas en docs/ENV-CONTRACT.md §4):
// - `NEXT_PUBLIC_TENANT_JSON`: la hornea SIEMPRE `buildEnvContent` (auto-generada,
//   nunca la rellena una persona; un placeholder rompería la decodificación).
// - Directorio `e2e/`: scripts de verificación (Playwright), no runtime de la app
//   (p. ej. `E2E_EMAIL`/`E2E_PASSWORD`, ver front/e2e/_auth.ts).
// - `node_modules/`, `.next/`: build output / dependencias, no código fuente propio.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FRONT_DIR = path.resolve(process.cwd(), '..', 'front');
const ENV_EXAMPLE_PATH = path.join(FRONT_DIR, '.env.example');

const SCAN_EXCLUDED_DIRS = new Set(['node_modules', '.next', 'e2e', 'coverage', '.git']);
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

/** Variables auto-generadas o de tooling externo al runtime de la app (ver cabecera). */
const DOCUMENTATION_EXEMPT = new Set(['NEXT_PUBLIC_TENANT_JSON']);

const PROCESS_ENV_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;

function collectFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // front/ ausente en algún entorno de CI aislado — no rompe el back suite.
  }
  for (const entry of entries) {
    if (SCAN_EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function collectConsumedEnvVars(): Set<string> {
  const vars = new Set<string>();
  for (const file of collectFiles(FRONT_DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(PROCESS_ENV_RE)) {
      vars.add(match[1]);
    }
  }
  return vars;
}

/** Extrae los nombres de variable declarados (`NOMBRE=`) en `.env.example`. */
function collectDocumentedEnvVars(): Set<string> {
  const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  const vars = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=/);
    if (match) vars.add(match[1]);
  }
  return vars;
}

describe('front/.env.example — contrato completo (crm-env-contract-tiers WU1)', () => {
  test('toda variable process.env.* consumida en front/ (salvo exentas) está documentada', () => {
    const consumed = collectConsumedEnvVars();
    const documented = collectDocumentedEnvVars();

    const missing = [...consumed].filter(
      (name) => !DOCUMENTATION_EXEMPT.has(name) && !documented.has(name),
    );

    assert.deepEqual(missing, [], `Variables consumidas en front/ sin documentar en .env.example: ${missing.join(', ')}`);
  });

  test('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY está documentada (AC2 — front/lib/maps/loader.ts lanza sin ella)', () => {
    const documented = collectDocumentedEnvVars();
    assert.ok(documented.has('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));
  });

  test('.env.example no contiene ningún valor real — toda línea NOMBRE=... deja el valor vacío antes de un comentario opcional', () => {
    const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
    const offending: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match) continue;
      const rawValue = match[2];
      const valueWithoutComment = rawValue.split('#')[0].trim();
      if (valueWithoutComment !== '') offending.push(match[1]);
    }
    assert.deepEqual(offending, [], `Líneas con valor no vacío en .env.example: ${offending.join(', ')}`);
  });
});
