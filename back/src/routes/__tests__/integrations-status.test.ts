// Tests del estado de integraciones OAuth (GET /integrations).
// Runner: node --import tsx --test. Dos capas, sin BD:
//   1. buildIntegrationsStatus (pura): proyección filas → contrato de la UI.
//   2. Gate HTTP: GET / sin sesión → 401 (mismo patrón que integrations-admin.test.ts;
//      el middleware authenticate rechaza antes de cualquier consulta Prisma).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { integrationsRouter, buildIntegrationsStatus } from '../integrations.js';

describe('buildIntegrationsStatus — proyección al contrato de la UI', () => {
  const NOW = new Date('2026-07-05T10:00:00Z');

  test('sin filas → una entrada por servicio OAuth con estado null (nunca conectada)', () => {
    const items = buildIntegrationsStatus([]);
    assert.deepEqual(items, [
      { servicio: 'gmail', estado: null },
      { servicio: 'calendar', estado: null },
    ]);
  });

  test('credencial conectada → estado, connectedAt ISO y scopes concedidos', () => {
    const items = buildIntegrationsStatus([
      {
        servicio: 'calendar',
        estado: 'connected',
        updatedAt: NOW,
        scopesOauth: ['https://www.googleapis.com/auth/calendar.events'],
      },
    ]);
    const calendar = items.find((i) => i.servicio === 'calendar');
    assert.deepEqual(calendar, {
      servicio: 'calendar',
      estado: 'connected',
      connectedAt: NOW.toISOString(),
      scopesOauth: ['https://www.googleapis.com/auth/calendar.events'],
    });
    // gmail sigue sin conectar
    assert.equal(items.find((i) => i.servicio === 'gmail')?.estado, null);
  });

  test('estados reauth_required y revoked pasan tal cual', () => {
    const items = buildIntegrationsStatus([
      { servicio: 'calendar', estado: 'reauth_required', updatedAt: NOW, scopesOauth: [] },
      { servicio: 'gmail', estado: 'revoked', updatedAt: NOW, scopesOauth: [] },
    ]);
    assert.equal(items.find((i) => i.servicio === 'calendar')?.estado, 'reauth_required');
    assert.equal(items.find((i) => i.servicio === 'gmail')?.estado, 'revoked');
  });

  test('nunca expone tokens: solo servicio/estado/connectedAt/scopesOauth', () => {
    const items = buildIntegrationsStatus([
      { servicio: 'calendar', estado: 'connected', updatedAt: NOW, scopesOauth: [] },
    ]);
    for (const item of items) {
      assert.deepEqual(
        Object.keys(item).sort(),
        item.estado === null
          ? ['estado', 'servicio']
          : ['connectedAt', 'estado', 'scopesOauth', 'servicio'],
      );
    }
  });
});

describe('GET /integrations — gate de sesión', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/integrations', integrationsRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('sin sesión → 401 del middleware authenticate, antes de tocar la BD', async () => {
    const res = await fetch(`${base}/integrations`);
    assert.equal(res.status, 401);
  });
});
