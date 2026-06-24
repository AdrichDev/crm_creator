import { test, expect, type Page } from '@playwright/test';

// O.1 — soft delete: crear cliente → DELETE (soft) → ya no aparece en la lista
// (queda en BD con eliminado_en). Autocontenido.
const API = 'http://localhost:4001';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill('owner@estudiolua.com');
  await page.getByPlaceholder('••••••••').fill('demo1234Seed!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

test('soft delete: cliente borrado desaparece de la lista', async ({ page }) => {
  await login(page);
  const r = await page.evaluate(async (api) => {
    const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
    let token = ''; try { token = k ? JSON.parse(localStorage.getItem(k)!).access_token : ''; } catch {}
    const biz = localStorage.getItem('saas.business.id') ?? '';
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-business-id': biz };
    const marca = `DEL-${Date.now()}`;
    const created = await (await fetch(`${api}/api/customers`, { method: 'POST', headers: h, body: JSON.stringify({ nombre: marca, email: `${marca}@t.local` }) })).json();
    const before = await (await fetch(`${api}/api/customers`, { headers: h })).json();
    const inBefore = (before as Array<{ id: string }>).some((c) => c.id === created.id);
    const del = await fetch(`${api}/api/customers/${created.id}`, { method: 'DELETE', headers: h });
    const after = await (await fetch(`${api}/api/customers`, { headers: h })).json();
    const inAfter = (after as Array<{ id: string }>).some((c) => c.id === created.id);
    return { inBefore, delStatus: del.status, inAfter };
  }, API);
  expect(r.inBefore, 'cliente creado aparece').toBeTruthy();
  expect(r.delStatus).toBe(204);
  expect(r.inAfter, 'tras soft delete ya no aparece').toBeFalsy();
});
