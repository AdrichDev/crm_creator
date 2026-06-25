// Validación defensiva de un ZIP de landing (UC-2, tarea 2.1).
//
// SEGURIDAD — superficie crítica del change crm-onboarding-edit-landing-ia:
// un ZIP es contenido NO confiable controlado por quien lo sube. Este módulo NO
// sirve nada y NO escribe nada en disco: solo VALIDA y NORMALIZA las entradas
// del ZIP en memoria. La extracción/almacenamiento real vive en `store.ts`, y
// servir la landing públicamente queda POSPUESTO (ver design.md §2.4 y devil-notes
// #1: servir HTML/JS de terceros en el mismo origen del CRM = robo de sesión).
//
// Defensas implementadas (design.md §2.2):
//   1. Tamaño total del ZIP comprimido <= límite.
//   2. Nº de entradas <= límite.
//   3. Tamaño descomprimido acumulado <= límite + ratio de compresión vigilado
//      (anti zip-bomb).
//   4. Anti path-traversal: rechaza `..`, rutas absolutas (POSIX y Windows),
//      y cualquier ruta que escape del directorio raíz tras normalizar.
//   5. Allowlist estricta de extensiones (solo assets web estáticos).
//   6. Rechazo de bytes nulos / caracteres de control en los nombres.
//   7. Requiere un index.html en raíz o en una única subcarpeta (define `entry`).
//
// El módulo es puro/determinista y agnóstico del runtime: recibe las entradas ya
// listadas (nombre + tamaños) para poder testearse sin jszip ni FS.

/** Límites por defecto. Ajustables por el caller (endpoint) si hace falta. */
export const ZIP_LIMITS = {
  /** Tamaño máximo del ZIP comprimido, en bytes (10 MB). */
  maxZipBytes: 10 * 1024 * 1024,
  /** Nº máximo de entradas (ficheros + carpetas) en el ZIP. */
  maxEntries: 500,
  /** Tamaño descomprimido acumulado máximo, en bytes (50 MB). */
  maxUncompressedBytes: 50 * 1024 * 1024,
  /** Ratio de compresión máximo por entrada (descomprimido / comprimido). Anti zip-bomb. */
  maxCompressionRatio: 200,
} as const;

/** Extensiones de assets web permitidas (en minúscula, con punto). */
export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json',
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.txt', '.map',
]);

/** Una entrada del ZIP tal y como la reporta el lector (jszip u otro). */
export interface ZipEntryMeta {
  /** Nombre/ruta tal cual viene del ZIP. NO confiar en él. */
  name: string;
  /** ¿Es un directorio? */
  dir: boolean;
  /** Tamaño descomprimido en bytes (si lo conoce el lector). */
  uncompressedSize?: number;
  /** Tamaño comprimido en bytes (si lo conoce el lector). */
  compressedSize?: number;
}

export interface ValidatedEntry {
  /** Nombre original del ZIP. */
  original: string;
  /** Ruta normalizada y segura (POSIX, relativa al raíz del bundle). */
  safePath: string;
  uncompressedSize: number;
}

export interface ZipValidationOk {
  ok: true;
  /** Solo ficheros (sin directorios), con su ruta segura. */
  files: ValidatedEntry[];
  /** Ruta del index.html dentro del bundle (raíz o subcarpeta única). */
  entry: string;
  totalUncompressed: number;
}

export interface ZipValidationError {
  ok: false;
  /** Código de máquina para tests/telemetría. */
  code:
    | 'zip-too-large'
    | 'too-many-entries'
    | 'uncompressed-too-large'
    | 'compression-bomb'
    | 'path-traversal'
    | 'absolute-path'
    | 'illegal-name'
    | 'disallowed-extension'
    | 'no-index'
    | 'empty';
  /** Mensaje legible para el usuario (no filtra detalles internos). */
  message: string;
  /** Entrada culpable, si aplica. */
  offending?: string;
}

export type ZipValidationResult = ZipValidationOk | ZipValidationError;

/** Extensión en minúscula incluyendo el punto, o '' si no tiene. */
export function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return ''; // sin punto, o oculto tipo ".env" (dot===0) → sin ext válida
  return base.slice(dot).toLowerCase();
}

/**
 * Normaliza una ruta de entrada de ZIP a una ruta POSIX segura y RELATIVA, o
 * devuelve un código de error si es peligrosa. Implementación sin dependencias de
 * `path` para ser determinista en cualquier runtime y testeable.
 */
