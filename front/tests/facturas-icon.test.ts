import { describe, it, expect } from 'vitest';
import { MODULE_MAP } from '@/lib/config/modules';
import { MODULES as GENERATOR_MODULES } from '../../shared/generate/tenant-types';

// Corrección de segunda pasada: el icono del módulo "Facturas" era `ReceiptText`
// (demasiado específico de caja registradora); el dueño de producto pidió algo
// genérico tipo "documento" → `FileText` (lucide-react). Debe coincidir en AMBAS
// copias del catálogo: front/lib/config/modules.ts y shared/generate/tenant-types.ts
// (el generador clona este catálogo al scaffoldear un tenant nuevo).
describe('Icono del módulo Facturas (corrección producto: documento genérico)', () => {
  it('front/lib/config/modules.ts usa FileText, no ReceiptText', () => {
    expect(MODULE_MAP.facturas.icon).toBe('FileText');
  });

  it('shared/generate/tenant-types.ts (catálogo del generador) coincide', () => {
    const facturas = GENERATOR_MODULES.find((m) => m.id === 'facturas');
    expect(facturas?.icon).toBe('FileText');
  });
});
