import { describe, it, expect } from 'vitest';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { configFromVertical, deserialize, emptyModules } from '@/lib/config/tenant-config';

describe('naming del vertical comerciales (WU2.1)', () => {
  it('trae el naming de comercial de campo', () => {
    const t = VERTICAL_MAP.comerciales.terminology;
    expect(t.comercial).toBe('Mapa comercial');
    expect(t.clientes).toBe('Cartera de clientes');
    expect(t.citas).toBe('Agenda');
    expect(t.ventas).toBe('Pedidos');
    expect(t.estadisticas).toBe('Informes');
  });
});

describe('deserialize no pisa overrides guardados (WU2.2/WU2.4)', () => {
  it('conserva la terminología personalizada del tenant al deserializar', () => {
    const cfg = configFromVertical('comerciales');
    cfg.terminology = { ...cfg.terminology, clientes: 'Mis tiendas' };
    const raw = JSON.stringify(cfg);
    const parsed = deserialize(raw);
    expect(parsed?.terminology.clientes).toBe('Mis tiendas');
  });

  it('un tenant antiguo con un módulo del nuevo default off activado a mano lo conserva', () => {
    // Config guardada de un tenant `comerciales` anterior al cambio de defaults,
    // donde el usuario había activado `servicios` a mano (hoy off por defecto).
    const legacy = { ...emptyModules(), clientes: true, comercial: true, citas: true, servicios: true } as Record<string, boolean>;
    const raw = JSON.stringify({
      business: { name: 'Comercial X', vertical: 'comerciales' },
      modules: legacy,
      workerChips: {},
      terminology: { ...VERTICAL_MAP.comerciales.terminology },
      branding: { primary: '#000', secondary: '#fff', logoText: 'CX' },
      setupComplete: true,
    });
    const cfg = deserialize(raw);
    expect(cfg?.modules.servicios).toBe(true);
  });
});

describe('defaultModules del vertical comerciales (WU2.3)', () => {
  it('activa solo lo esencial de un comercial de campo por defecto', () => {
    const cfg = configFromVertical('comerciales');
    expect(cfg.modules.dashboard).toBe(true);
    expect(cfg.modules.clientes).toBe(true);
    expect(cfg.modules.comercial).toBe(true);
    expect(cfg.modules.citas).toBe(true);
    expect(cfg.modules.configuracion).toBe(true);
    expect(cfg.modules['mi-cuenta']).toBe(true);
    // facturas entra en el default (crm-clientes-empresa-vs-contacto): la tabla de
    // Clientes SIEMPRE pinta una columna Facturas para cualquier vertical con
    // `clientes` activo; dejarlo fuera del default hacía que ese botón rebotara a
    // /panel (ModuleGuard) en negocios nuevos de este vertical.
    expect(cfg.modules.facturas).toBe(true);
  });

  it('deja retail/marketing y el resto apagados pero activables', () => {
    const cfg = configFromVertical('comerciales');
    expect(cfg.modules.servicios).toBe(false);
    expect(cfg.modules.empleados).toBe(false);
    expect(cfg.modules.fichaje).toBe(false);
    expect(cfg.modules.vacaciones).toBe(false);
    expect(cfg.modules.productos).toBe(false);
    expect(cfg.modules.ventas).toBe(false);
    expect(cfg.modules.marketing).toBe(false);
    expect(cfg.modules.estadisticas).toBe(false);
  });
});
