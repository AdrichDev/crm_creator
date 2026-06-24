import { test, expect, type Page } from '@playwright/test';

// O.2 — alta de proyecto: el onboarding (paso "Tipo de negocio") carga los tenants
// REALES de aa.tenant en el selector de cliente. (El POST de creación ya está
// cubierto en migracion-localstorage.spec — mismo path createProject→POST /projects.
// El drive completo del wizard no se automatiza por requerir un tenant libre no
// determinable en UI → 409.)
async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill('owner@estudiolua.com');
  await page.getByPlaceholder('••••••••').fill('demo1234Seed!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

test('onboarding carga tenants reales en el selector de cliente', async ({ page }) => {
  await login(page);
  await page.goto('/onboarding');
  await expect(page.getByText('Configura el negocio')).toBeVisible({ timeout: 15_000 });
  // Abre el combobox de cliente y comprueba que salen tenants reales de AA.
  const input = page.getByPlaceholder('Escribe el nombre del cliente');
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.click();
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/AiAs|Caress/i).first()).toBeVisible({ timeout: 15_000 });
});
