/**
 * front/tests/capacitor-scaffolding.test.ts
 *
 * Fase 5.1: verifica que el scaffolding de Capacitor/Android quedo commiteado
 * con el wrapper de Gradle (gradlew.bat + gradle-wrapper.jar) y la config base.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const front = resolve(__dirname, '..');

describe('5.1 Capacitor android scaffolding', () => {
  it('capacitor.config.ts existe', () => {
    expect(existsSync(resolve(front, 'capacitor.config.ts'))).toBe(true);
  });

  it('gradle wrapper (gradlew.bat + jar) presente', () => {
    expect(existsSync(resolve(front, 'android', 'gradlew.bat'))).toBe(true);
    expect(
      existsSync(resolve(front, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar')),
    ).toBe(true);
  });

  it('android/app/build.gradle presente', () => {
    expect(existsSync(resolve(front, 'android', 'app', 'build.gradle'))).toBe(true);
  });
});
