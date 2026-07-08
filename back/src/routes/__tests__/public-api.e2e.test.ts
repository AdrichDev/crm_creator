import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../prisma.js';
import {
  api, probeBack, resetRateLimits, getSharedAuth, cleanup, SUPABASE_LIVE, uniq
} from './_shared.e2e.js';

let backUp = false;

before(async () => { backUp = await probeBack(); if (!backUp) console.warn('[e2e] back no responde — tests saltados'); });
beforeEach(async () => { if (backUp) await resetRateLimits('register'); });
after(async () => { await cleanup(backUp); });

test('POST /public/leads - crea un lead correctamente', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await getSharedAuth(t);
  if (!auth) return;
  const { businessId } = auth;

  const res = await api('/public/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessId,
      nombre: 'Lead de Prueba',
      email: 'lead@ejemplo.com',
      telefono: '600123456',
      peticion: 'Quiero información'
    })
  });

  assert.equal(res.status, 201, `Expected 201 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body?.id);
  
  const contact = await prisma.contacto.findUnique({ where: { id: String(res.body?.id) } });
  assert.ok(contact);
  assert.equal(contact.tipo, 'lead');
});

test('POST /public/leads - requiere businessId', async (t) => {
  if (!backUp) return t.skip('back down');

  const res = await api('/public/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Incompleto' })
  });
  
  assert.equal(res.status, 422);
});

test('GET /public/availability - obtiene huecos libres', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await getSharedAuth(t);
  if (!auth) return;
  const { businessId } = auth;

  // Creamos location y service para la prueba
  const location = await prisma.location.create({ data: { businessId, nombre: `Loc-${uniq()}` } });
  const service = await prisma.service.create({ data: { businessId, nombre: `Svc-${uniq()}`, duracion: 30 } });

  const today = new Date().toISOString().split('T')[0];
  const url = `/public/availability?businessId=${businessId}&date=${today}&serviceId=${service.id}&locationId=${location.id}`;
  
  const res = await api(url, { method: 'GET' });

  assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(Array.isArray(res.body));
});

test('POST /public/bookings - crea una reserva (upsert cliente)', async (t) => {
  if (!backUp) return t.skip('back down');
  if (!SUPABASE_LIVE) return t.skip('SUPABASE_SERVICE_ROLE_KEY is placeholder');

  const auth = await getSharedAuth(t);
  if (!auth) return;
  const { businessId } = auth;

  const location = await prisma.location.create({ data: { businessId, nombre: `LocB-${uniq()}` } });
  const service = await prisma.service.create({ data: { businessId, nombre: `SvcB-${uniq()}`, duracion: 30 } });
  
  // start debe ser UTC ISO
  const start = new Date(Date.now() + 86400000 * 2).toISOString(); 

  const res = await api('/public/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessId,
      locationId: location.id,
      serviceId: service.id,
      start,
      notes: 'Reserva desde web pública',
      customer: {
        nombre: 'Cliente Público Nuevo',
        email: `cliente-${uniq()}@ejemplo.com`
      }
    })
  });
    
  assert.ok([201, 409].includes(res.status), `Expected 201 or 409 but got ${res.status}: ${JSON.stringify(res.body)}`);
});