function safeNormalize(name: string): { safePath: string } | { error: ZipValidationError['code'] } {
  // 1. Bytes nulos / caracteres de control (U+0000–U+001F) → ilegal.
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 0x20) return { error: 'illegal-name' };
  }

  // 2. Rutas absolutas: POSIX (/...), UNC (\\...), Windows con unidad (C:\ o C:/).
  if (name.startsWith('/') || name.startsWith('\\')) return { error: 'absolute-path' };
  if (/^[a-zA-Z]:[\\/]/.test(name)) return { error: 'absolute-path' };

  // 3. Unificar separadores a POSIX y trocear.
  const parts = name.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue; // segmentos vacíos o '.' se ignoran
    if (part === '..') return { error: 'path-traversal' }; // nunca permitir subir de nivel
    stack.push(part);
  }
  const safePath = stack.join('/');
  if (safePath === '') return { error: 'illegal-name' };
  return { safePath };
}

/**
 * Valida la lista de entradas de un ZIP de landing. NO lee contenidos: solo
 * metadatos. Devuelve las rutas seguras y la `entry` (index.html) si todo es
 * correcto, o el primer error encontrado (fail-closed: cualquier fallo = rechazo
 * del ZIP completo, nunca extracción parcial silenciosa).
 */
export function validateZipEntries(
  entries: ZipEntryMeta[],
  zipBytes: number,
  limits: typeof ZIP_LIMITS = ZIP_LIMITS,
): ZipValidationResult {
  if (zipBytes > limits.maxZipBytes) {
    return { ok: false, code: 'zip-too-large', message: 'El ZIP supera el tamaño máximo permitido.' };
  }
  if (entries.length > limits.maxEntries) {
    return { ok: false, code: 'too-many-entries', message: 'El ZIP contiene demasiadas entradas.' };
  }

  const files: ValidatedEntry[] = [];
  let totalUncompressed = 0;

  for (const e of entries) {
    const norm = safeNormalize(e.name);
    if ('error' in norm) {
      return {
        ok: false,
        code: norm.error,
        message:
          norm.error === 'path-traversal'
            ? 'El ZIP contiene rutas con "..": rechazado por seguridad.'
            : norm.error === 'absolute-path'
              ? 'El ZIP contiene rutas absolutas: rechazado por seguridad.'
              : 'El ZIP contiene un nombre de archivo no válido.',
        offending: e.name,
      };
    }

    if (e.dir) continue; // directorios: ya validados por nombre; no se almacenan como fichero

    // Allowlist de extensiones (tras normalizar, sobre el nombre base real).
    const ext = extensionOf(norm.safePath);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        ok: false,
        code: 'disallowed-extension',
        message: `Tipo de archivo no permitido en la landing: "${ext || 'sin extensión'}". Solo se admiten assets web.`,
        offending: e.name,
      };
    }

    const size = e.uncompressedSize ?? 0;
    totalUncompressed += size;
    if (totalUncompressed > limits.maxUncompressedBytes) {
      return {
        ok: false,
        code: 'uncompressed-too-large',
        message: 'El contenido descomprimido del ZIP es demasiado grande.',
        offending: e.name,
      };
    }

    // Anti zip-bomb por entrada: ratio descomprimido/comprimido desorbitado.
    if (e.compressedSize && e.compressedSize > 0) {
      const ratio = size / e.compressedSize;
      if (ratio > limits.maxCompressionRatio) {
        return {
          ok: false,
          code: 'compression-bomb',
          message: 'El ZIP tiene un ratio de compresión sospechoso (posible zip-bomb).',
          offending: e.name,
        };
      }
    }

    files.push({ original: e.name, safePath: norm.safePath, uncompressedSize: size });
  }

  if (files.length === 0) {
    return { ok: false, code: 'empty', message: 'El ZIP no contiene archivos válidos.' };
  }

  const entry = findIndexHtml(files);
  if (!entry) {
    return {
      ok: false,
      code: 'no-index',
      message: 'El ZIP debe contener un index.html en la raíz o en una única subcarpeta.',
    };
  }

  return { ok: true, files, entry, totalUncompressed };
}

/**
 * Localiza el index.html que actuará de `entry`. Acepta:
 *   - `index.html` en la raíz, o
 *   - `<carpeta-única>/index.html` cuando todo cuelga de una sola subcarpeta.
 * Devuelve la ruta segura del index o null si no hay un index inequívoco.
 */
export function findIndexHtml(files: ValidatedEntry[]): string | null {
  const root = files.find((f) => f.safePath.toLowerCase() === 'index.html');
  if (root) return root.safePath;

  // Candidatos `*/index.html` a un solo nivel de profundidad.
  const candidates = files.filter((f) => {
    const lower = f.safePath.toLowerCase();
    return lower.endsWith('/index.html') && lower.split('/').length === 2;
  });
  if (candidates.length === 1) return candidates[0].safePath;
  return null;
}
