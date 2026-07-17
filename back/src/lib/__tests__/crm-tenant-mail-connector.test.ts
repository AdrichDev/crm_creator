// Unit tests de crm-tenant-oauth-creds-and-mail-connector (Fase 2): conector IMAP/SMTP
// per-tenant para buzones fuera de Google/Microsoft. Runner: node --import tsx --test
//
// Cubre:
//   T2.1 — catálogo: los 6 slots de correo + defaults de puerto (IMAP 993, SMTP 465).
//   T2.2 — mail-connector.ts: sendViaTenantSmtp usa creds del tenant; readTenantInbox
//          parsea mensajes; testMailConnection prueba IMAP+SMTP; sin config → error
//          claro (MailNotConfiguredError); timeout no cuelga (mock que nunca resuelve).
//   T2.3 — notify.ts: cadena Gmail → SMTP tenant → SMTP central; regresión sin MAIL_*.
//   T2.4 — provider-test.ts 'mail' (JSON-encoded value); autocompletar por dominio
//          (front, función pura importada desde el componente).

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { TENANT_SECRET_CATALOG } from '../tenant-secrets/catalog.js';
import { encryptSecret } from '../tenant-secrets/crypto.js';
import type { TenantSecretDb } from '../tenant-secrets/store.js';
import {
  resolveMailConfig,
  sendViaTenantSmtp,
  readTenantInbox,
  testMailConnection,
  MailNotConfiguredError,
  DEFAULT_IMAP_PORT,
  DEFAULT_SMTP_PORT,
  type MailConnectorDeps,
  type MinimalImapClient,
  type MinimalMailTransporter,
} from '../mail-connector.js';
import { testProviderConnection, type ProviderTestDeps } from '../tenant-secrets/provider-test.js';

before(() => {
  process.env.SECRETS_MASTER_KEY ??= randomBytes(32).toString('hex');
});

// ── Dobles ────────────────────────────────────────────────────────────────────

/** TenantSecretDb en memoria: devuelve una fila cifrada por cada nombre de `secrets`. */
function fakeSecretDb(secrets: Record<string, string> = {}): TenantSecretDb {
  return {
    tenantSecret: {
      async findUnique(args) {
        const name = args.where.businessId_name.name;
        const value = secrets[name];
        if (value === undefined) return null;
        const enc = encryptSecret(value);
        return {
          name,
          scope: 'BACKEND_SECRET',
          valueCiphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
          keyVersion: enc.keyVersion,
        };
      },
      async findMany() {
        return [];
      },
    },
  };
}

const FULL_MAIL_SECRETS = {
  MAIL_ADDRESS: 'negocio@midominio.com',
  MAIL_APP_PASSWORD: 'app-pass-secreta',
  IMAP_HOST: 'imap.midominio.com',
  IMAP_PORT: '993',
  SMTP_HOST: 'smtp.midominio.com',
  SMTP_PORT: '465',
};

describe('T2.1 — catálogo: slots de correo', () => {
  test('los 6 slots existen, BACKEND_SECRET, provider/group "mail", sin envVarName', () => {
    const names = ['MAIL_ADDRESS', 'MAIL_APP_PASSWORD', 'IMAP_HOST', 'IMAP_PORT', 'SMTP_HOST', 'SMTP_PORT'];
    for (const name of names) {
      const slot = TENANT_SECRET_CATALOG.find((s) => s.name === name);
      assert.ok(slot, `${name} debe existir`);
      assert.equal(slot?.scope, 'BACKEND_SECRET');
      assert.equal(slot?.provider, 'mail');
      assert.equal(slot?.group, 'mail');
      assert.equal(slot?.envVarName, undefined);
    }
  });

  test('defaults de puerto: IMAP 993, SMTP 465', () => {
    assert.equal(DEFAULT_IMAP_PORT, 993);
    assert.equal(DEFAULT_SMTP_PORT, 465);
  });
});

