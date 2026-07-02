// Unit tests para ics.ts (serializador RFC 5545 puro).
// Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toICS, escapeText, foldLine, formatDateUTC } from '../ics.js';
import type { CalendarItem } from '../ics.js';

describe('formatDateUTC', () => {
  test('formatea a YYYYMMDDTHHMMSSZ en UTC', () => {
    const d = new Date(Date.UTC(2026, 6, 2, 9, 5, 3)); // 2026-07-02T09:05:03Z
    assert.equal(formatDateUTC(d), '20260702T090503Z');
  });
});

describe('escapeText', () => {
  test('escapa backslash, coma, punto y coma y saltos de línea', () => {
    assert.equal(escapeText('a\\b'), 'a\\\\b');
    assert.equal(escapeText('a,b'), 'a\\,b');
    assert.equal(escapeText('a;b'), 'a\\;b');
    assert.equal(escapeText('a\nb'), 'a\\nb');
    assert.equal(escapeText('a\r\nb'), 'a\\nb');
  });

  test('combina varios escapes en el mismo texto', () => {
    assert.equal(escapeText('Cita; Cliente, Notas\ncon salto'), 'Cita\\; Cliente\\, Notas\\ncon salto');
  });
});

describe('foldLine', () => {
  test('no pliega líneas cortas (<=75 octetos)', () => {
    const line = 'SUMMARY:Corte de pelo';
    assert.equal(foldLine(line), line);
    assert.ok(!foldLine(line).includes('\r\n'));
  });

  test('pliega líneas largas con CRLF + espacio de continuación', () => {
    const longSummary = 'SUMMARY:' + 'x'.repeat(120);
    const folded = foldLine(longSummary);
    const parts = folded.split('\r\n');
    assert.ok(parts.length > 1);
    // Cada línea de continuación empieza con un espacio.
    for (let i = 1; i < parts.length; i++) {
      assert.ok(parts[i].startsWith(' '));
    }
    // Ningún chunk excede 75 octetos.
    for (const part of parts) {
      assert.ok(Buffer.from(part, 'utf8').length <= 75);
    }
  });

  test('no corte un carácter UTF-8 multibyte a la mitad', () => {
    // Genera un SUMMARY largo con caracteres acentuados (2 bytes en UTF-8).
    const longSummary = 'SUMMARY:' + 'ñáéíóú'.repeat(20);
    const folded = foldLine(longSummary);
    // Reconstruir debe reproducir el texto original sin caracteres corruptos.
    const rebuilt = folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('');
    assert.equal(rebuilt, longSummary);
  });
});

describe('toICS', () => {
  function makeItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
    return {
      uid: 'booking-abc123@crm',
      title: 'Corte de pelo',
      start: new Date(Date.UTC(2026, 6, 2, 10, 0, 0)),
      end: new Date(Date.UTC(2026, 6, 2, 10, 30, 0)),
      ...overrides,
    };
  }

  test('genera VCALENDAR/VEVENT válido con cabeceras obligatorias', () => {
    const ics = toICS([makeItem()], new Date(Date.UTC(2026, 6, 1, 0, 0, 0)));
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.includes('VERSION:2.0\r\n'));
    assert.ok(ics.includes('PRODID:'));
    assert.ok(ics.includes('BEGIN:VEVENT\r\n'));
    assert.ok(ics.includes('END:VEVENT\r\n'));
    assert.ok(ics.trim().endsWith('END:VCALENDAR'));
  });

  test('UID estable por entidad (booking-{id}@crm)', () => {
    const ics = toICS([makeItem({ uid: 'booking-xyz@crm' })]);
    assert.ok(ics.includes('UID:booking-xyz@crm\r\n'));
  });

  test('UID estable para recordatorios (reminder-{id}@crm)', () => {
    const ics = toICS([makeItem({ uid: 'reminder-xyz@crm' })]);
    assert.ok(ics.includes('UID:reminder-xyz@crm\r\n'));
  });

  test('incluye DTSTART/DTEND en UTC y DTSTAMP', () => {
    const ics = toICS([makeItem()], new Date(Date.UTC(2026, 6, 1, 0, 0, 0)));
    assert.ok(ics.includes('DTSTART:20260702T100000Z\r\n'));
    assert.ok(ics.includes('DTEND:20260702T103000Z\r\n'));
    assert.ok(ics.includes('DTSTAMP:20260701T000000Z\r\n'));
  });

  test('escapa comas/saltos en SUMMARY/DESCRIPTION/LOCATION', () => {
    const ics = toICS([makeItem({
      title: 'Cita, importante',
      description: 'Cliente: Ana\nSegunda línea',
      location: 'Calle Mayor; 2º piso',
    })]);
    assert.ok(ics.includes('SUMMARY:Cita\\, importante\r\n'));
    assert.ok(ics.includes('DESCRIPTION:Cliente: Ana\\nSegunda línea\r\n'));
    assert.ok(ics.includes('LOCATION:Calle Mayor\\; 2º piso\r\n'));
  });

  test('DESCRIPTION y LOCATION son opcionales — se omiten si no vienen', () => {
    const ics = toICS([makeItem()]);
    assert.ok(!ics.includes('DESCRIPTION:'));
    assert.ok(!ics.includes('LOCATION:'));
  });

  test('múltiples ítems generan múltiples VEVENT', () => {
    const ics = toICS([makeItem({ uid: 'a@crm' }), makeItem({ uid: 'b@crm' })]);
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
    assert.equal((ics.match(/END:VEVENT/g) ?? []).length, 2);
  });

  test('lista vacía produce VCALENDAR sin VEVENT', () => {
    const ics = toICS([]);
    assert.ok(!ics.includes('BEGIN:VEVENT'));
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('END:VCALENDAR'));
  });

  test('termina en CRLF (RFC 5545)', () => {
    const ics = toICS([makeItem()]);
    assert.ok(ics.endsWith('\r\n'));
    assert.ok(!ics.includes('\n\n')); // sin LF sueltos duplicados
  });
});
