import { test, expect } from '@playwright/test';

// Humo: la consola de proyectos y el onboarding cargan.
test('la consola de proyectos carga', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Consola|proyectos/i).first()).toBeVisible();
});

test('el onboarding 4-pasos carga (configurar negocio por tarjetas)', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page.getByText('Configura el negocio')).toBeVisible();
  // Paso 0: selector de sector (tarjetas) presente.
  await expect(page.getByRole('heading', { name: /Configura el negocio/i })).toBeVisible();
});
