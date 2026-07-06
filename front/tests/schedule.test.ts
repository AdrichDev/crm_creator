import { describe, it, expect } from 'vitest';
import {
  type BusinessSchedule, type TramoDia,
  emptySchedule, addGroup, removeGroup, setGroupDay, setGroupTramo,
  addGroupTramo, removeGroupTramo, setGroupMode, setGroupAccepted,
  normalizeSchedule, scheduleToTramos, scheduleFromTramos,
} from '@/lib/config/schedule';
import { deserialize, configFromVertical } from '@/lib/config/tenant-config';

// Horario del negocio (crm-operaos-agenda-contactos-fichaje-telegram): aplanado
// grupos→tramos, días cerrados, MODO POR GRUPO (intensiva/partida independiente),
// aceptar/colapsar, exclusividad de día, retrocompat de la forma antigua (mode
// global) y round-trip scheduleFromTramos ↔ scheduleToTramos.

describe('scheduleToTramos — aplanado grupos → tramos por día (OpeningHour)', () => {
  it('grupos L-J con horario A, V con B y S con C → tramos por día correctos', () => {
    const schedule: BusinessSchedule = {
      groups: [
        { mode: 'continuo', dias: [1, 2, 3, 4], tramos: [{ inicio: '09:00', fin: '17:00' }] },
        { mode: 'continuo', dias: [5], tramos: [{ inicio: '09:00', fin: '14:00' }] },
        { mode: 'continuo', dias: [6], tramos: [{ inicio: '10:00', fin: '13:00' }] },
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

  it('día sin grupo = cerrado = sin filas (domingo/sábado ausentes)', () => {
    const schedule: BusinessSchedule = {
      groups: [{ mode: 'continuo', dias: [1, 2], tramos: [{ inicio: '09:00', fin: '14:00' }] }],
    };
    const dias = scheduleToTramos(schedule).map((t) => t.diaSemana);
    expect(dias).not.toContain(0);
    expect(dias).not.toContain(6);
    expect(dias).toEqual([1, 2]);
  });

  it('horario partido: 2 tramos por día → 2 filas por diaSemana', () => {
    const schedule: BusinessSchedule = {
      groups: [{ mode: 'partido', dias: [1, 5], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '19:00' }] }],
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
      groups: [
        { mode: 'continuo', dias: [1], tramos: [{ inicio: '', fin: '14:00' }] },
        { mode: 'continuo', dias: [2], tramos: [{ inicio: '18:00', fin: '09:00' }] }, // invertido
        { mode: 'continuo', dias: [3], tramos: [{ inicio: '09:00', fin: '14:00' }] }, // válido
      ],
    };
    expect(scheduleToTramos(schedule)).toEqual([{ diaSemana: 3, inicio: '09:00', fin: '14:00' }]);
  });
});

describe('setGroupDay — exclusividad de día entre grupos (last-wins)', () => {
  it('marcar un día en otro grupo lo QUITA del grupo anterior', () => {
    let s: BusinessSchedule = {
      groups: [
        { mode: 'continuo', dias: [1, 2, 3], tramos: [{ inicio: '09:00', fin: '17:00' }] },
        { mode: 'continuo', dias: [5], tramos: [{ inicio: '09:00', fin: '14:00' }] },
      ],
    };
    s = setGroupDay(s, 1, 3, true); // miércoles pasa del grupo 0 al 1
    expect(s.groups[0].dias).toEqual([1, 2]);
    expect(s.groups[1].dias).toEqual([5, 3]);
    const all = s.groups.flatMap((g) => g.dias);
    expect(new Set(all).size).toBe(all.length);
  });

  it('desmarcar un día lo deja cerrado (no vuelve al grupo anterior)', () => {
    let s: BusinessSchedule = {
      groups: [{ mode: 'continuo', dias: [1, 2], tramos: [{ inicio: '09:00', fin: '17:00' }] }],
    };
    s = setGroupDay(s, 0, 2, false);
    expect(s.groups[0].dias).toEqual([1]);
    expect(scheduleToTramos(s).map((t) => t.diaSemana)).toEqual([1]);
  });
});

describe('setGroupMode — modo POR GRUPO (intensiva/partida independiente)', () => {
  it('continuo → partido añade un segundo tramo SOLO a ese grupo', () => {
    let s = addGroup(emptySchedule('continuo')); // grupo 0 L-V, 1 tramo, continuo
    expect(s.groups[0].mode).toBe('continuo');
    expect(s.groups[0].tramos).toHaveLength(1);
    s = setGroupMode(s, 0, 'partido');
    expect(s.groups[0].mode).toBe('partido');
    expect(s.groups[0].tramos).toHaveLength(2);
  });

  it('partido → continuo recorta ese grupo a su primer tramo', () => {
    let s: BusinessSchedule = {
      groups: [{ mode: 'partido', dias: [1], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '19:00' }] }],
    };
    s = setGroupMode(s, 0, 'continuo');
    expect(s.groups[0].mode).toBe('continuo');
    expect(s.groups[0].tramos).toEqual([{ inicio: '09:00', fin: '14:00' }]);
  });

  it('GARANTÍA: cambiar el modo de un grupo NO afecta a otro', () => {
    let s: BusinessSchedule = {
      groups: [
        { mode: 'continuo', dias: [1, 2], tramos: [{ inicio: '09:00', fin: '17:00' }] },
        { mode: 'continuo', dias: [6], tramos: [{ inicio: '10:00', fin: '14:00' }] },
      ],
    };
    s = setGroupMode(s, 0, 'partido');
    expect(s.groups[0].mode).toBe('partido');
    expect(s.groups[0].tramos).toHaveLength(2);
    // El segundo grupo queda intacto.
    expect(s.groups[1].mode).toBe('continuo');
    expect(s.groups[1].tramos).toEqual([{ inicio: '10:00', fin: '14:00' }]);
  });

  it('en partido se pueden añadir tramos extra y quitar hasta el mínimo de 2 (por grupo)', () => {
    let s = setGroupMode(addGroup(emptySchedule('continuo')), 0, 'partido');
    s = addGroupTramo(s, 0);
    expect(s.groups[0].tramos).toHaveLength(3);
    s = removeGroupTramo(s, 0, 2);
    expect(s.groups[0].tramos).toHaveLength(2);
    s = removeGroupTramo(s, 0, 1); // por debajo del mínimo del grupo → no-op
    expect(s.groups[0].tramos).toHaveLength(2);
  });

  it('removeGroupTramo usa el mínimo del MODO DEL GRUPO (continuo=1)', () => {
    const s: BusinessSchedule = {
      groups: [{ mode: 'continuo', dias: [1], tramos: [{ inicio: '09:00', fin: '17:00' }] }],
    };
    const next = removeGroupTramo(s, 0, 0); // continuo: mínimo 1 → no-op
    expect(next.groups[0].tramos).toHaveLength(1);
  });
});

