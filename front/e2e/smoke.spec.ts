import { test, expect } from '@playwright/test';

// Humo: la consola de proyectos y el onboarding cargan.
test('la consola de proyectos carga (tras login: / es auth-gated desde P.3)', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill('owner@estudiolua.com');
  await page.getByPlaceholder('••••••••').fill('demo1234Seed!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
  await expect(page.getByText(/Consola|proyectos/i).first()).toBeVisible({ timeout: 15_000 });
});

test('el onboarding 4-pasos carga (configurar negocio por tarjetas)', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page.getByText('Configura el negocio')).toBeVisible();
  // Paso 0: selector de sector (tarjetas) presente.
  await expect(page.getByRole('heading', { name: /Configura el negocio/i })).toBeVisible();
});
