/**
 * back/src/lib/storage-exports.ts
 *
 * crm-generator-versiones-historico (WU2): cliente de Supabase Storage para el
 * historial de versiones del generador. Bucket privado `export-artifacts`
 * (aprovisionamiento manual, gate humano — ver tasks.md 2.1). Sin URLs públicas:
 * toda descarga pasa por `signExportUrl` (URL firmada, TTL corto).
 *
 * Patrón calcado de `routes/upload.ts:70-81` (mismo `supabaseAdmin.storage`),
 * salvo que aquí el bucket es privado y se firma en vez de exponer `getPublicUrl`.
 */

import { createRequire } from 'node:module';
import { supabaseAdmin } from './auth.js';

const require = createRequire(import.meta.url);
type Archiver = import('archiver').Archiver;
type EntryData = import('archiver').EntryData;
type ArchiverFactory = (
  format: 'zip' | 'tar',
  options?: { zlib?: { level?: number } },
) => Archiver;
const archiver = require('archiver') as ArchiverFactory;

export const EXPORT_ARTIFACTS_BUCKET = 'export-artifacts';

/** TTL corto: descarga inmediata, no un enlace persistente (design.md). */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Subconjunto de `StorageFileApi` (`supabaseAdmin.storage.from(BUCKET)`) que
 * consumen estas funciones. DI (mismo patrón que `ExportsDb`/`JobDeps`) para
 * poder testear sin red ni credenciales reales de Supabase.
 */
export interface ExportStorageApi {
  upload(
    path: string,
    buffer: Buffer,
    options: { contentType: string; upsert: boolean },
  ): Promise<{ error: { message: string } | null }>;
  createSignedUrl(
    path: string,
    expiresInSeconds: number,
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
}

function defaultStorage(): ExportStorageApi {
  return supabaseAdmin.storage.from(EXPORT_ARTIFACTS_BUCKET) as unknown as ExportStorageApi;
}

/** Construye la key determinista del artefacto de una versión concreta. */
export function exportArtifactPath(businessId: string, versionId: string): string {
  return `${businessId}/${versionId}.zip`;
}

/**
 * Comprime un directorio completo (recursivo) a un Buffer ZIP en memoria. Usado
 * para archivar `ctx.frontDir` tal cual, sin allowlist ni build adicional — el
 * artefacto de versión es la fuente completa compartida por todos los builders,
 * no el ZIP filtrado que produce `buildWebZip`.
 */
export async function zipDirectoryToBuffer(dir: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('warning', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') reject(err);
    });
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    archive.directory(dir, false);
    void archive.finalize();
  });
}

/**
 * Sube el artefacto de una versión al bucket privado `export-artifacts`, bajo la
 * key `{businessId}/{versionId}.zip`. Devuelve la `storagePath` (key) a persistir
 * en `ExportVersion.storagePath`. Propaga el error de Supabase Storage tal cual —
 * el llamador decide la política de fallo (design.md: no crea la fila, no revierte
 * el job).
 */
export async function uploadExportArtifact(
  businessId: string,
  versionId: string,
  buffer: Buffer,
  storage: ExportStorageApi = defaultStorage(),
): Promise<{ storagePath: string }> {
  const storagePath = exportArtifactPath(businessId, versionId);
  const { error } = await storage.upload(storagePath, buffer, {
    contentType: 'application/zip',
    upsert: false,
  });
  if (error) {
    throw new Error(`[storage-exports] upload failed: ${error.message}`);
  }
  return { storagePath };
}

/**
 * Genera una URL firmada temporal (TTL ~60s) para descargar el artefacto exacto de
 * una versión. Propaga el error si `storagePath` no existe en el bucket.
 */
export async function signExportUrl(
  storagePath: string,
  storage: ExportStorageApi = defaultStorage(),
): Promise<{ url: string }> {
  const { data, error } = await storage.createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`[storage-exports] signed URL failed: ${error?.message ?? 'no data'}`);
  }
  return { url: data.signedUrl };
}
