// Unit test del store de bloqueo acotado por negocio (crm-tenant-block-scoping, tarea 2.3).
// Verifica que blocked-state.ts lleva { variant, businessId } (no un flag global) y que
// reconcileTenantBlock limpia el bloqueo cuando el negocio activo cambia a otro distinto.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setTenantBlocked,
  getTenantBlocked,
  reconcileTenantBlock,
  subscribeTenantBlocked,
} from '@/lib/tenant/blocked-state';

beforeEach(() => {
  setTenantBlocked(null); // reset del store singleton entre casos
});

describe('store de bloqueo con alcance de negocio', () => {
  it('set + get roundtrip con businessId', () => {
    setTenantBlocked({ variant: 'suspended', businessId: 'biz-A' });
    expect(getTenantBlocked()).toEqual({ variant: 'suspended', businessId: 'biz-A' });
  });

  it('reconcileTenantBlock limpia el bloqueo de OTRO negocio', () => {
    setTenantBlocked({ variant: 'suspended', businessId: 'biz-A' });
    reconcileTenantBlock('biz-B');
    expect(getTenantBlocked()).toBeNull();
  });

  it('reconcileTenantBlock conserva el bloqueo del MISMO negocio', () => {
    setTenantBlocked({ variant: 'terminated', businessId: 'biz-A' });
    reconcileTenantBlock('biz-A');
    expect(getTenantBlocked()).toEqual({ variant: 'terminated', businessId: 'biz-A' });
  });

  it('notifica a los suscriptores al fijar y al reconciliar', () => {
    const spy = vi.fn();
    const unsub = subscribeTenantBlocked(spy);
    setTenantBlocked({ variant: 'suspended', businessId: 'biz-A' });
    reconcileTenantBlock('biz-B');
    expect(spy).toHaveBeenNthCalledWith(1, { variant: 'suspended', businessId: 'biz-A' });
    expect(spy).toHaveBeenNthCalledWith(2, null);
    unsub();
  });
});