describe('T2.2 — resolveMailConfig', () => {
  test('sin MAIL_ADDRESS/MAIL_APP_PASSWORD → null (tenant no configuró correo propio)', async () => {
    const db = fakeSecretDb({});
    assert.equal(await resolveMailConfig('biz-1', db), null);
  });

  test('con los 6 valores → resuelve tal cual', async () => {
    const db = fakeSecretDb(FULL_MAIL_SECRETS);
    const cfg = await resolveMailConfig('biz-1', db);
    assert.deepEqual(cfg, {
      address: 'negocio@midominio.com',
      appPassword: 'app-pass-secreta',
      imapHost: 'imap.midominio.com',
      imapPort: 993,
      smtpHost: 'smtp.midominio.com',
      smtpPort: 465,
    });
  });

  test('puertos vacíos/ausentes → defaults sanos (993/465)', async () => {
    const db = fakeSecretDb({ MAIL_ADDRESS: 'a@b.com', MAIL_APP_PASSWORD: 'x', IMAP_HOST: 'imap.b.com', SMTP_HOST: 'smtp.b.com' });
    const cfg = await resolveMailConfig('biz-1', db);
    assert.equal(cfg?.imapPort, DEFAULT_IMAP_PORT);
    assert.equal(cfg?.smtpPort, DEFAULT_SMTP_PORT);
  });
});

describe('T2.2 — sendViaTenantSmtp', () => {
  test('usa las credenciales del tenant (host/puerto/auth) y envía', async () => {
    const calls: unknown[] = [];
    const deps: MailConnectorDeps = {
      resolveConfig: async () => ({
        address: 'negocio@midominio.com',
        appPassword: 'secreta',
        imapHost: 'imap.midominio.com',
        imapPort: 993,
        smtpHost: 'smtp.midominio.com',
        smtpPort: 465,
      }),
      createTransport: (opts) => {
        calls.push(opts);
        const transporter: MinimalMailTransporter = {
          sendMail: async (msg) => { calls.push(msg); return { ok: true }; },
          verify: async () => true,
        };
        return transporter;
      },
      createImapClient: () => { throw new Error('no debería usarse en un send'); },
    };

    await sendViaTenantSmtp('biz-1', { to: 'cliente@x.com', subject: 'Hola', html: '<p>hi</p>' }, deps);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { host: 'smtp.midominio.com', port: 465, secure: true, auth: { user: 'negocio@midominio.com', pass: 'secreta' } });
    assert.deepEqual(calls[1], { from: 'negocio@midominio.com', to: 'cliente@x.com', subject: 'Hola', html: '<p>hi</p>' });
  });

  test('sin config del tenant → MailNotConfiguredError', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => null,
      createTransport: () => { throw new Error('no debería crearse transporte'); },
      createImapClient: () => { throw new Error('no debería usarse'); },
    };
    await assert.rejects(
      () => sendViaTenantSmtp('biz-1', { to: 'x@y.com', subject: 's', html: 'h' }, deps),
      MailNotConfiguredError,
    );
  });

  test('sin SMTP_HOST configurado → MailNotConfiguredError (aunque haya address/password)', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => ({ address: 'a@b.com', appPassword: 'x', imapHost: null, imapPort: 993, smtpHost: null, smtpPort: 465 }),
      createTransport: () => { throw new Error('no debería crearse transporte'); },
      createImapClient: () => { throw new Error('no debería usarse'); },
    };
    await assert.rejects(
      () => sendViaTenantSmtp('biz-1', { to: 'x@y.com', subject: 's', html: 'h' }, deps),
      MailNotConfiguredError,
    );
  });
});

