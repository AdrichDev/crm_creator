import { test, expect, type Page } from '@playwright/test';

// P1 — gate de tenancy: un FK que no pertenece al negocio activo se rechaza con 422
// (cross_tenant). Probamos con ids inexistentes/ajenos en bookings y sales.
const API = 'http://localhost:4001';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill('owner@estudiolua.com');
  await page.getByPlaceholder('••••••••').fill('demo1234Seed!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

test('FK fuera del negocio → 422 cross_tenant (bookings y sales)', async ({ page }) => {
  await login(page);
  // Abrir Estudio Lúa (tiene servicios) para fijar el negocio activo correcto.
  const card = page.locator('.crm-console-card', { hasText: /Estudio L[uú]a/i });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole('button', { name: /abrir/i }).click();
  await page.waitForURL('**/panel', { timeout: 20_000 });
  const r = await page.evaluate(async (api) => {
    const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
    let token = ''; try { token = k ? JSON.parse(localStorage.getItem(k)!).access_token : ''; } catch {}
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-business-id': localStorage.getItem('saas.business.id') ?? '' };
    const unwrap = (r: unknown) => (Array.isArray(r) ? r : (r as { items?: unknown[] })?.items ?? []);
    const services = unwrap(await (await fetch(`${api}/api/services`, { headers: h })).json()) as Array<{ id: string }>;
    const locations = unwrap(await (await fetch(`${api}/api/locations`, { headers: h })).json()) as Array<{ id: string }>;
    const serviceId = services[0]?.id; const locationId = locations[0]?.id;

    // Booking con customerId ajeno/inexistente → 422.
    const booking = await fetch(`${api}/api/bookings`, { method: 'POST', headers: h, body: JSON.stringify({ locationId, serviceId, customerId: 'cmbogus0000000000000000000', start: '2026-06-26T11:00:00' }) });
    const bookingBody = await booking.json().catch(() => ({}));

    // Venta (crud) con customerId ajeno → 422.
    const sale = await fetch(`${api}/api/sales`, { method: 'POST', headers: h, body: JSON.stringify({ customerId: 'cmbogus0000000000000000000', cliente: 'X', total: 1 }) });
    const saleBody = await sale.json().catch(() => ({}));

    return { bookingStatus: booking.status, bookingCode: bookingBody?.error?.code, saleStatus: sale.status, saleCode: saleBody?.error?.code };
  }, API);
  expect(r.bookingStatus, 'booking FK ajeno').toBe(422);
  expect(r.bookingCode).toBe('cross_tenant');
  expect(r.saleStatus, 'sale FK ajeno').toBe(422);
  expect(r.saleCode).toBe('cross_tenant');
});
