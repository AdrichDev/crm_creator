// Unit test de wiring del bootstrap de sesión GET /auth/me.
// Runner: node --import tsx --test
//
// Historia: crm-tenant-lifecycle-gate (WU3.1) montaba aquí el gate DURO (loginTenantGate,
// 423/410 sin sesión). crm-tenant-block-scoping lo reemplazó por `meLifecycleGate`
// (resolveMeLifecycle): la identidad SIEMPRE responde 200 y el handler degrada `business`
// a null cuando el lifecycle efectivo no es ACTIVE/GRACE.
//
// Este archivo conserva la aserción de WIRING (el intent original sigue vigente): el
// resolutor de lifecycle corre DESPUÉS de `authenticate` (negocio ya identificado) y
// ANTES del handler que sirve la sesión. El comportamiento:
//   - degradación de /me (200 + business:null + lifecycle) → auth-me-degraded.test.ts
//   - gate duro 423/410 de rutas de datos → middleware/__tests__/tenant-gate.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { authenticate } from '../../middleware/auth.js';
import { authRouter, meLifecycleGate } from '../auth.js';

describe('wiring de GET /auth/me — authenticate → meLifecycleGate → handler', () => {
  test('/me monta authenticate → meLifecycleGate → handler (lifecycle tras identificar negocio, antes de la sesión)', () => {
    const stack = (authRouter as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }> }).stack;
    const meLayer = stack.find((l) => l.route?.path === '/me');
    assert.ok(meLayer?.route, 'debe existir el route GET /me en authRouter');

    const handlers = meLayer.route.stack.map((l) => l.handle);
    const idxAuth = handlers.indexOf(authenticate);
    const idxLifecycle = handlers.indexOf(meLifecycleGate);
    assert.ok(idxAuth >= 0, 'authenticate debe estar montado en /me');
    assert.ok(idxLifecycle >= 0, 'meLifecycleGate debe estar montado en /me');
    assert.ok(idxAuth < idxLifecycle, 'el resolutor debe ir DESPUÉS de authenticate (negocio ya identificado)');
    assert.ok(idxLifecycle < handlers.length - 1, 'el resolutor debe ir ANTES del handler que sirve la sesión');
  });
});
