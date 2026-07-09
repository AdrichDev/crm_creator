/**
 * back/src/lib/__tests__/export-fixture.ts
 *
 * Fixture compartida entre los tests de crm-export-clean-manifest: replica
 * el layout que `createTempCopy` deja en el tmp (`rootDir/front` +
 * `rootDir/shared`), con el nucleo comun a las 4 allowlists y, opcionalmente,
 * cruft de desarrollo / wrappers de plataforma ajena / un `.env.local` con
 * secreto de prueba.
 *
 * NO es un archivo `*.test.ts`: no lo recoge el runner
 * (`src/**\/!(*.e2e).test.ts`), es un helper importado por los tests reales.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface FixtureOptions {
  /** Contenido de `.env.local` a sembrar en frontDir (simula el del operador). */
  envLocalSecret?: string;
  /** Incluir cruft de desarrollo (openspec/, e2e/, tests/, etc.). */
  includeCruft?: boolean;
  /** Incluir wrappers de plataforma ajena (android/, electron/, capacitor.config.ts, electron-builder.yml). */
  includeCrossPlatform?: boolean;
}

export interface Fixture {
  rootDir: string;
  frontDir: string;
}

/** Nucleo presente en las 4 allowlists (app/components/lib/public + configs). */
const CORE_ENTRIES: Record<string, string> = {
  'app/page.tsx': '// page',
  'components/Button.tsx': '// button',
  'lib/util.ts': '// util',
  'public/favicon.ico': 'x',
  'package.json': '{}',
  'package-lock.json': '{}',
  'next.config.ts': '// next config',
  'next-env.d.ts': '// next-env',
  'tsconfig.json': '{}',
  'tailwind.config.ts': '// tailwind',
  'postcss.config.mjs': '// postcss',
};

/** Wrappers nativos de plataforma ajena (android/apk vs electron/exe). */
const CROSS_PLATFORM_ENTRIES: Record<string, string> = {
  'capacitor.config.ts': '// capacitor (sera sobreescrito por customizeCapacitorConfig)',
  'android/app/build.gradle': 'applicationId "com.example.placeholder"',
  'electron/main.js': '// electron main',
  'electron-builder.yml': '# electron-builder',
};

/** Cruft de desarrollo que NUNCA debe llegar a ningun ZIP (design.md, WU7). */
export const CRUFT_ENTRIES: Record<string, string> = {
  'openspec/changes/x/proposal.md': '# proposal',
  'e2e/example.spec.ts': '// e2e',
  'tests/example.test.ts': '// test',
  'test-results/error-context.md': '# fail',
  'vitest.config.ts': '// vitest',
  'vitest.setup.ts': '// setup',
  'playwright.config.ts': '// pw',
  'eslint.config.mjs': '// eslint',
  '.gitignore': 'node_modules',
  '.npmrc': 'engine-strict=true',
  'tsconfig.tsbuildinfo': '{}',
};

function writeEntries(baseDir: string, entries: Record<string, string>): void {
  for (const [rel, content] of Object.entries(entries)) {
    const full = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/**
 * Construye una fixture con el layout `rootDir/front` + `rootDir/shared`
 * (simulando el resultado de `createTempCopy`).
 */
export function buildFixtureTmp(options: FixtureOptions = {}): Fixture {
  const rootDir = path.join(os.tmpdir(), `export-fixture-${randomUUID()}`);
  const frontDir = path.join(rootDir, 'front');
  fs.mkdirSync(frontDir, { recursive: true });

  writeEntries(frontDir, CORE_ENTRIES);
  if (options.includeCrossPlatform) writeEntries(frontDir, CROSS_PLATFORM_ENTRIES);
  if (options.includeCruft) writeEntries(frontDir, CRUFT_ENTRIES);
  if (options.envLocalSecret) {
    fs.writeFileSync(path.join(frontDir, '.env.local'), options.envLocalSecret);
  }

  // shared/ al lado de front/ (raiz del tmp), tal como lo deja createTempCopy.
  fs.mkdirSync(path.join(rootDir, 'shared', 'generate'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'shared', 'generate', 'build-sql.ts'), '// build-sql');

  return { rootDir, frontDir };
}

export function cleanupFixture(fixture: Fixture): void {
  fs.rmSync(fixture.rootDir, { recursive: true, force: true });
}

/** Nombres (con `/`) de todas las entradas de cruft, para asserts de ausencia. */
export const CRUFT_RELATIVE_PATHS = Object.keys(CRUFT_ENTRIES);
