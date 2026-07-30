import { test, expect } from '@playwright/test';
import { login, requiereCredenciales } from './_auth';

// Humo: la consola de proyectos y el onboarding cargan.
test('la consola de proyectos carga (tras login: / es auth-gated desde P.3)', async ({ page }) => {
  // Solo este test necesita sesión; el onboarding de abajo es público y debe correr igual.
  requiereCredenciales();
  await login(page);
  await expect(page.getByText(/Consola|proyectos/i).first()).toBeVisible({ timeout: 15_000 });
});

test('el onboarding 4-pasos carga (configurar negocio por tarjetas)', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page.getByText('Configura el negocio')).toBeVisible();
  // Paso 0: selector de sector (tarjetas) presente.
  await expect(page.getByRole('heading', { name: /Configura el negocio/i })).toBeVisible();
});