describe('setGroupAccepted — aceptar/colapsar (estado de UI, no bloquea aplanado)', () => {
  it('aceptar marca aceptado sin alterar el aplanado a OpeningHour', () => {
    let s = addGroup(emptySchedule()); // grupo L-V continuo
    const before = scheduleToTramos(s);
    s = setGroupAccepted(s, 0, true);
    expect(s.groups[0].aceptado).toBe(true);
    expect(scheduleToTramos(s)).toEqual(before); // aceptar no cambia las filas
    s = setGroupAccepted(s, 0, false);
    expect(s.groups[0].aceptado).toBe(false);
  });
});

describe('grupos — alta, edición y borrado', () => {
  it('el primer grupo se pre-rellena L-V (modo por defecto continuo); los siguientes vacíos', () => {
    let s = addGroup(emptySchedule());
    expect(s.groups[0].dias).toEqual([1, 2, 3, 4, 5]);
    expect(s.groups[0].mode).toBe('continuo');
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

describe('normalizeSchedule — migración de la forma antigua (mode global) → por grupo', () => {
  it('infiere el modo de cada grupo por su nº de tramos (no del mode global)', () => {
    // Forma antigua: mode GLOBAL, grupos SIN campo mode.
    const old = {
      mode: 'partido',
      groups: [
        { dias: [1, 2], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '20:00' }] },
        { dias: [6], tramos: [{ inicio: '10:00', fin: '14:00' }] },
      ],
    } as unknown as BusinessSchedule;
    const norm = normalizeSchedule(old);
    expect(norm.groups[0].mode).toBe('partido'); // 2 tramos
    expect(norm.groups[1].mode).toBe('continuo'); // 1 tramo
    // El mode de nivel superior se conserva como modo por defecto de nuevos grupos.
    expect(norm.mode).toBe('partido');
  });

  it('respeta un mode ya presente por grupo (idempotente) y tolera datos parciales', () => {
    const s: BusinessSchedule = {
      mode: 'continuo',
      groups: [{ mode: 'partido', dias: [1], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '20:00' }] }],
    };
    expect(normalizeSchedule(s)).toEqual(s);
    // Nulo / sin grupos no rompe.
    expect(normalizeSchedule(undefined).groups).toEqual([]);
  });
});

