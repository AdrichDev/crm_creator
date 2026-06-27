// Unit tests for lib/email.ts
// Runner: node --import tsx --test
//
// sendEmail es soft-fail: nunca lanza.
// SMTP vacío o EMAIL_ENABLED=false → false sin llamar a nodemailer.
// Transport mock → llama sendMail y retorna true.
// sendMail que lanza → captura y retorna false.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Test A: SMTP vacío o EMAIL_ENABLED=false → no-op, retorna false, no lanza
// ---------------------------------------------------------------------------
describe('sendEmail — sin SMTP configurado', () => {
  test('retorna false cuando smtpHost está vacío', async () => {
    process.env.SMTP_HOST = '';
    process.env.EMAIL_ENABLED = 'true';

    // Re-importar con dynamic import para que env se evalúe con los nuevos valores.
    // Como env.ts ya está cacheado por el loader, usamos una doble capa:
    // sobreescribimos env directamente con un módulo de helper.
    const { _testSendEmail } = await import('../email.test-helpers.js');
    const result = await _testSendEmail({ smtpHost: '', emailEnabled: true }, { to: 'a@b.com', subject: 'test', html: '<p>test</p>' });
    assert.equal(result, false);
  });

  test('retorna false cuando EMAIL_ENABLED es false', async () => {
    const { _testSendEmail } = await import('../email.test-helpers.js');
    const result = await _testSendEmail({ smtpHost: 'smtp.gmail.com', emailEnabled: false }, { to: 'a@b.com', subject: 'test', html: '<p>test</p>' });
    assert.equal(result, false);
  });

  test('no lanza cuando smtpHost está vacío', async () => {
    const { _testSendEmail } = await import('../email.test-helpers.js');
    await assert.doesNotReject(async () => {
      await _testSendEmail({ smtpHost: '', emailEnabled: true }, { to: 'a@b.com', subject: 'test', html: '<p>test</p>' });
    });
  });
});

// ---------------------------------------------------------------------------
// Test B: transport mock → llama sendMail con los campos correctos
// ---------------------------------------------------------------------------
describe('sendEmail — con transport mock', () => {
  test('llama sendMail y retorna true', async () => {
    const { _testSendEmailWithTransport } = await import('../email.test-helpers.js');
    const calls: unknown[] = [];
    const mockTransport = {
      sendMail: async (opts: unknown) => { calls.push(opts); return { messageId: 'mock-id' }; },
    };

    const result = await _testSendEmailWithTransport(mockTransport, { to: 'cliente@test.com', subject: 'Cita confirmada', html: '<p>Hola</p>' });
    assert.equal(result, true);
    assert.equal(calls.length, 1);
    const opts = calls[0] as Record<string, string>;
    assert.equal(opts.to, 'cliente@test.com');
    assert.equal(opts.subject, 'Cita confirmada');
  });
});

// ---------------------------------------------------------------------------
// Test C: sendMail que lanza → captura y retorna false (soft-fail)
// ---------------------------------------------------------------------------
describe('sendEmail — sendMail lanza', () => {
  test('retorna false y no relanza cuando sendMail falla', async () => {
    const { _testSendEmailWithTransport } = await import('../email.test-helpers.js');
    const throwingTransport = {
      sendMail: async (_opts: unknown) => { throw new Error('SMTP connection refused'); },
    };

    let result: boolean | undefined;
    await assert.doesNotReject(async () => {
      result = await _testSendEmailWithTransport(throwingTransport, { to: 'fail@test.com', subject: 'Falla', html: '<p>x</p>' });
    });
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// Test D: plantillas generan HTML no vacío
// ---------------------------------------------------------------------------
describe('plantillas de email', () => {
  test('confirmedTemplate genera HTML con nombre y servicio', async () => {
    const { confirmedTemplate } = await import('../email.js');
    const html = confirmedTemplate({
      customerName: 'Ana García',
      serviceName: 'Corte de cabello',
      startsAt: new Date('2026-07-01T10:00:00Z'),
      businessName: 'Peluquería Example',
    });
    assert.ok(html.includes('Ana García'));
    assert.ok(html.includes('Corte de cabello'));
    assert.ok(html.includes('Peluquería Example'));
  });

  test('reminderTemplate 24h genera HTML con ventana correcta', async () => {
    const { reminderTemplate } = await import('../email.js');
    const html = reminderTemplate({
      customerName: 'Luis',
      serviceName: 'Masaje',
      startsAt: new Date('2026-07-02T15:00:00Z'),
      businessName: 'Spa Test',
    }, '24h');
    assert.ok(html.includes('mañana'));
    assert.ok(html.includes('Luis'));
  });

  test('reminderTemplate 2h genera HTML con ventana correcta', async () => {
    const { reminderTemplate } = await import('../email.js');
    const html = reminderTemplate({
      customerName: 'María',
      serviceName: 'Pedicura',
      startsAt: new Date('2026-07-02T18:00:00Z'),
      businessName: 'Centro Belleza',
    }, '2h');
    assert.ok(html.includes('en 2 horas'));
  });

  test('noShowTemplate genera HTML con mensaje de seguimiento', async () => {
    const { noShowTemplate } = await import('../email.js');
    const html = noShowTemplate({
      customerName: 'Carlos',
      serviceName: 'Consulta',
      startsAt: new Date('2026-06-30T09:00:00Z'),
      businessName: 'Clínica Test',
    });
    assert.ok(html.includes('Carlos'));
    assert.ok(html.includes('Clínica Test'));
    assert.ok(html.includes('echamos de menos'));
  });

  test('escapa HTML en campos controlados por el tenant (anti-XSS)', async () => {
    const { confirmedTemplate } = await import('../email.js');
    const html = confirmedTemplate({
      customerName: '<script>alert(1)</script>',
      serviceName: 'Corte & "premium"',
      startsAt: new Date('2026-07-01T10:00:00Z'),
      employeeName: '<b>Pepe</b>',
      businessName: 'A<>B',
    });
    // El payload malicioso NO debe aparecer crudo.
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<b>Pepe</b>'));
    // Debe aparecer escapado.
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Corte &amp; &quot;premium&quot;'));
  });
});
