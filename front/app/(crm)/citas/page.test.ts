import { describe, it, expect } from 'vitest';
import { estadoTone, tone, diaSemanaLabel, extractCanal, metaFields } from '@/components/agenda/shared';

describe('WU1: Agenda visual - helpers', () => {
  it('estadoTone retorna color correcto por estado', () => {
    expect(estadoTone('Completada')).toBe('#6aa8ff');
    expect(estadoTone('Cancelada')).toBe('#ff4757');
    expect(estadoTone('Pendiente')).toBe('var(--acc)');
  });

  it('tone retorna badge tone correcto por estado', () => {
    expect(tone('Confirmada')).toBe('green');
    expect(tone('Pendiente')).toBe('amber');
    expect(tone('Completada')).toBe('blue');
    expect(tone('Cancelada')).toBe('red');
  });

  it('diaSemanaLabel retorna día en español desde fecha YYYY-MM-DD', () => {
    // 2026-07-05 es un domingo
    expect(diaSemanaLabel('2026-07-05')).toBe('Domingo');
  });

  it('extractCanal extrae valor desde "Canal: valor" en notes', () => {
    expect(extractCanal('Canal: Videollamada')).toBe('Videollamada');
    // Formato canónico multi-campo: Canal vive en su propio segmento (` | `).
    expect(extractCanal('Acción: Reunión | Canal: Zoom más texto')).toBe('Zoom más texto');
    // "Canal:" a mitad de un segmento que NO empieza por esa etiqueta ya NO se extrae:
    // el parser está anclado al inicio de segmento para no mal-leer texto libre de Acción.
    expect(extractCanal('Algo Canal: Zoom más texto')).toBe('—');
    expect(extractCanal('Sin canal')).toBe('—');
    expect(extractCanal(null)).toBe('—');
  });

  it('metaFields retorna metadatos según sector', () => {
    const cita = {
      recurso: 'Campo A',
      fecha: '2026-07-05',
      empleado: 'Juan',
      aforo: 20,
      notes: 'algo',
      servicio: 'Corte',
    };

    const entrenamiento = { formComponent: 'entrenamiento' };
    const fields = metaFields(cita, entrenamiento as any);
    expect(fields).toContainEqual(['Campo', 'Campo A']);
    expect(fields).toContainEqual(['Entrenador', 'Juan']);

    const sinSector = metaFields(cita);
    expect(sinSector).toContainEqual(['Servicio', 'Corte']);
    expect(sinSector).toContainEqual(['Profesional', 'Juan']);
  });
});