describe('T2.2 — readTenantInbox', () => {
  function fakeImapClient(messages: Array<{ uid: number; subject: string; from: string; date: Date; source: string }>): MinimalImapClient {
    let locked = false;
    return {
      connect: async () => {},
      getMailboxLock: async (path) => {
        assert.equal(path, 'INBOX');
        locked = true;
        return { path, release: () => { locked = false; } };
      },
      get mailbox() {
        return locked ? { exists: messages.length } : false;
      },
      async *fetch() {
        for (const m of messages) {
          yield {
            uid: m.uid,
            envelope: { subject: m.subject, from: [{ address: m.from }], date: m.date },
            source: Buffer.from(m.source, 'utf-8'),
          };
        }
      },
      logout: async () => {},
      close: () => {},
    };
  }

  test('parsea los mensajes del INBOX (asunto, remitente, fecha, cuerpo)', async () => {
    const now = new Date('2026-07-17T10:00:00Z');
    const deps: MailConnectorDeps = {
      resolveConfig: async () => ({ address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', imapPort: 993, smtpHost: null, smtpPort: 465 }),
      createTransport: () => { throw new Error('no debería usarse en un read'); },
      createImapClient: () => fakeImapClient([
        { uid: 1, subject: 'Asunto 1', from: 'remitente@b.com', date: now, source: 'Cuerpo 1' },
      ]),
    };
    const messages = await readTenantInbox('biz-1', {}, deps);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { uid: 1, subject: 'Asunto 1', from: 'remitente@b.com', date: now, text: 'Cuerpo 1' });
  });

  test('INBOX vacío → []', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => ({ address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', imapPort: 993, smtpHost: null, smtpPort: 465 }),
      createTransport: () => { throw new Error('no debería usarse'); },
      createImapClient: () => fakeImapClient([]),
    };
    assert.deepEqual(await readTenantInbox('biz-1', {}, deps), []);
  });

  test('sin IMAP_HOST → MailNotConfiguredError', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => ({ address: 'a@b.com', appPassword: 'x', imapHost: null, imapPort: 993, smtpHost: null, smtpPort: 465 }),
      createTransport: () => { throw new Error('no debería usarse'); },
      createImapClient: () => { throw new Error('no debería usarse'); },
    };
    await assert.rejects(() => readTenantInbox('biz-1', {}, deps), MailNotConfiguredError);
  });

  test('timeout duro: connect() que nunca resuelve no cuelga la función', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => ({ address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', imapPort: 993, smtpHost: null, smtpPort: 465 }),
      createTransport: () => { throw new Error('no debería usarse'); },
      createImapClient: () => ({
        connect: () => new Promise(() => { /* nunca resuelve — simula servidor colgado */ }),
        getMailboxLock: async (path) => ({ path, release: () => {} }),
        mailbox: false,
        async *fetch() {},
        logout: async () => {},
        close: () => {},
      }),
    };
    const start = Date.now();
    await assert.rejects(() => readTenantInbox('biz-1', { timeoutMs: 200 }, deps), /timeout/);
    assert.ok(Date.now() - start < 2000, 'debe rechazar en el timeout configurado, no colgarse');
  });

  test('timeout de connect → close() fuerza el cierre del socket colgado (no lo deja filtrado)', async () => {
    let closeCalls = 0;
    let logoutCalls = 0;
    const deps: MailConnectorDeps = {
      resolveConfig: async () => ({ address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', imapPort: 993, smtpHost: null, smtpPort: 465 }),
      createTransport: () => { throw new Error('no debería usarse'); },
      createImapClient: () => ({
        connect: () => new Promise(() => { /* nunca resuelve */ }),
        getMailboxLock: async (path) => ({ path, release: () => {} }),
        mailbox: false,
        async *fetch() {},
        logout: async () => { logoutCalls += 1; },
        close: () => { closeCalls += 1; },
      }),
    };
    await assert.rejects(() => readTenantInbox('biz-1', { timeoutMs: 200 }, deps), /timeout/);
    assert.equal(closeCalls, 1, 'un timeout de connect debe cerrar el socket con close()');
    // logout() sigue siendo best-effort en el finally; lo importante es que close() se llamó.
    assert.equal(logoutCalls, 1, 'el logout best-effort del finally sigue ejecutándose');
  });
});

describe('T2.2 — testMailConnection', () => {
  test('imap y smtp ok → { imap: true, smtp: true }', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => null,
      createTransport: () => ({ sendMail: async () => ({}), verify: async () => true }),
      createImapClient: () => ({
        connect: async () => {},
        getMailboxLock: async (path) => ({ path, release: () => {} }),
        mailbox: false,
        async *fetch() {},
        logout: async () => {},
        close: () => {},
      }),
    };
    const result = await testMailConnection(
      { address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', imapPort: 993, smtpHost: 'smtp.b.com', smtpPort: 465 },
      deps,
    );
    assert.deepEqual(result, { imap: true, smtp: true });
  });

  test('IMAP falla, SMTP ok → { imap:false, smtp:true, detail presente }', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => null,
      createTransport: () => ({ sendMail: async () => ({}), verify: async () => true }),
      createImapClient: () => ({
        connect: async () => { throw new Error('auth failed'); },
        getMailboxLock: async (path) => ({ path, release: () => {} }),
        mailbox: false,
        async *fetch() {},
        logout: async () => {},
        close: () => {},
      }),
    };
    const result = await testMailConnection(
      { address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', imapPort: 993, smtpHost: 'smtp.b.com', smtpPort: 465 },
      deps,
    );
    assert.equal(result.imap, false);
    assert.equal(result.smtp, true);
    assert.ok(result.detail && !result.detail.includes('x'), 'detail no debe filtrar la contraseña probada');
  });

  test('connect que nunca resuelve → close() se llama y devuelve { imap:false } sin colgarse', async () => {
    let closeCalls = 0;
    const deps: MailConnectorDeps = {
      resolveConfig: async () => null,
      createTransport: () => ({ sendMail: async () => ({}), verify: async () => true }),
      createImapClient: () => ({
        connect: () => new Promise(() => { /* nunca resuelve — simula servidor colgado */ }),
        getMailboxLock: async (path) => ({ path, release: () => {} }),
        mailbox: false,
        async *fetch() {},
        logout: async () => {},
        close: () => { closeCalls += 1; },
      }),
    };
    const start = Date.now();
    const result = await testMailConnection(
      { address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', imapPort: 993, smtpHost: 'smtp.b.com', smtpPort: 465 },
      deps,
    );
    assert.equal(result.imap, false, 'un connect colgado se resume como IMAP no verificado');
    assert.equal(closeCalls, 1, 'el timeout de connect debe cerrar el socket con close()');
    assert.ok(Date.now() - start < 12_000, 'no debe colgarse: corta en el timeout de prueba');
  });

  test('sin hosts → ambos false, detail no vacío', async () => {
    const deps: MailConnectorDeps = {
      resolveConfig: async () => null,
      createTransport: () => { throw new Error('no debería usarse'); },
      createImapClient: () => { throw new Error('no debería usarse'); },
    };
    const result = await testMailConnection({ address: 'a@b.com', appPassword: 'x' }, deps);
    assert.deepEqual(result.imap, false);
    assert.deepEqual(result.smtp, false);
    assert.ok(result.detail?.includes('IMAP_HOST'));
    assert.ok(result.detail?.includes('SMTP_HOST'));
  });
});

