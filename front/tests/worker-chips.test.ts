import { describe, it, expect } from 'vitest';
import {
  WORKER_CHIPS, WORKER_CHIP_MAP, emptyWorkerChips, workerChipAvailable, activeWorkerChips,
  type WorkerChipId,
} from '@/lib/config/worker-chips';
import { emptyModules } from '@/lib/config/tenant-config';
import { configFromVertical, deserialize } from '@/lib/config/tenant-config';
import type { ModuleId } from '@/lib/config/modules';

const allModulesOn = (): Record<ModuleId, boolean> => {
  const m = emptyModules();
  for (const k of Object.keys(m)) m[k as ModuleId] = true;
  return m;
};

describe('UC-1 · catálogo de chips del trabajador', () => {
  it('AC-1.1 cada chip tiene id, label, descripción e icono', () => {
    for (const c of WORKER_CHIPS) {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.icon).toBeTruthy();
    }
  });

  it('AC-1.2 incluye los chips base requeridos', () => {
    const ids = WORKER_CHIPS.map((c) => c.id);
    for (const id of ['fichaje-rapido', 'proxima-cita', 'mis-ventas-hoy', 'disponibilidad', 'pedir-ausencia'] as WorkerChipId[]) {
      expect(ids).toContain(id);
    }
  });

  it('AC-1.3 ids únicos y mapa coherente', () => {
    const ids = WORKER_CHIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of WORKER_CHIPS) expect(WORKER_CHIP_MAP[c.id]).toBe(c);
  });

  it('AC-1.4 las dependencias apuntan a módulos válidos', () => {
    const modules = emptyModules();
    for (const c of WORKER_CHIPS) {
      if (c.dependsOn) expect(c.dependsOn in modules).toBe(true);
    }
  });
});

describe('UC-2 · estado por defecto y merge', () => {
  it('AC-2.1 emptyWorkerChips arranca todo en false', () => {
    const chips = emptyWorkerChips();
    expect(Object.keys(chips).length).toBe(WORKER_CHIPS.length);
    expect(Object.values(chips).every((v) => v === false)).toBe(true);
  });

  it('AC-2.2 config nueva incluye workerChips', () => {
    const cfg = configFromVertical('peluqueria', 'Test');
    expect(cfg.workerChips).toBeDefined();
    expect(Object.keys(cfg.workerChips).length).toBe(WORKER_CHIPS.length);
  });

  it('AC-2.3 deserialize rellena workerChips ausente en config antigua', () => {
    const cfg = configFromVertical('peluqueria', 'Test');
    const legacy = { ...cfg } as Record<string, unknown>;
    delete legacy.workerChips;
    const parsed = deserialize(JSON.stringify(legacy));
    expect(parsed).not.toBeNull();
    expect(parsed!.workerChips).toBeDefined();
    expect(Object.keys(parsed!.workerChips).length).toBe(WORKER_CHIPS.length);
  });

  it('AC-2.4 deserialize preserva chips activados y añade los nuevos del catálogo', () => {
    const cfg = configFromVertical('peluqueria', 'Test');
    cfg.workerChips['disponibilidad'] = true;
    const partial = { ...cfg, workerChips: { disponibilidad: true } } as unknown;
    const parsed = deserialize(JSON.stringify(partial));
    expect(parsed!.workerChips['disponibilidad']).toBe(true);
    expect(parsed!.workerChips['fichaje-rapido']).toBe(false);
  });
});

describe('UC-3 · disponibilidad por dependencia de módulo', () => {
  it('AC-3.1 chip apagado no está disponible aunque su módulo esté activo', () => {
    const chips = emptyWorkerChips();
    const fichaje = WORKER_CHIP_MAP['fichaje-rapido'];
    expect(workerChipAvailable(fichaje, chips, allModulesOn())).toBe(false);
  });

  it('AC-3.2 chip activo con módulo dependiente apagado NO está disponible', () => {
    const chips = emptyWorkerChips();
    chips['fichaje-rapido'] = true;
    const modules = emptyModules(); // fichaje = false
    expect(workerChipAvailable(WORKER_CHIP_MAP['fichaje-rapido'], chips, modules)).toBe(false);
  });

  it('AC-3.3 chip activo con módulo dependiente encendido SÍ está disponible', () => {
    const chips = emptyWorkerChips();
    chips['fichaje-rapido'] = true;
    expect(workerChipAvailable(WORKER_CHIP_MAP['fichaje-rapido'], chips, allModulesOn())).toBe(true);
  });

  it('AC-3.4 chip sin dependencia (disponibilidad) solo necesita estar activo', () => {
    const chips = emptyWorkerChips();
    chips['disponibilidad'] = true;
    expect(workerChipAvailable(WORKER_CHIP_MAP['disponibilidad'], chips, emptyModules())).toBe(true);
  });
});

describe('UC-4 · lista de chips activos para render', () => {
  it('AC-4.1 sin chips activos → lista vacía', () => {
    expect(activeWorkerChips(emptyWorkerChips(), allModulesOn())).toEqual([]);
  });

  it('AC-4.2 filtra los que dependen de un módulo apagado', () => {
    const chips = emptyWorkerChips();
    chips['fichaje-rapido'] = true; // depende de fichaje (apagado)
    chips['disponibilidad'] = true; // sin dependencia
    const active = activeWorkerChips(chips, emptyModules());
    const ids = active.map((c) => c.id);
    expect(ids).toContain('disponibilidad');
    expect(ids).not.toContain('fichaje-rapido');
  });

  it('AC-4.3 con todos los módulos activos, devuelve todos los chips encendidos', () => {
    const chips = emptyWorkerChips();
    chips['fichaje-rapido'] = true;
    chips['mis-ventas-hoy'] = true;
    const active = activeWorkerChips(chips, allModulesOn());
    expect(active.map((c) => c.id).sort()).toEqual(['fichaje-rapido', 'mis-ventas-hoy']);
  });
});
