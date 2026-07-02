import { describe, it, expect } from 'vitest';
import { CATEGORY_LABEL, MODULE_MAP, MODULES, type ModuleCategory } from '@/lib/config/modules';
import { effectiveCategory, groupModules } from '@/lib/config/module-category';

describe('effectiveCategory (WU1.2)', () => {
  it('devuelve el override del vertical comerciales para el módulo comercial', () => {
    expect(effectiveCategory('comerciales', 'comercial')).toBe('core');
  });

  it('devuelve la categoría global del catálogo para verticales sin override', () => {
    expect(effectiveCategory('peluqueria', 'comercial')).toBe(MODULE_MAP.comercial.category);
    expect(effectiveCategory('peluqueria', 'comercial')).toBe('operativa');
  });

  it('cae a la categoría global cuando el vertical no tiene override para ese módulo', () => {
    expect(effectiveCategory('comerciales', 'clientes')).toBe(MODULE_MAP.clientes.category);
  });
});

describe('groupModules (WU3.1/WU3.2)', () => {
  it('agrupa en el orden fijo Esencial → Operativa → Personas → Retail → Marketing', () => {
    const groups = groupModules(MODULES, 'peluqueria');
    const order = groups.map((g) => g.cat);
    const expectedOrder = (Object.keys(CATEGORY_LABEL) as ModuleCategory[]).filter((cat) => order.includes(cat));
    expect(order).toEqual(expectedOrder);
  });

  it('no incluye grupos vacíos', () => {
    const activos = MODULES.filter((m) => m.id === 'dashboard' || m.id === 'clientes');
    const groups = groupModules(activos, 'peluqueria');
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups.map((g) => g.cat)).toEqual(['core']);
  });

  it('el módulo comercial cae en Esencial solo en el vertical comerciales', () => {
    const conComercial = MODULES.filter((m) => m.id === 'comercial' || m.id === 'dashboard');

    const gruposComerciales = groupModules(conComercial, 'comerciales');
    const grupoDeComercialEnComerciales = gruposComerciales.find((g) => g.items.some((m) => m.id === 'comercial'));
    expect(grupoDeComercialEnComerciales?.cat).toBe('core');

    const gruposPeluqueria = groupModules(conComercial, 'peluqueria');
    const grupoDeComercialEnPeluqueria = gruposPeluqueria.find((g) => g.items.some((m) => m.id === 'comercial'));
    expect(grupoDeComercialEnPeluqueria?.cat).toBe('operativa');
  });
});
