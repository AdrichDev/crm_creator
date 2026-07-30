// ---------------------------------------------------------------------------
// Login compartido de la suite e2e.
//
// Las credenciales NUNCA viven en el repo. La suite apunta a un entorno real —CRM y
// agents-agency comparten un único proyecto Supabase—, así que un usuario y una
// contraseña conocidos y commiteados serían una puerta trasera, no un dato de prueba.
// Es el mismo criterio que ya aplica `back/scripts/create-verify-login.ts`.
//
// Antes cada spec repetía el mismo bloque con `owner@estudiolua.com` / `demo1234Seed!`,
// el par que creaba `back/src/seed.ts`. Ese usuario ya no existe en `auth.users` y el
// seed no es idempotente contra la base viva, así que los siete specs fallaban en el
// login sin llegar a comprobar nada: verdes imposibles, rojos que no señalaban ningún
// defecto del producto. Ahora, sin credenciales, saltan diciendo por qué.
// ---------------------------------------------------------------------------

import { test, type Page } from '@playwright/test';

export const E2E_EMAIL = process.env.E2E_EMAIL ?? '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '';

/** Back contra el que corren las llamadas directas de preparación y limpieza. */
export const E2E_API_URL = process.env.E2E_API_URL ?? 'http://localhost:4001';

/**
 * Negocio sobre el que operan los specs que abren un proyecto concreto. Sigue siendo el
 * del seed histórico porque es el que existe en la base; se parametriza para que la suite
 * no quede clavada a un nombre propio.
 */
export const E2E_PROJECT = process.env.E2E_PROJECT ?? 'Estudio Lúa';

/** El nombre del proyecto como patrón, tolerando la tilde perdida en algunos datos. */
export const PROYECTO_RE = new RegExp(
  E2E_PROJECT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[úu]/gi, '[uú]'),
  'i',
);

/**
 * Salta el fichero entero si no hay credenciales. Se llama en el cuerpo del spec, no
 * dentro de un test, para que el motivo aparezca en el informe sin ejecutar nada.
 */
export function requiereCredenciales(): void {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    'Define E2E_EMAIL y E2E_PASSWORD (usuario con acceso al proyecto de pruebas)',
  );
}

/** Entra por el formulario y espera a salir de /login. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(E2E_EMAIL);
  await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}
