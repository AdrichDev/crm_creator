// crm-security-hardening S6: email addresses are not written to logs in clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail } from '../email.js';

test('keeps the first character and the domain, hides the rest of the local part', () => {
  assert.equal(maskEmail('maria.lopez@clinica.es'), 'm***@clinica.es');
});

test('one-character local part is fully hidden', () => {
  assert.equal(maskEmail('a@b.com'), '***@b.com');
});

test('several recipients are masked one by one', () => {
  assert.equal(maskEmail('ana@x.es, luis@y.es'), 'a***@x.es, l***@y.es');
});

test('value without @ is fully hidden', () => {
  assert.equal(maskEmail('not-an-email'), '***');
});
