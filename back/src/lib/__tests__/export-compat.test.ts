/**
 * back/src/lib/__tests__/export-compat.test.ts
 *
 * Tests de compat output:'export' (Fase 4): elimina app/api y paginas dinamicas
 * de la copia temporal, conservando el resto. Runner: node --import tsx --test
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyExportCompat } from '../export-compat.js';

const trash: string[] = [];
afterEach(() => {
  for (const d of trash.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

test('4: elimina app/api y directorios dinamicos, conserva rutas normales', () => {
  const front = path.join(os.tmpdir(), `compat-${randomUUID()}`);
  trash.push(front);

  // Route handlers.
  fs.mkdirSync(path.join(front, 'app', 'api', 'ai', 'generate'), { recursive: true });
  fs.writeFileSync(path.join(front, 'app', 'api', 'ai', 'generate', 'route.ts'), '// route');
  fs.mkdirSync(path.join(front, 'app', 'api', 'market-studies', '[[...path]]'), { recursive: true });

  // Paginas dinamicas.
  fs.mkdirSync(path.join(front, 'app', '(crm)', 'categorias', '[id]'), { recursive: true });
  fs.writeFileSync(path.join(front, 'app', '(crm)', 'categorias', '[id]', 'page.tsx'), '// page');
  fs.mkdirSync(path.join(front, 'app', '(crm)', 'estudios-mercado', '[id]'), { recursive: true });

  // Rutas normales que DEBEN conservarse.
  fs.mkdirSync(path.join(front, 'app', '(crm)', 'panel'), { recursive: true });
  fs.writeFileSync(path.join(front, 'app', '(crm)', 'panel', 'page.tsx'), '// panel');
  fs.writeFileSync(path.join(front, 'app', 'layout.tsx'), '// layout');

  const removed = applyExportCompat(front);

  assert.ok(!fs.existsSync(path.join(front, 'app', 'api')), 'app/api eliminado');
  assert.ok(
    !fs.existsSync(path.join(front, 'app', '(crm)', 'categorias', '[id]')),
    'categorias/[id] eliminado',
  );
  assert.ok(
    !fs.existsSync(path.join(front, 'app', '(crm)', 'estudios-mercado', '[id]')),
    'estudios-mercado/[id] eliminado',
  );

  // Conservados.
  assert.ok(fs.existsSync(path.join(front, 'app', '(crm)', 'panel', 'page.tsx')), 'panel conservado');
  assert.ok(fs.existsSync(path.join(front, 'app', 'layout.tsx')), 'layout conservado');

  assert.ok(removed.includes('app/api'), 'reporta app/api');
  assert.ok(removed.some((r) => r.endsWith('categorias/[id]')), 'reporta categorias/[id]');
});

test('4: no-op cuando no hay app/', () => {
  const front = path.join(os.tmpdir(), `compat-empty-${randomUUID()}`);
  trash.push(front);
  fs.mkdirSync(front, { recursive: true });
  assert.deepEqual(applyExportCompat(front), []);
});
