# OperaOS — Backend (Express + Prisma + Supabase)

Backend **ejecutable** y **multi-tenant** del CRM generado: clientes, reservas/
citas, servicios, empleados, fichaje, vacaciones, productos, ventas, marketing,
recursos reservables, bonos, sedes, roles y documentos.

Stack: **Express + Prisma + PostgreSQL (Supabase) + Supabase Auth**. La
autenticación es de Supabase (tokens ES256 verificados vía JWKS); **no** hay
JWT propio ni bcrypt en este servicio.

## Arranque

```bash
cd back
npm install
cp .env.example .env          # define DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run prisma:generate       # genera el cliente Prisma
npx prisma migrate deploy     # aplica las migraciones (prisma/migrations/)
npm run seed                  # datos demo (opcional)
npm run dev                   # http://localhost:4001
```

> `assertConfig()` (en `env.ts`, invocado por `server.ts`) es **fail-closed**: el
> back NO arranca si falta o queda como placeholder `DATABASE_URL`, `SUPABASE_URL`
> o `SUPABASE_SERVICE_ROLE_KEY`. `SERVICE_ROLE_KEY` es solo backend — nunca debe
> llegar al navegador.

## Estructura

```
back/
  prisma/
    schema.prisma        ← modelos (núcleo + servicios + reservas), columnas en castellano vía @map
    migrations/          ← única estrategia de migración (prisma migrate deploy)
  src/
    server.ts            ← Express app (/health, /api) + assertConfig fail-closed
    env.ts               ← config + assertConfig
    routes/              ← auth, me, bookings, time-off, packages, dashboard, customers, employees,
                           projects, tenants, users, branding, dashboard, índice (crudRouter genérico)
    lib/
      auth.ts            ← Supabase Auth: verifySupabaseToken (ES256/JWKS) + supabaseAdmin (service role)
      availability.ts    ← motor de disponibilidad (solapes, aforo, buffers, ausencias)
      crud.ts            ← factoría CRUD genérica multi-tenant (soft-delete + gate de FKs)
      tenant.ts          ← gate cross-tenant (assertBelongsToBusiness / handleCrossTenant)
      nombre.ts          ← helpers nombre (split/join/pickFields)
      business.ts        ← shape único del negocio activo para el front
    middleware/          ← authenticate (Bearer Supabase), rbac, error, types
    seed.ts              ← datos demo
  scripts/               ← utilidades varias
```

## Multi-tenant y seguridad

- Toda tabla de negocio lleva `businessId` (`negocio_id`). El token Supabase
  resuelve el usuario; la cabecera `x-business-id` (o la primera membership) fija
  el tenant activo. Supabase **RLS** filtra las lecturas por negocio.
- **RBAC** por `MemberRole` (OWNER/ADMIN/MANAGER/EMPLOYEE/RECEPTIONIST/
  PROFESSIONAL/ACCOUNTANT). Acciones sensibles (aprobar vacaciones) exigen rol.
- El CRUD genérico filtra y crea **siempre** con el `businessId` del token, y
  valida que los FKs del body pertenezcan al negocio activo (gate de `lib/tenant.ts`
  → 422 `cross_tenant`).
- **Soft-delete**: el borrado marca `eliminado_en` (las lecturas filtran
  `eliminadoEn: null`). El hard-delete se reserva para producción.

## Motor de disponibilidad (`lib/availability.ts`)

`checkAvailability()` valida una franja contra: horario de apertura, festivos/
cierres, solape de empleado, ausencias aprobadas, compatibilidad servicio↔empleado
y **aforo** de cada recurso. `daySlots()` genera los huecos válidos de un día.

## Auth (Supabase)

- `POST /auth/register` (crea empresa+owner+sede; compensación SAGA si falla el tx).
- `POST /auth/register-client` (alta de cliente; `Customer.userId` enlaza a `auth.uid()`).
- `GET /auth/me` (perfil + memberships + negocio activo).
- `POST /auth/login`, `/set-password`, `/reset-password`, `/verify-email`,
  `/change-password` → la sesión y el cambio de contraseña los gestiona el **SDK de
  Supabase en el front** (`signInWithPassword`, `verifyOtp` + `updateUser`). Estos
  endpoints devuelven **410 Gone** señalando la vía SDK (salvo `change-password`,
  que sí actúa vía admin API + invalidación de sesiones).

## Endpoints principales (bajo `/api`, requieren token salvo `/auth` y `/branding`)

- **CRUD multi-tenant:** `/locations`, `/employees`, `/customers`, `/services`,
  `/resources`, `/products`, `/sales`, `/invoices`, `/campaigns`, `/fichajes`,
  `/tags` (GET, GET/:id, POST, PATCH/:id, DELETE/:id soft).
- **Reservas:** `GET /bookings`, `POST /bookings` (valida disponibilidad + gate FK),
  `POST /bookings/check-availability`, `PATCH /bookings/:id`,
  `POST /bookings/:id/cancel|complete|no-show` (historial; `complete` consume bono).
- **Cliente (portal):** `GET /me/profile|bookings|packages` (resuelve por `userId`).
- **Vacaciones:** `GET/POST /time-off`, `PATCH /time-off/:id/approve|reject` (rol manager+).
- **Bonos:** `GET/POST /packages`, `POST /packages/assign`,
  `POST /packages/customer-packages/:id/consume-session`.
- **Proyectos/tenants:** `/projects` (Business + config), `/tenants` (aa.tenant, FK).
- **Dashboard:** `GET /dashboard/summary`.

## Tests

```bash
npm test          # SOLO tests puros (excluye *.e2e.test.ts) — seguro, no toca la BD
npm run test:unit # solo src/lib/__tests__/*.test.ts
npm run test:e2e  # SOLO e2e live (*.e2e.test.ts) — opt-in, escribe en la BD real vía el back
npm run test:all  # todo (puros + e2e)
```

- `npm test` es el comando por defecto y NO ejecuta ningún e2e: cero conexiones
  o escrituras a la base de datos.
- `npm run test:e2e` requiere el back vivo (`TEST_API_URL` o `localhost:4001`) y
  un `SUPABASE_SERVICE_ROLE_KEY` real; sin ellos los e2e se auto-saltan o fallan
  rápido sin dejar datos. Cada fichero limpia lo que crea en su `after()`; si un
  cleanup falla, el error sale por consola con el prefijo `[e2e cleanup]`.
- Residuos de runs antiguos (negocios `Biz …`/`TzBiz…`, usuarios `*@test.local`):

```bash
node --import tsx scripts/purge-test-residue.mjs           # dry-run: lista, no borra
node --import tsx scripts/purge-test-residue.mjs --apply   # borra y reporta conteos
```

## Conexión con el front

El front (`front/`) consume esta API REST: define `NEXT_PUBLIC_API_URL` en
`front/.env.local` y `getBackend()` usa el backend REST (`apiBackend`). Sin esa
variable cae a `localBackend` (mock, solo para el generador sin API). Ver
`front/lib/data/backend.ts`.
