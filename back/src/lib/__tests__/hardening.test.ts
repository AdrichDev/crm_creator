// Regression tests for sec-auth hardening fixes H1-H4.
// These tests are designed to fail on the OLD (unfixed) code and pass on the new.
// Runner: node --import tsx --test

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// H1: login rate-limiter must key by ip:email (not only by IP).
//     A single IP can be blocked per-email while other emails on same IP remain free.
// ---------------------------------------------------------------------------
import { consume, resetRateLimits, ipEmailKey } from '../rateLimit.js';

beforeEach(() => resetRateLimits());

test('H1: consume distingue por email aunque la IP sea la misma', () => {
  const now = 2_000_000;
  const windowMs = 60_000;
  const max = 3;

  // Agotamos el límite para ip1:user@a.com.
  for (let i = 0; i < max; i++) {
    assert.ok(consume('login', 'ip1:user@a.com', windowMs, max, now), `intento ${i + 1} debería permitirse`);
  }
  assert.equal(consume('login', 'ip1:user@a.com', windowMs, max, now), false, 'debe bloquear tras agotar');

  // La misma IP con otro email sigue libre (fuerza bruta dirigida a un email no afecta a otros).
  assert.ok(consume('login', 'ip1:other@b.com', windowMs, max, now), 'otro email en misma IP debe estar libre');
});

test('H1: ipEmailKey produce clave ip:email en minúsculas', () => {
  // Verificamos la función pura usando un objeto Request mínimo.
  const fakeReq = {
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    body: { email: 'User@Example.COM' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const key = ipEmailKey(fakeReq);
  assert.equal(key, '10.0.0.1:user@example.com');
});

test('H1: ipEmailKey retrocede a solo-IP si no hay email en body', () => {
  const fakeReq = {
    ip: '10.0.0.2',
    socket: { remoteAddress: '10.0.0.2' },
    body: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const key = ipEmailKey(fakeReq);
  assert.equal(key, '10.0.0.2');
});

// ---------------------------------------------------------------------------
// H2: emit debe bloquearse cuando la URL está configurada pero el secreto vacío.
// ---------------------------------------------------------------------------
import { emit, resetEmitterState } from '../automation/index.js';

beforeEach(() => resetEmitterState());

test('H2: emit bloqueado cuando URL seteada y secreto vacío', async () => {
  // Inyectamos el entorno directamente mockeando las variables de process.env
  // antes de que emit las lea. El módulo lee env en tiempo de ejecución a través
  // del objeto `env`, así que usamos el mecanismo de inyección real de env vars.
  const origUrl = process.env.AUTOMATION_WEBHOOK_URL;
  const origSecret = process.env.AUTOMATION_WEBHOOK_SECRET;

  process.env.AUTOMATION_WEBHOOK_URL = 'https://n8n.example.com/webhook/test';
  process.env.AUTOMATION_WEBHOOK_SECRET = '';

  try {
    // El módulo de env se importó al arrancar; para este test comprobamos la
    // lógica a nivel de `emit` importando el checker directamente sin el mock
    // de env (que ya está fijo en el módulo). En su lugar probamos la función
    // de bloqueo a través del valor de env que el módulo ya cargó.
    // NOTA: dado que env es un objeto estático importado, para testear H2 en
    // unidad necesitamos la función auxiliar que verifica la precondición.
    // La exponemos desde automation/index para este fin.
    const { checkEmitPrecondition } = await import('../automation/index.js');
    const result = checkEmitPrecondition('https://n8n.example.com/webhook/test', '');
    assert.equal(result, 'blocked_no_secret', 'debe bloquear cuando secreto está vacío');
  } finally {
    if (origUrl === undefined) delete process.env.AUTOMATION_WEBHOOK_URL;
    else process.env.AUTOMATION_WEBHOOK_URL = origUrl;
    if (origSecret === undefined) delete process.env.AUTOMATION_WEBHOOK_SECRET;
    else process.env.AUTOMATION_WEBHOOK_SECRET = origSecret;
  }
});

test('H2: emit permitido cuando URL y secreto están ambos configurados', async () => {
  const { checkEmitPrecondition } = await import('../automation/index.js');
  const result = checkEmitPrecondition('https://n8n.example.com/webhook/test', 'my-secret');
  assert.equal(result, 'ok');
});

test('H2: emit skipped (disabled) cuando URL está vacía', async () => {
  const { checkEmitPrecondition } = await import('../automation/index.js');
  const result = checkEmitPrecondition('', 'any-secret');
  assert.equal(result, 'disabled');
});

// ---------------------------------------------------------------------------
// H3: validación de JWT_SECRET al arranque.
// ---------------------------------------------------------------------------
import { validateJwtSecret } from '../../env.js';

test('H3: lanza en producción con JWT_SECRET por defecto', () => {
  assert.throws(
    () => validateJwtSecret('dev-secret-change-me', 'production'),
    /JWT_SECRET/,
    'debe lanzar con el secreto por defecto en producción',
  );
});

test('H3: lanza en producción con JWT_SECRET vacío', () => {
  assert.throws(
    () => validateJwtSecret('', 'production'),
    /JWT_SECRET/,
  );
});

test('H3: no lanza en producción con secreto real', () => {
  assert.doesNotThrow(() => validateJwtSecret('super-secret-real-key-32chars!!', 'production'));
});

test('H3: no lanza en desarrollo con secreto por defecto (solo warning)', () => {
  assert.doesNotThrow(() => validateJwtSecret('dev-secret-change-me', 'development'));
});

// ---------------------------------------------------------------------------
// H4: register rechaza contraseñas menores de 8 caracteres.
//     Validado a través de validatePassword (misma función usada en los demás endpoints).
// ---------------------------------------------------------------------------
import { validatePassword } from '../password.js';

test('H4: validatePassword rechaza password de 7 chars (como en register)', () => {
  const result = validatePassword('1234567');
  assert.equal(result, 'too_short', 'contraseña de 7 chars debe devolver too_short');
});

test('H4: validatePassword acepta password de 8 chars exactos', () => {
  const result = validatePassword('12345678');
  assert.equal(result, null, '8 chars debe pasar la política');
});
