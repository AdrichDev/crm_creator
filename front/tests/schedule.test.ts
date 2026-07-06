import { describe, it, expect } from 'vitest';
import {
  type BusinessSchedule,
  emptySchedule, addGroup, removeGroup, setGroupDay, setGroupTramo,
  addGroupTramo, removeGroupTramo, setMode, scheduleToTramos,
} from '@/lib/config/schedule';
import { deserialize, configFromVertical } from '@/lib/config/tenant-config';

// Horario del negocio en onboarding (crm-operaos, sub-item horario/calendario):
// aplanado grupos→tramos, días cerrados, partido vs continuo, exclusividad de
// día entre grupos y retrocompatibilidad de TenantConfig sin `horario`.

describe('scheduleToTramos — aplanado grupos → tramos por día (OpeningHour)', () => {
  it('grupos L-J con horario A, V con B y S con C → tramos por día correctos', () => {
    const schedule: BusinessSchedule = {
      mode: 'continuo',
      groups: [
        { dias: [1, 2, 3, 4], tramos: [{ inicio: '09:00', fin: '17:00' }] },
        { dias: [5], tramos: [{ inicio: '09:00', fin: '14:00' }] },
        { dias: [6], tramos: [{ inicio: '10:00', fin: '13:00' }] },
      ],
    };
    expect(scheduleToTramos(schedule)).toEqual([
      { diaSemana: 1, inicio: '09:00', fin: '17:00' },
      { diaSemana: 2, inicio: '09:00', fin: '17:00' },
      { diaSemana: 3, inicio: '09:00', fin: '17:00' },
      { diaSemana: 4, inicio: '09:00', fin: '17:00' },
      { diaSemana: 5, inicio: '09:00', fin: '14:00' },
      { diaSemana: 6, inicio: '10:00', fin: '13:00' },
    ]);
  });

  it('día sin grupo = cerrado = sin filas (domingo ausente)', () => {
    const schedule: BusinessSchedule = {
      mode: 'continuo',
      groups: [{ dias: [1, 2], tramos: [{ inicio: '09:00', fin: '14:00' }] }],
    };
    const dias = scheduleToTramos(schedule).map((t) => t.diaSemana);
    expect(dias).not.toContain(0); // domingo cerrado
    expect(dias).not.toContain(6); // sábado cerrado
    expect(dias).toEqual([1, 2]);
  });

  it('horario partido: 2 tramos por día → 2 filas por diaSemana', () => {
    const schedule: BusinessSchedule = {
      mode: 'partido',
      groups: [{ dias: [1, 5], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '19:00' }] }],
    };
    expect(scheduleToTramos(schedule)).toEqual([
      { diaSemana: 1, inicio: '09:00', fin: '14:00' },
      { diaSemana: 1, inicio: '16:00', fin: '19:00' },
      { diaSemana: 5, inicio: '09:00', fin: '14:00' },
      { diaSemana: 5, inicio: '16:00', fin: '19:00' },
    ]);
  });

  it('sin horario (undefined) o sin grupos → sin filas', () => {
    expect(scheduleToTramos(undefined)).toEqual([]);
    expect(scheduleToTramos(emptySchedule())).toEqual([]);
  });

  it('tramos inválidos (vacíos o invertidos) no generan filas', () => {
    const schedule: BusinessSchedule = {
      mode: 'continuo',
      groups: [
        { dias: [1], tramos: [{ inicio: '', fin: '14:00' }] },
        { dias: [2], tramos: [{ inicio: '18:00', fin: '09:00' }] }, // invertido
        { dias: [3], tramos: [{ inicio: '09:00', fin: '14:00' }] }, // válido
      ],
    };
    expect(scheduleToTramos(schedule)).toEqual([{ diaSemana: 3, inicio: '09:00', fin: '14:00' }]);
  });
});

