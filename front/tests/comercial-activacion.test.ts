import { describe, it, expect } from 'vitest';
import { MODULE_MAP } from '@/lib/config/modules';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { configFromVertical, deserialize, emptyModules } from '@/lib/config/tenant-config';

describe('activación módulo comercial (WU3)', () => {
  it('el módulo comercial existe en el catálogo', () => {
    expect(MODULE_MAP.comercial).toBeDefined();
    expect(MODULE_MAP.comercial.href).toBe('/comercial');
  });

  it('el vertical Equipo comercial trae el módulo comercial activo por defecto', () => {
    expect(VERTICAL_MAP.comerciales.defaultModules).toContain('comercial');
    const cfg = configFromVertical('comerciales');
    expect(cfg.modules.comercial).toBe(true);
  });

  it('un vertical no comercial NO lo trae activo (sin regresión)', () => {
    const cfg = configFromVertical('peluqueria');
    expect(cfg.modules.comercial).toBe(false);
  });

  it('deserialize mergea el módulo nuevo en configs antiguas (a false)', () => {
    // Config antigua sin la clave `comercial` en modules.
    const legacy = { ...emptyModules() } as Record<string, boolean>;
    delete legacy.comercial;
    const raw = JSON.stringify({ business: { name: 'X', vertical: 'peluqueria' }, modules: legacy, workerChips: {}, terminology: {}, branding: { primary: '#000', secondary: '#fff', logoText: 'X' }, setupComplete: true });
    const cfg = deserialize(raw);
    expect(cfg?.modules.comercial).toBe(false);
  });
});
