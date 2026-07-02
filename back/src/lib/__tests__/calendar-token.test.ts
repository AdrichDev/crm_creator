// Unit tests para calendarToken.ts (WU1.2).
// Runner: node --import tsx --test
// Estrategia: repo en memoria (implementa CalendarTokenRepo) — sin DB real, igual
// que reminderDrainer.test.ts usa DrainerDeps inyectado.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRawToken,
  hashToken,
  generateOrRegenerateToken,
  revokeCalendarToken,
  resolveTokenOwner,
  getCalendarTokenStatus,
} from '../calendarToken.js';
import type { CalendarTokenRepo, CalendarTokenRow } from '../calendarToken.js';

/** Repo en memoria: 1 fila por userId, simula la tabla token_calendario. */
function makeMemoryRepo() {
  const rows = new Map<string, CalendarTokenRow>(); // key: userId

  const repo: CalendarTokenRepo = {
    async findByUserId(userId) {
      return rows.get(userId) ?? null;
    },
    async upsert(userId, tokenHash) {
      rows.set(userId, { tokenHash, revokedAt: null });
    },
    async revoke(userId, now) {
      const row = rows.get(userId);
      if (row) rows.set(userId, { ...row, revokedAt: now });
    },
    async findActiveOwnerByHash(tokenHash) {
      for (const [userId, row] of rows) {
        if (row.tokenHash === tokenHash && row.revokedAt === null) return { userId };
      }
      return null;
    },
  };
  return { repo, rows };
}

describe('generateRawToken / hashToken', () => {
  test('genera 32+ bytes de entropía (64 hex chars)', () => {
    const raw = generateRawToken();
    assert.equal(raw.length, 64); // 32 bytes -> 64 hex chars
    assert.match(raw, /^[0-9a-f]{64}$/);
  });

  test('dos tokens generados son distintos (aleatoriedad)', () => {
    assert.notEqual(generateRawToken(), generateRawToken());
  });

  test('hashToken es determinista y NUNCA igual al token en claro', () => {
    const raw = 'token-de-prueba';
    const h1 = hashToken(raw);
    const h2 = hashToken(raw);
    assert.equal(h1, h2);
    assert.notEqual(h1, raw);
    assert.match(h1, /^[0-9a-f]{64}$/); // sha256 hex
  });
});

describe('generateOrRegenerateToken — usuario sin token', () => {
  test('genera token nuevo, regenerated=false, y persiste solo el hash', async () => {
    const { repo, rows } = makeMemoryRepo();
    const result = await generateOrRegenerateToken(repo, 'user-1');

    assert.equal(result.regenerated, false);
    assert.equal(result.token.length, 64);

    const row = rows.get('user-1');
    assert.ok(row);
    assert.notEqual(row!.tokenHash, result.token); // nunca se guarda en claro
    assert.equal(row!.tokenHash, hashToken(result.token));
    assert.equal(row!.revokedAt, null);
  });
});

describe('generateOrRegenerateToken — regenerar invalida el anterior', () => {
  test('el token viejo deja de resolver tras regenerar (AC2)', async () => {
    const { repo } = makeMemoryRepo();
    const first = await generateOrRegenerateToken(repo, 'user-1');
    const owner1 = await resolveTokenOwner(repo, first.token);
    assert.equal(owner1, 'user-1');

    const second = await generateOrRegenerateToken(repo, 'user-1');
    assert.equal(second.regenerated, true);
    assert.notEqual(second.token, first.token);

    // El token viejo ya no resuelve a nadie.
    assert.equal(await resolveTokenOwner(repo, first.token), null);
    // El nuevo sí.
    assert.equal(await resolveTokenOwner(repo, second.token), 'user-1');
  });
});

describe('revokeCalendarToken — feed muere al instante', () => {
  test('tras revocar, resolveTokenOwner devuelve null (AC2)', async () => {
    const { repo } = makeMemoryRepo();
    const { token } = await generateOrRegenerateToken(repo, 'user-1');
    assert.equal(await resolveTokenOwner(repo, token), 'user-1');

    await revokeCalendarToken(repo, 'user-1');
    assert.equal(await resolveTokenOwner(repo, token), null);
  });

  test('revocar sin token previo es no-op (idempotente)', async () => {
    const { repo } = makeMemoryRepo();
    await assert.doesNotReject(() => revokeCalendarToken(repo, 'user-sin-token'));
  });
});

describe('resolveTokenOwner — 404 opaco (AC2)', () => {
  test('token inexistente devuelve null', async () => {
    const { repo } = makeMemoryRepo();
    assert.equal(await resolveTokenOwner(repo, 'nunca-existio'), null);
  });

  test('token vacío devuelve null sin tocar el repo', async () => {
    const { repo } = makeMemoryRepo();
    assert.equal(await resolveTokenOwner(repo, ''), null);
  });
});

describe('getCalendarTokenStatus', () => {
  test('sin token → hasToken false', async () => {
    const { repo } = makeMemoryRepo();
    assert.deepEqual(await getCalendarTokenStatus(repo, 'user-1'), { hasToken: false });
  });

  test('con token activo → hasToken true', async () => {
    const { repo } = makeMemoryRepo();
    await generateOrRegenerateToken(repo, 'user-1');
    assert.deepEqual(await getCalendarTokenStatus(repo, 'user-1'), { hasToken: true });
  });

  test('con token revocado → hasToken false', async () => {
    const { repo } = makeMemoryRepo();
    await generateOrRegenerateToken(repo, 'user-1');
    await revokeCalendarToken(repo, 'user-1');
    assert.deepEqual(await getCalendarTokenStatus(repo, 'user-1'), { hasToken: false });
  });
});

describe('aislamiento por usuario', () => {
  test('el token de un usuario no resuelve para otro', async () => {
    const { repo } = makeMemoryRepo();
    const a = await generateOrRegenerateToken(repo, 'user-a');
    const b = await generateOrRegenerateToken(repo, 'user-b');
    assert.equal(await resolveTokenOwner(repo, a.token), 'user-a');
    assert.equal(await resolveTokenOwner(repo, b.token), 'user-b');
  });
});
