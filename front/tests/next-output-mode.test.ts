import { describe, it, expect } from 'vitest';
import { resolveOutputMode } from '../lib/next-output-mode';

describe('resolveOutputMode (NEXT_OUTPUT_MODE)', () => {
  it("devuelve 'standalone' para el web zip", () => {
    expect(resolveOutputMode('standalone')).toBe('standalone');
  });

  it("devuelve 'export' para exe/apk", () => {
    expect(resolveOutputMode('export')).toBe('export');
  });

  it('devuelve undefined en dev (sin variable)', () => {
    expect(resolveOutputMode(undefined)).toBeUndefined();
  });

  it('ignora valores desconocidos (dev por defecto)', () => {
    expect(resolveOutputMode('')).toBeUndefined();
    expect(resolveOutputMode('production')).toBeUndefined();
  });
});
