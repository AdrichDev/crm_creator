import { test, expect } from '@playwright/test';

// Humo: la consola de proyectos y el onboarding cargan.
test('la consola de proyectos carga', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Consola|proyectos/i).first()).toBeVisible();
});

test('el onboarding muestra el selector de cliente vinculado', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page.getByText('Cliente vinculado')).toBeVisible();
  await expect(page.getByPlaceholder('Filtrar clientes por nombre…')).toBeVisible();
});
