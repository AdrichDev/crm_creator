import { test, expect } from '@playwright/test';

// P.6 — los proyectos del generador en localStorage se migran a Supabase (se
// conservan en local como backup). Test autolimpiable: crea uno apuntando a un
// tenant libre de aa.tenant, recarga (dispara la migración), comprueba que llegó
// a /api/projects y lo borra (soft) al final.
const API = 'http://localhost:4001';

test('proyecto en localStorage migra a Supabase (conservando backup)', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill('owner@estudiolua.com');
  await page.getByPlaceholder('••••••••').fill('demo1234Seed!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });

  // Token + tenant libre (sin proyecto) + estado previo.
  const setup = await page.evaluate(async (api) => {
    const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
    let token = ''; try { token = k ? JSON.parse(localStorage.getItem(k)!).access_token : ''; } catch {}
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-business-id': localStorage.getItem('saas.business.id') ?? '' };
    const tenants = await (await fetch(`${api}/api/tenants`, { headers: h })).json();
    return { token, tenantId: tenants[0]?.id as string, tenantNombre: tenants[0]?.nombre as string };
  }, API);
  expect(setup.tenantId, 'hay tenants en aa.tenant').toBeTruthy();

  const marca = `MIGR-${Date.now()}`;
  await page.evaluate(({ tenantId, marca }) => {
    localStorage.removeItem('saas.projects.migrated.v1');
    localStorage.setItem('saas.projects.v1', JSON.stringify([{
      id: 'p_test', createdAt: new Date().toISOString(),
      config: { business: { name: marca, vertical: 'peluqueria', clienteId: tenantId },
        branding: { primary: '#111111', secondary: '#222222', logoText: 'MT' },
        modules: {}, workerChips: {}, terminology: {}, setupComplete: true },
    }]));
  }, { tenantId: setup.tenantId, marca });

  await page.reload();
  await page.waitForTimeout(4000); // deja correr la migración (POST) + GET

  const after = await page.evaluate(async ({ api, tenantId }) => {
    const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
    let token = ''; try { token = k ? JSON.parse(localStorage.getItem(k)!).access_token : ''; } catch {}
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-business-id': localStorage.getItem('saas.business.id') ?? '' };
    const projects = await (await fetch(`${api}/api/projects`, { headers: h })).json();
    const mine = (projects as Array<{ id: string; config: { business?: { name?: string; clienteId?: string } } }>)
      .find((p) => p.config?.business?.clienteId === tenantId);
    // cleanup: soft delete el proyecto migrado
    if (mine) await fetch(`${api}/api/projects/${mine.id}`, { method: 'DELETE', headers: h });
    const backup = localStorage.getItem('saas.projects.backup.v1');
    const migrated = localStorage.getItem('saas.projects.migrated.v1');
    return { found: !!mine, foundName: mine?.config?.business?.name, hasBackup: !!backup, migratedFlag: !!migrated };
  }, { api: API, tenantId: setup.tenantId });

  expect(after.found, 'el proyecto local llegó a Supabase').toBeTruthy();
  expect(after.foundName).toBe(marca);
  expect(after.hasBackup, 'localStorage conservado como backup').toBeTruthy();
  expect(after.migratedFlag, 'flag de migración puesto').toBeTruthy();
});
