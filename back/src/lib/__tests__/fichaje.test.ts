// Unit tests para la máquina de estados del fichaje (crm-operaos WU6, AC6).
// Runner: node --import tsx --test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextAllowedStep, isValidStep, isJornadaCompleta, sequenceFor,
  type WorkdayStep,
} from '../fichaje.js';

describe('fichaje: jornada intensiva (entrada → salida_final)', () => {
  test('sin pasos hoy → siguiente es entrada', () => {
    assert.equal(nextAllowedStep('intensiva', []), 'entrada');
  });
  test('tras entrada → siguiente es salida_final', () => {
    assert.equal(nextAllowedStep('intensiva', ['entrada']), 'salida_final');
  });
  test('tras entrada+salida_final → jornada completa (null)', () => {
    assert.equal(nextAllowedStep('intensiva', ['entrada', 'salida_final']), null);
    assert.equal(isJornadaCompleta('intensiva', ['entrada', 'salida_final']), true);
  });
  test('no permite fichar salida_final sin entrada (salto)', () => {
    assert.equal(isValidStep('intensiva', [], 'salida_final'), false);
  });
  test('no permite repetir entrada', () => {
    assert.equal(isValidStep('intensiva', ['entrada'], 'entrada'), false);
  });
  test('bloquea fichaje extra tras completar la jornada', () => {
    assert.equal(isValidStep('intensiva', ['entrada', 'salida_final'], 'entrada'), false);
  });
});

describe('fichaje: jornada partida (entrada→salida_comida→entrada_comida→salida_final)', () => {
  const FULL: WorkdayStep[] = ['entrada', 'salida_comida', 'entrada_comida', 'salida_final'];

  test('secuencia completa paso a paso', () => {
    assert.equal(nextAllowedStep('partida', []), 'entrada');
    assert.equal(nextAllowedStep('partida', ['entrada']), 'salida_comida');
    assert.equal(nextAllowedStep('partida', ['entrada', 'salida_comida']), 'entrada_comida');
    assert.equal(nextAllowedStep('partida', ['entrada', 'salida_comida', 'entrada_comida']), 'salida_final');
    assert.equal(nextAllowedStep('partida', FULL), null);
  });
  test('no permite saltar salida_comida/entrada_comida directo a salida_final', () => {
    assert.equal(isValidStep('partida', ['entrada'], 'salida_final'), false);
  });
  test('no permite repetir un paso intermedio', () => {
    assert.equal(isValidStep('partida', ['entrada', 'salida_comida'], 'salida_comida'), false);
  });
  test('bloquea fichaje extra tras completar la jornada partida', () => {
    assert.equal(isValidStep('partida', FULL, 'entrada'), false);
  });
  test('sequenceFor devuelve el orden completo del modo', () => {
    assert.deepEqual(sequenceFor('partida'), FULL);
    assert.deepEqual(sequenceFor('intensiva'), ['entrada', 'salida_final']);
  });
});

describe('fichaje: datos corruptos', () => {
  test('nextAllowedStep lanza si doneToday no es prefijo válido de la secuencia', () => {
    assert.throws(() => nextAllowedStep('intensiva', ['salida_final']));
    assert.throws(() => nextAllowedStep('partida', ['entrada', 'entrada_comida']));
  });
  test('isValidStep devuelve false (no lanza) ante datos corruptos', () => {
    assert.equal(isValidStep('partida', ['entrada', 'entrada_comida'], 'salida_final'), false);
  });
});
