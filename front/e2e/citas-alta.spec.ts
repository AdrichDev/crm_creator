import { test, expect, type Page } from '@playwright/test';
import { login, requiereCredenciales, E2E_API_URL as API, PROYECTO_RE } from './_auth';

// O.3 — alta REAL de cita: modal con selectores por id + fecha/hora → POST /api/bookings
// (valida disponibilidad). Autolimpiable (borra la cita creada vía API al final).
requiereCredenciales();

/** Próximo viernes, dentro del horario L-V 9-20 del seed. Una fecha fija se queda en el
 *  pasado y el alta pasa a validar disponibilidad sobre un día que ya no existe. */
function proximoViernes(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const FECHA = proximoViernes();
const HORA = '10:00';

async function abrirCRM(page: Page) {
  const card = page.locator('.crm-console-card', { hasText: PROYECTO_RE });
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
    const listRaw = await (await fetch(`${api}/api/bookings`, { headers: h })).json();
    const list = Array.isArray(listRaw) ? listRaw : (listRaw?.items ?? []);
    for (const b of list as Array<{ id: string; fecha: string }>) {
      if (b.fecha === fecha) await fetch(`${api}/api/bookings/${b.id}`, { method: 'DELETE', headers: h });
    }
  }, { api: API, fecha: FECHA });
});
