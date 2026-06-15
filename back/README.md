# OperaOS — Backend (Express + Prisma + PostgreSQL)

Backend **ejecutable** y **multi-tenant** que implementa el dominio Business OS
del `SDD_v1.md` **más** todos los servicios que ya teníamos (clientes, reservas/
citas, servicios, empleados, fichaje, vacaciones, productos, ventas, marketing),
y añade recursos reservables, bonos, sedes, roles y documentos.

Stack alineado con agents-agency: **Express + Prisma + PostgreSQL + JWT**.

## Arranque

```bash
cd back
npm install
cp .env.example .env        # define DATABASE_URL y JWT_SECRET
npm run prisma:generate     # genera el cliente Prisma
npm run db:push             # crea las tablas en tu Postgres/Supabase
npm run seed                # datos demo (login: owner@estudiolua.com / demo1234)
npm run dev                 # http://localhost:4000
```

> Nota: `prisma generate` descarga binarios del motor; hazlo en tu máquina (en el
> sandbox de generación estaban bloqueados por red). El esquema Prisma (27 modelos,
> llaves balanceadas) y el TypeScript de la app están validados con type-check.

## Estructura

```
back/
  prisma/schema.prisma   ← 27 modelos (núcleo + servicios + reservas)
  src/
    server.ts            ← Express app (/health, /api)
    routes/              ← auth, bookings, time-off, packages, dashboard, índice
    lib/
      availability.ts    ← motor de disponibilidad (solapes, aforo, buffers, ausencias)
      crud.ts            ← factoría CRUD genérica multi-tenant
      auth.ts            ← JWT + bcrypt
    middleware/          ← authenticate, rbac, error, types
    seed.ts              ← datos demo
  schema/ , scripts/     ← (legado) generador SQL por módulos de la consola
```

## Multi-tenant y seguridad

- Toda tabla de negocio lleva `businessId`. El token JWT resuelve el usuario; la
  cabecera `x-business-id` (o la primera membership) fija el tenant activo.
- **RBAC** por `MemberRole` (OWNER/ADMIN/MANAGER/EMPLOYEE/RECEPTIONIST/
  PROFESSIONAL/ACCOUNTANT). Acciones sensibles (aprobar vacaciones) exigen rol.
- El CRUD genérico filtra y crea **siempre** con el `businessId` del token.

## Motor de disponibilidad (`lib/availability.ts`)

`checkAvailability()` valida una franja contra: horario de apertura, festivos/
cierres, solape de empleado, ausencias aprobadas, compatibilidad servicio↔empleado
y **aforo** de cada recurso (capacity). `daySlots()` genera los huecos válidos de
un día. Es la pieza crítica y está aislada para poder testearla.

## Endpoints principales (todos bajo `/api`, requieren token salvo `/auth`)

- **Auth:** `POST /auth/register` (crea empresa+owner+sede), `POST /auth/login`,
  `GET /auth/me`.
- **CRUD multi-tenant:** `/locations`, `/employees`, `/customers`, `/services`,
  `/resources`, `/products`, `/sales`, `/campaigns`, `/fichajes`, `/tags`
  (GET, GET/:id, POST, PATCH/:id, DELETE/:id).
- **Reservas:** `GET /bookings`, `POST /bookings` (valida disponibilidad en
  transacción), `POST /bookings/check-availability` (franja o huecos del día),
  `PATCH /bookings/:id` (reprograma y revalida),
  `POST /bookings/:id/cancel|complete|no-show` (registra historial; `complete`
  consume bono si aplica).
- **Vacaciones:** `GET/POST /time-off`, `PATCH /time-off/:id/approve|reject`
  (rol manager+).
- **Bonos:** `GET/POST /packages`, `POST /packages/assign`,
  `POST /packages/customer-packages/:id/consume-session` (regla: no exceder ni
  caducado).
- **Dashboard:** `GET /dashboard/summary`.

## Reglas de negocio implementadas

R1 (no solape de empleado), R2 (aforo de recurso), R3 (servicio↔empleado
compatible), R5 (horario), R7 (festivos), R8 (ausencias bloquean), R9 (bono no
excede/caduca), R16 (no-show en historial). Ver `SDD_v1.md §11`.

## Conexión con el front

El front (`front/`) puede consumir esta API: define `NEXT_PUBLIC_API_URL` en
`front/.env.local` y `getBackend()` usará el backend REST automáticamente
(prioridad: API > Supabase > local). Ver `front/lib/api/client.ts` y
`front/lib/data/backend.ts`.

## Generador SQL de la consola (legado)

`schema/` + `scripts/build-schema.mjs` siguen disponibles para que la consola
genere paquetes `.sql` por módulos. El esquema **canónico** es ahora
`prisma/schema.prisma`.
