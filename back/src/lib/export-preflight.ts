/**
 * back/src/lib/export-preflight.ts
 *
 * Preflight dummy para la arquitectura SaaS Puro (ZIP Source Export).
 * Ya no se comprueba JDK, Android SDK ni Electron Builder, ya que el
 * servidor no compila binarios locales.
 */

import type { BuildFormat } from "./export-job-manager.js";

export type ToolchainMissing = string;

export interface ToolchainResult {
  ok: boolean;
  missing: ToolchainMissing[];
}

export async function checkToolchain(
  format: BuildFormat,
  frontDir = "",
  depsInput: any = {},
): Promise<ToolchainResult> {
  return { ok: true, missing: [] };
}
