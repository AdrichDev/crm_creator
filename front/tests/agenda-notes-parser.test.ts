import { describe, it, expect } from 'vitest';
import { extractCanal, extractAccion, metaFields } from '@/components/agenda/shared';
import { buildCitaNotes } from '@/components/crm/nueva-cita-modal';

// crm-operaos-agenda-contactos-fichaje-telegram (sub-item): el parser de notes de agenda
// debe extraer Acción y Canal del formato canónico `Acción: X | Canal: Y`, tolerando
// notas con sólo uno de los dos campos o ninguno (incl. legacy `Canal: X`).

describe('parser de notes (Acción / Canal)', () => {
  it('acción + canal → extrae ambos', () => {
    const notes = 'Acción: Visita comercial | Canal: Presencial';
    expect(extractAccion(notes)).toBe('Visita comercial');
    expect(extractCanal(notes)).toBe('Presencial');
  });

  it('sólo canal (legacy) → canal ok, acción "—"', () => {
    expect(extractCanal('Canal: Videollamada')).toBe('Videollamada');
    expect(extractAccion('Canal: Videollamada')).toBe('—');
  });

  it('sólo acción → acción ok, canal "—"', () => {
    expect(extractAccion('Acción: Prospección')).toBe('Prospección');
    expect(extractCanal('Acción: Prospección')).toBe('—');
  });

  it('ninguno → ambos "—"', () => {
    expect(extractAccion('Sin datos')).toBe('—');
    expect(extractCanal('Sin datos')).toBe('—');
    expect(extractAccion(null)).toBe('—');
    expect(extractCanal(undefined)).toBe('—');
  });

  it('canal con "Llamada"', () => {
    expect(extractCanal('Acción: Llamada de seguimiento | Canal: Llamada')).toBe('Llamada');
    expect(extractAccion('Acción: Llamada de seguimiento | Canal: Llamada')).toBe('Llamada de seguimiento');
  });

  it('acción de texto libre que contiene "Canal:" NO se mal-parsea como canal', () => {
    // El parser está anclado al inicio de segmento: "Canal:" dentro del texto de la acción
    // no debe leerse como el campo Canal.
    const notes = 'Acción: Confirmar Canal: web';
    expect(extractAccion(notes)).toBe('Confirmar Canal: web');
    expect(extractCanal(notes)).toBe('—');
  });

  it('acción de texto libre con "|" se sanea al construir y hace round-trip', () => {
    // buildCitaNotes colapsa cualquier `|` del texto libre para no romper el split por ` | `.
    const notes = buildCitaNotes('Confirmar | urgente', 'Llamada');
    expect(notes).toBe('Acción: Confirmar / urgente | Canal: Llamada');
    expect(extractAccion(notes)).toBe('Confirmar / urgente');
    expect(extractCanal(notes)).toBe('Llamada');
  });

  it('metaFields (reunion) expone Acción y Canal', () => {
    const cita = { fecha: '2026-07-06', empleado: 'Comercial Demo', notes: 'Acción: Reunión | Canal: Videollamada' };
    const fields = metaFields(cita, { formComponent: 'reunion' } as never);
    expect(fields).toContainEqual(['Acción', 'Reunión']);
    expect(fields).toContainEqual(['Canal', 'Videollamada']);
  });
});
