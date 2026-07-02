# Diseño técnico — crm-castellano-supabase-total

## 1. Convención de rename castellano (Prisma)
- Renombrar el **identificador de campo** del modelo (no la columna): `firstName String @map("nombre")`
  → `nombre String @map("nombre")`. La columna ya está en castellano (`@map`/`@@map`) por
  [[rename-castellano-db]] → **sin migración de BD**.
- NO renombrar infra: `id`, `businessId`, `userId`, `locationId`, FKs `*Id`, `createdAt`,
  `updatedAt`. Motivo: `crudRouter` genérico ordena por `createdAt`; las relaciones Prisma y
  los `where` los usan. Son invisibles para el usuario.
- Actualizar `@@index([...])` que referencien campos renombrados.
- Enums: valores se quedan (ACTIVE, etc.); se traducen en el front (etiquetas) o se mapean en
  la ruta si el front filtra por texto.
- Tras cada bloque: `npx prisma generate` (PARAR el back dev antes; tsx watch bloquea el
  engine → EADDRINUSE/EPERM). Matar TODOS los PID de :4001 y confirmar libre.

## 2. Patrón de ruta por módulo
- Si el shape del front == columnas (rename directo): seguir con `crudRouter(model, {fields:[...español...]})`.
- Si el front necesita **derivados/forma combinada**: router dedicado (como
  `customers.ts`): GET con `groupBy`/cálculo, POST/PATCH con whitelist y mapeo.
- El back devuelve EXACTAMENTE las claves que la página lee (contrato = el shape del mock
  español de `lib/mock/data.ts`, que es la fuente de verdad del front).

## 3. Mapa por módulo (campo front ← modelo/derivado)
- **clientes** (HECHO, `customers.ts`): nombre(=nombre+apellido), email, telefono, direccion,
  visitas(count Booking), gastoTotal(sum Sale.total), ultimaVisita(max Booking.inicia), segmento(regla).
- **servicios** (Service): nombre←name, categoria←category, duracion←durationMin, precio←price,
  activo←active. Renombrar Service campos a español.
- **empleados** (Employee): nombre←firstName, apellido←lastName, email, telefono←phone,
  especialidad←specialty, estado←status, color. Derivados si la página los pide (ej. citasHoy).
- **citas** (Booking): denormaliza cliente/servicio/empleado nombre. Router dedicado:
  fecha/hora←inicia_en, cliente←Booking.customer.nombre, servicio←service.name, empleado←employee,
  estado←status (map a etiqueta). Ya hay `bookingsRouter`; alinear shape.
- **productos** (Product): nombre←name, categoria←category, stock, minimo←stockMinimo,
  precio←price, proveedor←supplier.
- **ventas** (Sale): cliente←customerName, fecha←date, metodo←paymentMethod, total, items←lines.
- **facturas** (Invoice): YA casa (numero/cliente/servicio/fecha/total/estado/documentos).
- **marketing** (Campaign): nombre←name, canal←channel, estado←status, enviados←sent, aperturas←opens.
- **fichaje** (Fichaje): empleado←employeeName, fecha←date, entrada←checkIn, salida←checkOut, horas←hours.
- **vacaciones** (TimeOffRequest): empleado, tipo←type, inicio←startAt, fin←endAt, estado←status.

> Para cada módulo se confirmará el shape exacto leyendo `lib/mock/data.ts` + la página antes
> de tocar el back (evita inventar campos).

## 4. Consola de agencia (Supabase, sin localStorage)
- Back: `GET /api/businesses` (negocios accesibles por el usuario vía Membership; owner global
  ve todos), `POST /api/businesses` (crea Business + Membership OWNER). Reutiliza lógica de
  `auth.ts` register.
- Front `app/(dashboard)/page.tsx`: lista desde `/api/businesses` (no `useProjects` localStorage);
  "Nuevo CRM" → POST; "Abrir" → set `saas.business.id` (única clave local admitida: selección de
  tenant activo) → `/panel`.
- `tenant-config-context`: deja de gestionar proyectos localStorage; el "activo" = businessId de
  sesión/selección; config desde `/api/auth/me`.
- `app-shell`: "Volver al home" → `/` (consola). Botón "Salir" separado → logout.
- En modo API, `/` muestra la consola (NO redirige a /panel). Sin sesión → `/login`.

## 5. Auditoría de tablas
Por modelo: listar columnas; marcar USADA (ruta o front) / MUERTA. Quitar muertas confirmadas
(solo si 0 referencias en back y front y no son infra/relación). Documentar en validation.md.
Campos que el front necesita y no existen → derivar en ruta (preferido) o añadir columna
(migración aditiva si imprescindible).

## 6. Limpieza local restante
- Quitar `localBackend` mock como fallback en modo API (HECHO parcial). `lib/supabase/client.ts`
  `saas.tenant.id` → derivar de sesión. Disponibilidad chips y documentos → fase D2 (Storage):
  si no se aborda hoy, dejar marcado SIN romper (no es dato de negocio crítico).

## 8. DECISIONES CONFIRMADAS (2026-06-25, usuario)
1. **"Proyecto" = `Business`** (reusar; ya tiene `tenantId @unique` 1-1 con `aa.tenant`). Castellanizar
   TODO lo inglés salvo `tenant`/`tenant_id` y poca infra. Config (módulos/terminología/branding extra)
   → `BusinessSetting` (cablear el modelo "muerto", NO borrar).
2. **`/dashboard`** = vista única con TODOS los proyectos. Login → /dashboard. El dueño agencia (yo)
   ve todos los proyectos creados/por crear (scoped por su Membership OWNER).
3. **Tenant**: se da de alta en **AA**. En creador_CRM SOLO se usa como FK del proyecto. **No se puede
   crear proyecto sin tenant existente** (validar). Pasar todos los tenants actuales a Supabase.
   → **DISEÑO**: como AA+CRM comparten 1 Supabase, creador_CRM back lee `aa.tenant` por `prisma.$queryRaw`
   (cross-schema, misma conexión). `GET /api/tenants` reemplaza el proxy HTTP AA roto (no se arregla AA).
   Crear Business valida que `tenant_id` existe en `aa.tenant`.
4. **Migración**: proyectos y tenants de localStorage → Supabase. **softDelete ahora** (columna
   `eliminado_en`/`activo`), hardDelete en producción.

## 9. Modelo de borrado (soft delete)
Añadir `deletedAt DateTime? @map("eliminado_en")` (o reusar `activo`) a las tablas con borrado de
usuario (Business/proyecto, Customer, Service, Product, Booking, etc.). Las listas filtran
`deletedAt = null`. DELETE de ruta → set `deletedAt = now()`. Hard delete se hará en producción.

## 7. Riesgos
- Rename masivo: `tsc` del back es la red de seguridad (caza toda referencia). Hacer por módulo
  + tsc + test tras cada uno.
- Procesos back zombi en :4001 sirviendo código viejo → protocolo matar-todo-PID + verificar.
- e2e contra Supabase compartido: solo lectura; no ensuciar seed.