describe('TenantConfig.horario — retrocompatibilidad (deserialize)', () => {
  it('deserialize tolera configs antiguas SIN horario (queda undefined)', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    const raw = JSON.stringify(cfg); // configFromVertical no incluye horario
    const parsed = deserialize(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.horario).toBeUndefined();
    expect(scheduleToTramos(parsed!.horario)).toEqual([]);
  });

  it('deserialize migra un horario de FORMA ANTIGUA (mode global, grupos sin mode)', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    // Guardado a mano en la forma vieja (sin mode por grupo).
    const oldRaw = JSON.stringify({
      ...cfg,
      horario: {
        mode: 'partido',
        groups: [
          { dias: [1, 2], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '20:00' }] },
          { dias: [6], tramos: [{ inicio: '10:00', fin: '14:00' }] },
        ],
      },
    });
    const parsed = deserialize(oldRaw);
    expect(parsed).not.toBeNull();
    expect(parsed!.horario!.groups[0].mode).toBe('partido');
    expect(parsed!.horario!.groups[1].mode).toBe('continuo');
    // L,M partido (2 tramos × 2 días = 4) + S continuo (1 tramo × 1 día = 1) = 5 filas.
    expect(scheduleToTramos(parsed!.horario)).toHaveLength(5);
  });

  it('deserialize conserva el horario de forma NUEVA cuando está presente', () => {
    const cfg = configFromVertical('peluqueria', 'Salón A');
    cfg.horario = {
      mode: 'partido',
      groups: [{ mode: 'partido', dias: [1, 2], tramos: [{ inicio: '09:00', fin: '14:00' }, { inicio: '16:00', fin: '20:00' }] }],
    };
    const parsed = deserialize(JSON.stringify(cfg));
    expect(parsed!.horario).toEqual(cfg.horario);
    expect(scheduleToTramos(parsed!.horario)).toHaveLength(4);
  });
});

describe('scheduleFromTramos — reverso de scheduleToTramos (prefill desde OpeningHour)', () => {
  it('agrupa días con el mismo conjunto de tramos e infiere el modo', () => {
    const tramos: TramoDia[] = [
      { diaSemana: 1, inicio: '09:00', fin: '17:00' },
      { diaSemana: 2, inicio: '09:00', fin: '17:00' },
      { diaSemana: 5, inicio: '09:00', fin: '14:00' },
      { diaSemana: 5, inicio: '16:00', fin: '20:00' },
    ];
    const s = scheduleFromTramos(tramos);
    // Grupo 1: L,M continuo 09-17; Grupo 2: V partido.
    expect(s.groups).toHaveLength(2);
    expect(s.groups[0].dias).toEqual([1, 2]);
    expect(s.groups[0].mode).toBe('continuo');
    expect(s.groups[1].dias).toEqual([5]);
    expect(s.groups[1].mode).toBe('partido');
  });

  it('round-trip: scheduleToTramos(scheduleFromTramos(x)) === x', () => {
    const x: TramoDia[] = [
      { diaSemana: 1, inicio: '09:00', fin: '17:00' },
      { diaSemana: 2, inicio: '09:00', fin: '17:00' },
      { diaSemana: 3, inicio: '09:00', fin: '17:00' },
      { diaSemana: 4, inicio: '09:00', fin: '17:00' },
      { diaSemana: 5, inicio: '09:00', fin: '14:00' },
      { diaSemana: 5, inicio: '16:00', fin: '20:00' },
      { diaSemana: 6, inicio: '10:00', fin: '14:00' },
    ];
    expect(scheduleToTramos(scheduleFromTramos(x))).toEqual(x);
  });

  it('vacío / inválido → horario vacío', () => {
    expect(scheduleFromTramos([]).groups).toEqual([]);
    expect(scheduleFromTramos(undefined).groups).toEqual([]);
    // Día fuera de rango o tramo invertido se descarta.
    expect(scheduleFromTramos([{ diaSemana: 9, inicio: '09:00', fin: '17:00' }]).groups).toEqual([]);
    expect(scheduleFromTramos([{ diaSemana: 1, inicio: '18:00', fin: '09:00' }]).groups).toEqual([]);
  });
});
