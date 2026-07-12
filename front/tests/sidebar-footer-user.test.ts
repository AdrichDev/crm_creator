import { describe, it, expect } from 'vitest';
import { resolveFooterUser } from '@/components/layout/sidebar';

// Identidad del pie del sidebar: NUNCA suplantar con el usuario demo si hay sesión real.
const demo = { nombre: 'Sara Molina', iniciales: 'SM', rolLabel: 'Empleada', email: 'sara@negocio.com' };
const real = { nombre: 'Comercial Demo', iniciales: 'CD', rolLabel: 'Administrador', email: 'achozas9@gmail.com' };
const session = { id: 'sub-1', email: 'achozas9@gmail.com' };

describe('resolveFooterUser', () => {
  it('realUser gana siempre (identidad + rol reales), incluso sin API', () => {
    expect(resolveFooterUser(real, session, false, demo)).toEqual(real);
    expect(resolveFooterUser(real, null, true, demo)).toEqual(real);
  });

  it('con sesión real pero sin realUser (API caída/off): muestra el email real, NO el demo', () => {
    const r = resolveFooterUser(null, session, false, demo);
    expect(r.email).toBe('achozas9@gmail.com');
    expect(r.nombre).toBe('achozas9@gmail.com');
    expect(r.rolLabel).toBe(''); // sin rol falso
    expect(r.nombre).not.toBe('Sara Molina');
  });

  it('sin sesión y con API: "Invitado", nunca demo', () => {
    expect(resolveFooterUser(null, null, true, demo).nombre).toBe('Invitado');
  });

  it('sin sesión y sin API: usuario demo (showcase legítimo)', () => {
    expect(resolveFooterUser(null, null, false, demo)).toEqual(demo);
  });
});