describe('T2.4 — provider-test.ts case "mail"', () => {
  function deps(testMail: ProviderTestDeps['testMail']): ProviderTestDeps {
    return {
      fetchImpl: (() => { throw new Error('no debería usarse'); }) as unknown as typeof fetch,
      createPool: () => { throw new Error('no debería usarse'); },
      testMail,
    };
  }

  test('JSON válido, imap+smtp ok → { ok: true }', async () => {
    const value = JSON.stringify({ address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', smtpHost: 'smtp.b.com' });
    const result = await testProviderConnection('mail', value, deps(async () => ({ imap: true, smtp: true })));
    assert.deepEqual(result, { ok: true });
  });

  test('imap falla → { ok: false, detail }', async () => {
    const value = JSON.stringify({ address: 'a@b.com', appPassword: 'x', imapHost: 'imap.b.com', smtpHost: 'smtp.b.com' });
    const result = await testProviderConnection('mail', value, deps(async () => ({ imap: false, smtp: true, detail: 'IMAP: no se pudo conectar' })));
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'IMAP: no se pudo conectar');
  });

  test('JSON inválido → { ok: false } sin lanzar, sin interpolar el value crudo', async () => {
    const result = await testProviderConnection('mail', 'no-es-json', deps(async () => ({ imap: true, smtp: true })));
    assert.equal(result.ok, false);
    assert.ok(!result.detail?.includes('no-es-json'));
  });
});
