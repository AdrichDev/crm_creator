// Almacenamiento de assets de landing por proyecto (UC-2, tarea 2.2).
//
// Abstracción `LandingStore` con una implementación LOCAL (filesystem) y un hueco
// explícito para Supabase Storage en el futuro (design.md §2.3). Espejo del patrón
// de `lib/supabase/data-client.ts`: el caller no cambia cuando se sustituya el
// backend; solo cambia la factoría.
//
// SEGURIDAD:
//  - Server-only. NO importar desde componentes de cliente.
//  - El directorio local vive FUERA de `front/public/` y fuera de cualquier árbol
//    servido estáticamente: `<repo>/.landing-store/<projectId>/`. Así NUNCA se
//    sirve como archivo estático; servir la landing (POSPUESTO) tendría que pasar
//    por un route handler con CSP/headers/aislamiento (design.md §2.4) — no se
//    implementa aquí.
//  - Defensa en profundidad anti path-traversal: además de la validación de
//    `validate-zip.ts`, cada ruta destino se resuelve con `path.resolve` y se
//    verifica que quede DENTRO del directorio del proyecto antes de escribir/leer.
//  - `projectId` se restringe a un slug seguro para que no pueda escapar del
//    directorio raíz del store.

import { promises as fs } from 'node:fs';
import path from 'node:path';

// Guarda server-only sin dependencia externa: en un bundle de navegador no existe
// `process.versions.node`. Importar esto desde cliente lanza en cuanto se usa.
if (typeof process === 'undefined' || !process.versions?.node) {
  throw new Error('lib/landing/store.ts es server-only: no importar desde el cliente.');
}

/** Fichero a almacenar: ruta segura (relativa, POSIX) + bytes. */
export interface LandingFile {
  /** Ruta segura ya validada por `validate-zip.ts` (relativa, separador `/`). */
  path: string;
  bytes: Buffer;
}

/** Resultado de almacenar un bundle. */
export interface LandingPutResult {
  /** Referencia opaca del almacenamiento (a guardar en `config.landing.assetsRef`). */
  ref: string;
  /** Nº de ficheros escritos. */
  count: number;
}

/** Asset recuperado del store. */
export interface LandingAsset {
  bytes: Buffer;
  /** Ruta segura relativa dentro del bundle. */
  path: string;
}

/**
 * Contrato de almacenamiento de landings. Implementaciones: local (ahora),
 * Supabase Storage (futuro, misma interfaz).
 */
export interface LandingStore {
  /** Reemplaza el bundle del proyecto por estos ficheros. Devuelve la ref del store. */
  put(projectId: string, files: LandingFile[]): Promise<LandingPutResult>;
  /** Lee un asset del bundle del proyecto, o null si no existe. */
  get(projectId: string, assetPath: string): Promise<LandingAsset | null>;
  /** Elimina por completo el bundle del proyecto (reversibilidad estructural — devil-notes #4). */
  remove(projectId: string): Promise<void>;
}

/** Sanea el projectId a un slug seguro. Lanza si no es válido (fail-closed). */
function safeProjectId(projectId: string): string {
  const slug = String(projectId).trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(slug) || slug === '.' || slug === '..') {
    throw new Error('projectId no válido para el almacenamiento de landing.');
  }
  return slug;
}

/**
 * Resuelve una ruta relativa contra una base y verifica que NO escape de ella.
 * Defensa en profundidad: la validación del ZIP ya rechaza `..`/absolutas, pero
 * esto cierra cualquier caso residual a nivel de filesystem.
 */
function resolveInside(base: string, relative: string): string {
  // Rechazo directo de cualquier segmento `..` (coherente con validate-zip, que
  // nunca produce rutas con `..`). Más estricto que solo comprobar contención:
  // bloquea también `../<proyecto>/...` que resolvería de vuelta dentro.
  const segments = String(relative).replace(/\\/g, '/').split('/');
  if (segments.some((s) => s === '..')) {
    throw new Error('Ruta de asset con "..": rechazada (path traversal).');
  }
  const target = path.resolve(base, relative);
  const baseResolved = path.resolve(base);
  const withSep = baseResolved.endsWith(path.sep) ? baseResolved : baseResolved + path.sep;
  if (target !== baseResolved && !target.startsWith(withSep)) {
    throw new Error('Ruta de asset fuera del directorio del proyecto (path traversal).');
  }
  return target;
}

/** Implementación local en filesystem, bajo un directorio fuera de `public/`. */
export class LocalLandingStore implements LandingStore {
  /** Directorio raíz del store (absoluto). */
  private readonly root: string;

  constructor(root?: string) {
    // Por defecto, `<repo>/.landing-store` (subiendo desde `front/`). Fuera de
    // `public/` y de cualquier árbol servible estáticamente.
    this.root = root ?? path.resolve(process.cwd(), '..', '.landing-store');
  }

  private projectDir(projectId: string): string {
    return path.join(this.root, safeProjectId(projectId));
  }

  async put(projectId: string, files: LandingFile[]): Promise<LandingPutResult> {
    const dir = this.projectDir(projectId);
    // Reemplazo limpio del bundle anterior (idempotente).
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });

    let count = 0;
    for (const f of files) {
      const dest = resolveInside(dir, f.path); // verifica contención
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, f.bytes);
      count++;
    }
    return { ref: `local:${safeProjectId(projectId)}`, count };
  }

  async get(projectId: string, assetPath: string): Promise<LandingAsset | null> {
    const dir = this.projectDir(projectId);
    let dest: string;
    try {
      dest = resolveInside(dir, assetPath);
    } catch {
      return null; // ruta peligrosa → tratar como no encontrado
    }
    try {
      const bytes = await fs.readFile(dest);
      return { bytes, path: assetPath };
    } catch {
      return null;
    }
  }

  async remove(projectId: string): Promise<void> {
    await fs.rm(this.projectDir(projectId), { recursive: true, force: true });
  }
}

/**
 * Factoría del store. Hoy siempre devuelve el local. El día que exista Supabase
 * Storage, aquí se decidirá según env (mismo patrón que `isSupabaseEnabled()`),
 * SIN tocar a los callers.
 *
 * TODO(futuro · arquitectura:landing-store): implementar `SupabaseLandingStore`
 * con bucket por proyecto detrás de esta misma interfaz.
 */
export function getLandingStore(): LandingStore {
  return new LocalLandingStore();
}
