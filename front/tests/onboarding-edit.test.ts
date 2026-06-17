import { describe, it, expect } from 'vitest';
import { draftForEdit } from '@/lib/onboarding/edit-mode';
import { configFromVertical, emptyModules } from '@/lib/config/tenant-config';

describe('UC-1 · onboarding modo edición · draftForEdit', () => {
  it('copia profunda: no muta la config original', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    const draft = draftForEdit(cfg);
    draft.business.name = 'OTRO';
    draft.modules.marketing = !draft.modules.marketing;
    expect(cfg.business.name).toBe('Salón A');           // original intacto
    expect(draft.modules).not.toBe(cfg.modules);          // referencia distinta
  });

  it('conserva los módulos elegidos del proyecto', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    cfg.modules.marketing = false;
    const draft = draftForEdit(cfg);
    expect(draft.modules.marketing).toBe(false);
    expect(draft.modules.dashboard).toBe(true);            // obligatorio sigue
  });

  it('fusiona catálogo: módulos nuevos ausentes en config antigua aparecen', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    // Simula config antigua a la que le falta un módulo del catálogo actual.
    const old = JSON.parse(JSON.stringify(cfg));
    delete old.modules.facturas;
    const draft = draftForEdit(old);
    expect('facturas' in draft.modules).toBe(true);        // presente tras merge
    expect(Object.keys(draft.modules).sort()).toEqual(Object.keys(emptyModules()).sort());
  });

  it('quitar un módulo solo cambia su flag (no toca otros datos del proyecto)', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    cfg.favorites = [{ id: 'f1', target: 'clientes', options: [] }];
    const draft = draftForEdit(cfg);
    draft.modules.servicios = false;
    expect(draft.favorites).toEqual(cfg.favorites);        // favoritos conservados
  });
});
