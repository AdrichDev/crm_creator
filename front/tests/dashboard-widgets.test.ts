import { describe, it, expect } from 'vitest';
import {
  AGENDA_GROUP, DASHBOARD_WIDGETS, MAX_AGENDA_GROUP_DEFAULTS, MAX_DASHBOARD_WIDGETS,
  activeDashboardWidgets, dashboardWidgetAvailable, defaultDashboardWidgets, emptyDashboardWidgets,
  type WidgetId,
} from '@/lib/config/dashboard-widgets';
import { emptyModules } from '@/lib/config/tenant-config';
import { MODULE_MAP } from '@/lib/config/modules';
import { VERTICALS } from '@/lib/config/verticals';

const ALL_MODULES_ON = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => w.dependsOn).filter(Boolean).map((m) => [m, true]),
) as Record<string, boolean>;

describe('emptyDashboardWidgets', () => {
  it('devuelve un array vacío', () => {
    expect(emptyDashboardWidgets()).toEqual([]);
  });
});

describe('dashboardWidgetAvailable', () => {
  const agenda = DASHBOARD_WIDGETS.find((w) => w.id === 'agenda')!;
  const ventas = DASHBOARD_WIDGETS.find((w) => w.id === 'ventas-hoy')!;

  it('false si no está en la selección', () => {
    expect(dashboardWidgetAvailable(agenda, [], { citas: true } as never)).toBe(false);
  });

  it('false si depende de un módulo apagado', () => {
    expect(dashboardWidgetAvailable(ventas, ['ventas-hoy'], { ventas: false } as never)).toBe(false);
  });

  it('true si está seleccionado y su módulo (si tiene) está activo', () => {
    expect(dashboardWidgetAvailable(ventas, ['ventas-hoy'], { ventas: true } as never)).toBe(true);
  });

  it('true sin dependsOn aunque no haya módulos definidos', () => {
    // Ningún widget del catálogo actual carece de dependsOn, pero el contrato debe sostenerlo.
    const sinDependencia = { ...agenda, dependsOn: undefined };
    expect(dashboardWidgetAvailable(sinDependencia, ['agenda'], {} as never)).toBe(true);
  });
});

describe('activeDashboardWidgets', () => {
  it('respeta el orden del catálogo, no el de la selección', () => {
    const seleccionInvertida: WidgetId[] = ['ventas-hoy', 'agenda', 'kpis-hoy'];
    const activos = activeDashboardWidgets(seleccionInvertida, ALL_MODULES_ON as never);
    expect(activos.map((w) => w.id)).toEqual(['agenda', 'kpis-hoy', 'ventas-hoy']);
  });

  it('filtra los widgets cuyo módulo está apagado', () => {
    const modules = { ...ALL_MODULES_ON, ventas: false };
    const activos = activeDashboardWidgets(['agenda', 'ventas-hoy'], modules as never);
    expect(activos.map((w) => w.id)).toEqual(['agenda']);
  });

  it('nunca devuelve más de MAX_DASHBOARD_WIDGETS aunque la selección tenga más', () => {
    const todos = DASHBOARD_WIDGETS.map((w) => w.id); // 8 ids > límite de 6
    const activos = activeDashboardWidgets(todos, ALL_MODULES_ON as never);
    expect(activos.length).toBeLessThanOrEqual(MAX_DASHBOARD_WIDGETS);
  });

  it('selección vacía → sin widgets activos', () => {
    expect(activeDashboardWidgets([], ALL_MODULES_ON as never)).toEqual([]);
  });
});

