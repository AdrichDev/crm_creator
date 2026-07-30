import { test, expect } from '@playwright/test';
import { login, requiereCredenciales, PROYECTO_RE } from './_auth';

// Flujo confirmado: login → dashboard (consola de tarjetas) con proyectos desde
// Supabase → abrir → panel → datos reales → volver al dashboard.
requiereCredenciales();

test('login → dashboard (consola de tarjetas) con proyectos de Supabase', async ({ page }) => {
  await login(page);
  await expect(page.getByText(/OperaOS · Consola/i)).toBeVisible({ timeout: 15_000 });
  // Proyecto real del usuario (Business vía Membership), tarjeta del generador.
  await expect(page.getByText(PROYECTO_RE).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /nuevo proyecto/i }).first()).toBeVisible();
});

test('abrir proyecto → panel → clientes reales → volver', async ({ page }) => {
  await login(page);
  const card = page.locator('.crm-console-card', { hasText: PROYECTO_RE });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: /abrir/i }).click();
  await page.waitForURL('**/panel', { timeout: 20_000 });
  await expect(page.getByText(/PANEL/).first()).toBeVisible({ timeout: 15_000 });

  await page.goto('/clientes');
  await expect(page.getByText(/ana@mail\.com/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Recurrente').first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /volver/i }).click();
  await page.waitForURL((u) => u.pathname === '/' || u.pathname === '/dashboard', { timeout: 15_000 }); // consola vive en / o /dashboard
  await expect(page.getByText(/OperaOS · Consola/i)).toBeVisible({ timeout: 15_000 });
});

test('empleados muestra dato real castellano (Sara Molina, nombre combinado)', async ({ page }) => {
  await login(page);
  const card = page.locator('.crm-console-card', { hasText: PROYECTO_RE });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: /abrir/i }).click();
  await page.waitForURL('**/panel', { timeout: 20_000 });
  await page.goto('/empleados');
  await expect(page.getByText(/Sara Molina/i).first()).toBeVisible({ timeout: 15_000 });
});
