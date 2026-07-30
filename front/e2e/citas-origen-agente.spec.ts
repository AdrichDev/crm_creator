import { test, expect, type Page } from '@playwright/test';

// C1 — las reservas que toma el asistente (aa.cita) se MUESTRAN en OperaOS pero no se
// editan desde aquí: OperaOS no sabe liberar la franja ni avisar al cliente, así que un
// PATCH/DELETE desde el panel desincronizaría la agenda del asistente en silencio.
//
// La respuesta de /bookings se intercepta: lo que se valida es el contrato de la UI ante
// una fila con `origen: "agente"`, no que exista un mock sembrado en la base local.
// Usuario de verificación no destructivo (back/scripts/create-verify-login.ts), ADMIN de
// "EDM San Blas" — el negocio activo se fija en localStorage (lib/auth/session.ts) en vez
// de pasar por la consola del generador, que es otra pantalla y otro contrato.
const BUSINESS_KEY = 'saas.business.id';
const ACTIVE_KEY = 'saas.active-project.v1';
const MIGRATED_KEY = 'saas.projects.migrated.v1';
const BUSINESS_ID = 'cmr0sk6hi000130fxokfryd72';

// AppShell (components/layout/app-shell.tsx) redirige a /dashboard si no hay proyecto
// activo, y "activo" significa que el id guardado en ACTIVE_KEY aparece en la lista que
// devuelve /api/projects. Se fijan ambos lados: el id, antes de que arranque React
// (addInitScript), y la lista, interceptada.
const PROYECTO = {
  id: BUSINESS_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  config: null,
  // El vertical decide qué módulos trae la config por defecto (lib/config/verticals.ts):
  // 'custom' no incluye 'citas' y la pantalla queda fuera del panel.
  business: {
    nombre: 'EDM San Blas', vertical: 'peluqueria',
    marcaPrimario: '#0ea5e9', marcaSecundario: '#1e293b', logoUrl: null,
  },
};

async function login(page: Page) {
  await page.addInitScript(([bk, ak, mk, id]) => {
    localStorage.setItem(bk, id);
    localStorage.setItem(ak, id);
    localStorage.setItem(mk, 'e2e'); // salta la migración localStorage→Supabase
  }, [BUSINESS_KEY, ACTIVE_KEY, MIGRATED_KEY, BUSINESS_ID]);
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill('verify-agent@estudiolua.com');
  await page.getByPlaceholder('••••••••').fill('VerifyAgent2026!');
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
}

/** Una cita del CRM y una del asistente, el mismo día, para poder comparar en pantalla.
 * La agenda abre en el mes en curso, así que la fecha se calcula: una fija dejaría el
 * test verde o rojo según el mes en que se ejecute. */
const hoy = new Date();
const FECHA = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
const base = {
  servicio: 'Corte de pelo', fecha: FECHA, estado: 'Confirmada',
  customerId: null, teamId: null, serviceId: null, employeeId: null, locationId: null,
  recurso: null, aforo: null, direccion: null,
};
const ITEMS = [
  { ...base, id: 'crm-1', cliente: 'Cliente del CRM', clienteComercial: 'Cliente del CRM', empleado: 'Ana', hora: '10:00', notes: 'Nota propia' },
  { ...base, id: 'aa:cita-1', cliente: 'Cliente del bot', clienteComercial: 'Cliente del bot', empleado: '', hora: '12:00', notes: 'Alergia a frutos secos', origen: 'agente' },
];

test('una reserva del asistente se ve pero no ofrece editar ni borrar', async ({ page }) => {
  await page.route('**/api/projects', (route) => route.fulfill({ json: [PROYECTO] }));
  await page.route('**/api/bookings?**', (route) =>
    route.fulfill({ json: { items: ITEMS, total: ITEMS.length, page: 1, limit: 100 } }));

  await login(page);
  await page.goto('/citas');

  const tarjetaAgente = page.locator('.cita-full-card', { hasText: 'Cliente del bot' });
  const tarjetaPropia = page.locator('.cita-full-card', { hasText: 'Cliente del CRM' });
  await expect(tarjetaAgente).toBeVisible({ timeout: 15_000 });

  // La cita del CRM conserva sus acciones: el test fallaría igual si el selector
  // estuviera mal escrito y nadie tuviera acciones nunca.
  await expect(tarjetaPropia.locator('.row-action')).not.toHaveCount(0);
  await expect(tarjetaAgente.locator('.row-action')).toHaveCount(0);
  await expect(tarjetaAgente.getByText('Reserva del asistente')).toBeVisible();

  // El detalle tampoco deja escribir: ni edición ni guardado de anotaciones.
  await tarjetaAgente.click();
  const modal = page.locator('.opera-modal', { hasText: 'Detalle de cita' });
  await expect(modal.getByText('Alergia a frutos secos')).toBeVisible();
  await expect(modal.getByRole('button', { name: /guardar anotaci/i })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^editar$/i })).toHaveCount(0);
  await expect(modal.locator('textarea')).toHaveCount(0);
});
