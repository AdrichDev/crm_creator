'use client';
// Descarga del ZIP de exportación en web (flujo de un solo botón).
// El diálogo nativo "Guardar como" se abre en el CLIC de Exportar (gesto válido)
// y devuelve un FileSystemFileHandle. Cuando el job termina, se escribe el ZIP en
// ese handle SIN necesidad de un nuevo gesto (el permiso persiste). En navegadores
// sin File System Access API no hay diálogo: al terminar se baja por anchor.

import { apiFetchBlob } from '@/lib/api/client';

// --- Tipado mínimo de la File System Access API (no está en la lib DOM) ---
interface FileSystemWritableStreamLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
export interface SaveFileHandle {
  createWritable(): Promise<FileSystemWritableStreamLike>;
}
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}
type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;

function getShowSaveFilePicker(): ShowSaveFilePicker | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  return typeof fn === 'function' ? fn : null;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Abre el diálogo nativo "Guardar como". DEBE llamarse desde un gesto del usuario
 * (onClick de Exportar).
 * @returns el handle elegido; `null` si el navegador no soporta la API (el flujo
 *   sigue sin handle y bajará por anchor al terminar).
 * @throws AbortError si el usuario cancela el diálogo (el llamador debe abortar).
 */
export async function openSaveDialog(filename: string): Promise<SaveFileHandle | null> {
  const picker = getShowSaveFilePicker();
  if (!picker) return null; // No soportado (Firefox/Safari): sin diálogo, sin handle.
  return picker({
    suggestedName: filename,
    types: [{ description: 'Archivo ZIP', accept: { 'application/zip': ['.zip'] } }],
  });
}

/**
 * Baja el ZIP del job terminado y lo entrega al usuario.
 *  - Con `handle` (elegido en el clic de Exportar): escribe el blob en él, sin gesto.
 *  - Sin `handle`: descarga por anchor + object URL (el navegador decide la ubicación).
 */
export async function downloadExportZip(
  jobId: string,
  filename: string,
  handle?: SaveFileHandle | null,
): Promise<void> {
  const blob = await apiFetchBlob(`/exports/${jobId}/download`);

  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  // Fallback (Firefox/Safari/no soportado): descarga por anchor + object URL.
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Deriva un nombre de fichero para la descarga a partir del outputPath que fija
 * el back (p.ej. ".../mi-negocio-web-src.zip"). Devuelve solo el basename.
 * Fallback genérico si no hay outputPath disponible.
 */
export function filenameFromOutputPath(outputPath?: string): string {
  if (!outputPath) return 'export-web-src.zip';
  const parts = outputPath.split(/[\\/]/);
  const base = parts[parts.length - 1];
  return base || 'export-web-src.zip';
}

/** Slug para el nombre sugerido en el diálogo (espejo del back toSlug). */
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}
