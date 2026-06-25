// Tests — crm-cliente-solo-mi-cuenta
// Verifica que el rol cliente queda excluido de configuracion y tiene acceso
// a mi-cuenta; también comprueba que admin y trabajador no pierden acceso.
import { describe, it, expect } from 'vitest';
import { moduleAllowedForRole, canWrite, moduleFromPath } from '@/lib/config/roles';

// ─── AC1: cliente NO ve configuracion ────────────────────────────────────────
describe('cliente — acceso a configuracion', () => {
  it('moduleAllowedForRole("cliente","configuracion") === false', () => {
    expect(moduleAllowedForRole('cliente', 'configuracion')).toBe(false);
  });

  it('canWrite("cliente","configuracion") === false', () => {
    expect(canWrite('cliente', 'configuracion')).toBe(false);
  });
});

// ─── AC2: cliente SÍ ve mi-cuenta y puede escribir ───────────────────────────
describe('cliente — acceso a mi-cuenta', () => {
  it('moduleAllowedForRole("cliente","mi-cuenta") === true', () => {
    expect(moduleAllowedForRole('cliente', 'mi-cuenta')).toBe(true);
  });

  it('canWrite("cliente","mi-cuenta") === true (editar perfil/contraseña)', () => {
    expect(canWrite('cliente', 'mi-cuenta')).toBe(true);
  });
});

// ─── Regresión: admin no pierde acceso ───────────────────────────────────────
describe('admin — sin cambios de acceso', () => {
  it('admin sigue teniendo acceso a configuracion', () => {
    expect(moduleAllowedForRole('admin', 'configuracion')).toBe(true);
  });

  it('admin puede escribir en configuracion', () => {
    expect(canWrite('admin', 'configuracion')).toBe(true);
  });

  it('admin también puede acceder a mi-cuenta', () => {
    expect(moduleAllowedForRole('admin', 'mi-cuenta')).toBe(true);
  });
});

// ─── Regresión: trabajador no pierde acceso ──────────────────────────────────
describe('trabajador — sin cambios de acceso', () => {
  it('trabajador sigue teniendo acceso a citas', () => {
    expect(moduleAllowedForRole('trabajador', 'citas')).toBe(true);
  });

  it('trabajador NO tiene acceso a configuracion (igual que antes)', () => {
    expect(moduleAllowedForRole('trabajador', 'configuracion')).toBe(false);
  });

  it('trabajador tiene acceso a mi-cuenta', () => {
    expect(moduleAllowedForRole('trabajador', 'mi-cuenta')).toBe(true);
  });
});

// ─── moduleFromPath — resolución de rutas ────────────────────────────────────
describe('moduleFromPath', () => {
  it('/configuracion → "configuracion"', () => {
    expect(moduleFromPath('/configuracion')).toBe('configuracion');
  });

  it('/configuracion/branding → "configuracion"', () => {
    expect(moduleFromPath('/configuracion/branding')).toBe('configuracion');
  });

  it('/cuenta → "mi-cuenta"', () => {
    expect(moduleFromPath('/cuenta')).toBe('mi-cuenta');
  });

  it('/panel → "dashboard"', () => {
    expect(moduleFromPath('/panel')).toBe('dashboard');
  });

  it('ruta desconocida → null', () => {
    expect(moduleFromPath('/ruta-inexistente')).toBeNull();
  });
});

// ─── AC3 (guard): cliente en /configuracion → módulo no permitido ─────────────
// El guard vive en sidebar.tsx (useEffect + router.replace). Aquí verificamos
// la lógica subyacente que el guard consume:
describe('guard de ruta — lógica subyacente (AC3)', () => {
  it('cliente + /configuracion → moduleFromPath devuelve "configuracion" y moduleAllowedForRole es false → debe redirigir', () => {
    const role = 'cliente' as const;
    const pathname = '/configuracion';
    const moduleId = moduleFromPath(pathname);
    expect(moduleId).toBe('configuracion');
    expect(moduleAllowedForRole(role, moduleId!)).toBe(false);
  });

  it('cliente + /cuenta → moduleFromPath devuelve "mi-cuenta" y moduleAllowedForRole es true → no redirige', () => {
    const role = 'cliente' as const;
    const pathname = '/cuenta';
    const moduleId = moduleFromPath(pathname);
    expect(moduleId).toBe('mi-cuenta');
    expect(moduleAllowedForRole(role, moduleId!)).toBe(true);
  });

  it('admin + /configuracion → moduleAllowedForRole es true → no redirige', () => {
    const role = 'admin' as const;
    const pathname = '/configuracion';
    const moduleId = moduleFromPath(pathname);
    expect(moduleId).toBe('configuracion');
    expect(moduleAllowedForRole(role, moduleId!)).toBe(true);
  });
});