describe('setGroupDay — exclusividad de día entre grupos (last-wins)', () => {
  it('marcar un día en otro grupo lo QUITA del grupo anterior', () => {
    let s: BusinessSchedule = {
      mode: 'continuo',
      groups: [
        { dias: [1, 2, 3], tramos: [{ inicio: '09:00', fin: '17:00' }] },
        { dias: [5], tramos: [{ inicio: '09:00', fin: '14:00' }] },
      ],
    };
    s = setGroupDay(s, 1, 3, true); // miércoles pasa del grupo 0 al 1
    expect(s.groups[0].dias).toEqual([1, 2]);
    expect(s.groups[1].dias).toEqual([5, 3]);
    // Ningún día duplicado entre grupos.
    const all = s.groups.flatMap((g) => g.dias);
    expect(new Set(all).size).toBe(all.length);
  });

  it('desmarcar un día lo deja cerrado (no vuelve al grupo anterior)', () => {
    let s: BusinessSchedule = {
      mode: 'continuo',
      groups: [{ dias: [1, 2], tramos: [{ inicio: '09:00', fin: '17:00' }] }],
    };
    s = setGroupDay(s, 0, 2, false);
    expect(s.groups[0].dias).toEqual([1]);
    expect(scheduleToTramos(s).map((t) => t.diaSemana)).toEqual([1]);
  });
});

describe('setMode — partido vs continuo', () => {
  it('continuo → partido añade un segundo tramo a los grupos de 1 tramo', () => {
    let s = addGroup(emptySchedule('continuo')); // primer grupo L-V, 1 tramo
    expect(s.groups[0].tramos).toHaveLength(1);
    s = setMode(s, 'partido');
    expect(s.mode).toBe('partido');
    expect(s.groups[0].tramos).toHaveLength(2);
  });

  it('partido → continuo recorta cada grupo a su primer tramo', () => {
    let s: BusinessSchedule = {
      mode: 'partido',
      groups: [{ dias: [1], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '19:00' }] }],
    };
    s = setMode(s, 'continuo');
    expect(s.groups[0].tramos).toEqual([{ inicio: '09:00', fin: '14:00' }]);
  });

  it('en partido se pueden añadir tramos extra y quitar hasta el mínimo de 2', () => {
    let s = setMode(addGroup(emptySchedule('continuo')), 'partido');
    s = addGroupTramo(s, 0);
    expect(s.groups[0].tramos).toHaveLength(3);
    s = removeGroupTramo(s, 0, 2);
    expect(s.groups[0].tramos).toHaveLength(2);
    s = removeGroupTramo(s, 0, 1); // por debajo del mínimo → no-op
    expect(s.groups[0].tramos).toHaveLength(2);
  });
});

describe('grupos — alta, edición y borrado', () => {
  it('el primer grupo se pre-rellena L-V; los siguientes empiezan vacíos', () => {
    let s = addGroup(emptySchedule());
    expect(s.groups[0].dias).toEqual([1, 2, 3, 4, 5]);
    s = addGroup(s);
    expect(s.groups[1].dias).toEqual([]);
  });

  it('setGroupTramo edita inicio/fin y removeGroup cierra sus días', () => {
    let s = addGroup(emptySchedule());
    s = setGroupTramo(s, 0, 0, { inicio: '10:00' });
    expect(s.groups[0].tramos[0].inicio).toBe('10:00');
    s = removeGroup(s, 0);
    expect(scheduleToTramos(s)).toEqual([]);
  });
});

describe('TenantConfig.horario — retrocompatibilidad', () => {
  it('deserialize tolera configs antiguas SIN horario (queda undefined)', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    const raw = JSON.stringify(cfg); // configFromVertical no incluye horario
    const parsed = deserialize(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.horario).toBeUndefined();
    expect(scheduleToTramos(parsed!.horario)).toEqual([]); // aplanar sin horario no rompe
  });

  it('deserialize conserva el horario cuando está presente', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    cfg.horario = {
      mode: 'partido',
      groups: [{ dias: [1, 2], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '20:00' }] }],
    };
    const parsed = deserialize(JSON.stringify(cfg));
    expect(parsed!.horario).toEqual(cfg.horario);
    expect(scheduleToTramos(parsed!.horario)).toHaveLength(4);
  });
});