describe('defaultDashboardWidgets', () => {
  it('incluye agenda primero solo si el vertical tiene el módulo citas', () => {
    for (const v of VERTICALS) {
      const ids = defaultDashboardWidgets(v.id);
      if (v.defaultModules.includes('citas')) {
        expect(ids[0]).toBe('agenda');
      } else {
        expect(ids).not.toContain('agenda');
        expect(ids).not.toContain('kpis-hoy');
        expect(ids).not.toContain('proximos-eventos');
      }
    }
  });

  it('centro-deportivo prioriza categorias+proximos-eventos sobre kpis-hoy (no duplica info del calendario)', () => {
    const ids = defaultDashboardWidgets('centro-deportivo');
    expect(ids.slice(0, 3)).toEqual(['agenda', 'categorias', 'proximos-eventos']);
    expect(ids).not.toContain('kpis-hoy');
  });

  it('un vertical con citas pero sin categorias arranca con agenda+proximos y completa con variedad (no un 3er widget de agenda)', () => {
    const ids = defaultDashboardWidgets('fitness');
    expect(ids.slice(0, 2)).toEqual(['agenda', 'proximos-eventos']);
    // kpis-hoy sería el 3er widget del grupo agenda: queda fuera por la regla anti-repetición.
    expect(ids).not.toContain('kpis-hoy');
    expect(ids).not.toContain('ocupacion-semana');
  });

  it('ningún vertical recibe más de MAX_AGENDA_GROUP_DEFAULTS widgets del grupo agenda (regla anti-repetición)', () => {
    for (const v of VERTICALS) {
      const ids = defaultDashboardWidgets(v.id);
      const deAgenda = ids.filter((id) => AGENDA_GROUP.has(id));
      expect(deAgenda.length, `vertical ${v.id} apila widgets de agenda: ${deAgenda.join(', ')}`)
        .toBeLessThanOrEqual(MAX_AGENDA_GROUP_DEFAULTS);
    }
  });

  it('comerciales completa con los widgets de sus módulos reales (contactos/comercial) en vez de repetir agenda', () => {
    const ids = defaultDashboardWidgets('comerciales');
    expect(ids).toEqual(['agenda', 'proximos-eventos', 'clientes-nuevos', 'contactos-nuevos', 'visitas-comercial']);
  });

  it('vertical "custom" (sin módulo citas) no recibe agenda/kpis/proximos', () => {
    const ids = defaultDashboardWidgets('custom');
    // contactos-nuevos entra porque el módulo `contactos` es obligatorio (siempre activo).
    expect(ids).toEqual(['clientes-nuevos', 'contactos-nuevos']);
  });

  it('nunca supera MAX_DASHBOARD_WIDGETS para ningún vertical', () => {
    for (const v of VERTICALS) {
      expect(defaultDashboardWidgets(v.id).length).toBeLessThanOrEqual(MAX_DASHBOARD_WIDGETS);
    }
  });

  it('sin duplicados para ningún vertical', () => {
    for (const v of VERTICALS) {
      const ids = defaultDashboardWidgets(v.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('centro-deportivo incluye widgets cuyo módulo está en su defaultModules (o es obligatorio)', () => {
    const ids = defaultDashboardWidgets('centro-deportivo');
    const vertical = VERTICALS.find((v) => v.id === 'centro-deportivo')!;
    for (const id of ids) {
      const def = DASHBOARD_WIDGETS.find((w) => w.id === id)!;
      if (def.dependsOn && !MODULE_MAP[def.dependsOn].mandatory) {
        expect(vertical.defaultModules).toContain(def.dependsOn);
      }
    }
  });

  it('vertical "custom" (solo módulo clientes) no incluye widgets con módulo no soportado', () => {
    const ids = defaultDashboardWidgets('custom');
    for (const id of ids) {
      const def = DASHBOARD_WIDGETS.find((w) => w.id === id)!;
      // `contactos` es obligatorio (siempre activo), por eso también cuenta como soportado.
      if (def.dependsOn) expect(['clientes', 'contactos']).toContain(def.dependsOn);
    }
  });

  it('cada default resultante está realmente disponible con los módulos de ese vertical', () => {
    for (const v of VERTICALS) {
      const modules = { ...emptyModules() };
      for (const m of v.defaultModules) modules[m] = true;
      const ids = defaultDashboardWidgets(v.id);
      const activos = activeDashboardWidgets(ids, modules);
      // Todo lo que defaultDashboardWidgets propone debe sobrevivir el filtro real.
      expect(activos.map((w) => w.id).sort()).toEqual([...ids].sort());
    }
  });
});

// ---------------------------------------------------------------------------
// Estrés: combinaciones masivas selección × módulos, sin asumir nada del orden
// de entrada ni de la presencia de claves — debe sobrevivir basura razonable.
// ---------------------------------------------------------------------------
describe('activeDashboardWidgets — estrés', () => {
  it('1000 combinaciones aleatorias de selección/módulos nunca exceden el máximo ni duplican', () => {
    const allIds = DASHBOARD_WIDGETS.map((w) => w.id);
    for (let i = 0; i < 1000; i++) {
      // Selección aleatoria con posibles duplicados y tamaño variable (incl. > catálogo).
      const size = Math.floor(Math.random() * 15);
      const seleccion: WidgetId[] = Array.from({ length: size }, () => allIds[Math.floor(Math.random() * allIds.length)]);
      const modules = Object.fromEntries(
        allIds.map((id) => {
          const def = DASHBOARD_WIDGETS.find((w) => w.id === id)!;
          return def.dependsOn ? [def.dependsOn, Math.random() > 0.5] : [id, true];
        }),
      );
      const activos = activeDashboardWidgets(seleccion, modules as never);
      expect(activos.length).toBeLessThanOrEqual(MAX_DASHBOARD_WIDGETS);
      expect(new Set(activos.map((w) => w.id)).size).toBe(activos.length);
    }
  });

  it('selección con un único id repetido 50 veces no rompe nada', () => {
    const seleccion = Array<WidgetId>(50).fill('agenda');
    const activos = activeDashboardWidgets(seleccion, ALL_MODULES_ON as never);
    expect(activos).toHaveLength(1);
    expect(activos[0].id).toBe('agenda');
  });
});
