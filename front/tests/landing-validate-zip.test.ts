import { describe, it, expect } from 'vitest';
import {
  validateZipEntries,
  extensionOf,
  findIndexHtml,
  ZIP_LIMITS,
  type ZipEntryMeta,
  type ValidatedEntry,
} from '@/lib/landing/validate-zip';

// Entrada de fichero "normal" (no dir).
function f(name: string, size = 100, compressed = 100): ZipEntryMeta {
  return { name, dir: false, uncompressedSize: size, compressedSize: compressed };
}

const validBundle: ZipEntryMeta[] = [
  f('index.html', 500),
  f('styles/main.css', 800),
  f('app.js', 1200),
  f('img/logo.png', 4000),
];

describe('UC-2 · validate-zip · caso válido', () => {
  it('acepta un bundle web legítimo y detecta el index', () => {
    const r = validateZipEntries(validBundle, 5000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry).toBe('index.html');
      expect(r.files).toHaveLength(4);
      expect(r.totalUncompressed).toBe(6500);
    }
  });

  it('acepta index dentro de una única subcarpeta', () => {
    const r = validateZipEntries([f('site/index.html'), f('site/style.css')], 1000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry).toBe('site/index.html');
  });

  it('ignora directorios pero valida sus nombres', () => {
    const r = validateZipEntries(
      [{ name: 'assets/', dir: true }, f('index.html')],
      1000,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.files).toHaveLength(1); // el dir no cuenta como fichero
  });
});

describe('UC-2 · validate-zip · anti path-traversal', () => {
  it('rechaza "../" relativo', () => {
    const r = validateZipEntries([f('../evil.html'), f('index.html')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('path-traversal');
  });

  it('rechaza traversal anidado profundo', () => {
    const r = validateZipEntries([f('a/b/../../../../etc/passwd.txt')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('path-traversal');
  });

  it('rechaza ruta absoluta POSIX', () => {
    const r = validateZipEntries([f('/etc/cron.d/evil.js')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('absolute-path');
  });

  it('rechaza ruta absoluta Windows con unidad', () => {
    const r = validateZipEntries([f('C:\\Windows\\System32\\x.html')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('absolute-path');
  });

  it('rechaza ruta UNC con backslash inicial', () => {
    const r = validateZipEntries([f('\\\\server\\share\\x.html')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('absolute-path');
  });

  it('rechaza separadores backslash que esconden traversal', () => {
    const r = validateZipEntries([f('foo\\..\\..\\bar.html')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('path-traversal');
  });
});

describe('UC-2 · validate-zip · nombres ilegales', () => {
  it('rechaza byte nulo en el nombre', () => {
    const r = validateZipEntries([f('index.html\x00.js')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('illegal-name');
  });

  it('rechaza caracteres de control', () => {
    const r = validateZipEntries([f('a\x07b.html')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('illegal-name');
  });
});

describe('UC-2 · validate-zip · allowlist de extensiones', () => {
  it.each(['evil.php', 'run.sh', 'mal.exe', 'lib.dll', 'x.bat', 'noext'])(
    'rechaza %s',
    (bad) => {
      const r = validateZipEntries([f('index.html'), f(bad)], 1000);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('disallowed-extension');
    },
  );

  it.each(['index.html', 'a.css', 'a.js', 'a.mjs', 'a.svg', 'a.woff2', 'a.json', 'a.png'])(
    'acepta %s',
    (good) => {
      const entries = good === 'index.html' ? [f(good)] : [f('index.html'), f(good)];
      const r = validateZipEntries(entries, 1000);
      expect(r.ok).toBe(true);
    },
  );
});

describe('UC-2 · validate-zip · anti zip-bomb y límites', () => {
  it('rechaza ZIP comprimido demasiado grande', () => {
    const r = validateZipEntries(validBundle, ZIP_LIMITS.maxZipBytes + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('zip-too-large');
  });

  it('rechaza demasiadas entradas', () => {
    const many = Array.from({ length: ZIP_LIMITS.maxEntries + 1 }, (_, i) => f(`f${i}.txt`));
    const r = validateZipEntries([f('index.html'), ...many], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('too-many-entries');
  });

  it('rechaza descomprimido acumulado por encima del límite', () => {
    const huge = f('big.txt', ZIP_LIMITS.maxUncompressedBytes + 1, 1000);
    const r = validateZipEntries([f('index.html'), huge], 5000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('uncompressed-too-large');
  });

  it('rechaza ratio de compresión sospechoso (zip-bomb por entrada)', () => {
    // 10 MB descomprimidos desde 1 KB comprimido = ratio ~10000 >> 200.
    const bomb = f('bomb.txt', 10 * 1024 * 1024, 1024);
    const r = validateZipEntries([f('index.html'), bomb], 5000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('compression-bomb');
  });
});

describe('UC-2 · validate-zip · requisito de index', () => {
  it('rechaza bundle sin index.html', () => {
    const r = validateZipEntries([f('style.css'), f('app.js')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no-index');
  });

  it('rechaza index ambiguo en dos subcarpetas distintas', () => {
    const r = validateZipEntries([f('a/index.html'), f('b/index.html')], 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no-index');
  });

  it('rechaza ZIP vacío', () => {
    const r = validateZipEntries([], 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('empty');
  });
});

describe('UC-2 · helpers', () => {
  it('extensionOf normaliza a minúsculas y maneja sin-extensión', () => {
    expect(extensionOf('A.HTML')).toBe('.html');
    expect(extensionOf('path/to/Style.CSS')).toBe('.css');
    expect(extensionOf('Makefile')).toBe('');
    expect(extensionOf('.env')).toBe(''); // oculto sin extensión real
  });

  it('findIndexHtml prefiere el de raíz', () => {
    const files: ValidatedEntry[] = [
      { original: 'a/index.html', safePath: 'a/index.html', uncompressedSize: 1 },
      { original: 'index.html', safePath: 'index.html', uncompressedSize: 1 },
    ];
    expect(findIndexHtml(files)).toBe('index.html');
  });
});
