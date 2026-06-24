import { test, expect, type Page } from '@playwright/test';

// O.3 — alta REAL de cita: modal con selectores por id + fecha/hora → POST /api/bookings
// (valida disponibilidad). Autolimpiable (borra la cita creada vía API al final).
const API = 'http://localhost:4001';
const FECHA = '2026-06-26'; // viernes, dentro de horario L-V 9-20 del seed
const HORA = '10:00';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill('owner@estudiolua.com');
  await page.getByPlaceholder('••••••••').fill('demo1234Seed!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}
async function abrirCRM(page: Page) {
  const card = page.locator('.crm-console-card', { hasText: /Estudio L[uú]a/i });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: /abrir/i }).click();
  await page.waitForURL('**/panel', { timeout: 20_000 });
}

test('alta de cita real (modal → POST /bookings → aparece en agenda)', async ({ page }) => {
  await login(page);
  await abrirCRM(page);
  await page.goto('/citas');

  await page.getByRole('button', { name: /nueva/i }).click();
  // Selectores poblados con datos reales.
  const selects = page.locator('form select');
  await expect(selects.first()).toBeVisible({ timeout: 15_000 });
  await selects.nth(0).selectOption({ index: 1 });             // cliente (primer real)
  await selects.nth(1).selectOption({ label: 'Corte de pelo' }); // servicio
  await page.locator('input[type="date"]').fill(FECHA);
  await page.locator('input[type="time"]').fill(HORA);
  await page.getByRole('button', { name: /crear cita/i }).click();

  // La cita aparece en la agenda (fecha del seed-range).
  await expect(page.getByText(FECHA).first()).toBeVisible({ timeout: 15_000 });

  // Cleanup: borra la cita creada vía API.
  await page.evaluate(async ({ api, fecha }) => {
    const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
    let token = ''; try { token = k ? JSON.parse(localStorage.getItem(k)!).access_token : ''; } catch {}
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-business-id': localStorage.getItem('saas.business.id') ?? '' };
    const list = await (await fetch(`${api}/api/bookings`, { headers: h })).json();
    for (const b of list as Array<{ id: string; fecha: string }>) {
      if (b.fecha === fecha) await fetch(`${api}/api/bookings/${b.id}`, { method: 'DELETE', headers: h });
    }
  }, { api: API, fecha: FECHA });
});
