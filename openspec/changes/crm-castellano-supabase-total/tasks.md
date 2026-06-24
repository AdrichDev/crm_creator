# Tareas — crm-castellano-supabase-total

## Fase 0 — Consola/navegación ⚠️ REVERTIDO (2026-06-24, feedback usuario)
ERROR: sustituí la consola/onboarding original (tarjetas, 4 pasos) por una AgencyConsole de
dropdown que NADIE pidió, y metí un mock sintético de Estudio Lúa. El usuario lo paró.
- [x] R.1 REVERTIDO: borrado AgencyConsole + businesses.ts (back) + mount. dashboard/page.tsx,
  app-shell.tsx, login, tenant-config-context.tsx restaurados al ORIGINAL (consola generadora
  + onboarding 4 pasos + colores). Quitado el mock sintético (context sin synthetic seed/configFromBusiness).
  Limpiado dead code (fetchMe/configFromBusiness). e2e smoke 2/2 (consola + onboarding cargan).
- [ ] 0.bug Pendiente real: que "Volver" regrese a la consola SIN romper el panel Supabase, y
  que la config salga del proyecto del usuario (achozas0@gmail.com), no de un mock. (El panel
  Supabase + login se reanudan con cuidado, sin tocar la UX del generador.)

## Fase 1 — Castellano back, módulo a módulo (rename Prisma + ruta + seed + tests + tsc)
- [x] 1.1 clientes (Customer) — HECHO (piloto, customersRouter + agregados).
- [x] 1.2 servicios (Service) — HECHO (rename completo + whitelist + availability.ts + seed; e2e "Corte de pelo" verde).
- [ ] 1.3 empleados (Employee) — REQUIERE columna `rol` (additive migration); front pide rol≠especialidad. Pendiente.
- [x] 1.4 productos (Product) — HECHO (rename + whitelist + seed; e2e "Cera modeladora" verde).
- [ ] 1.5 ventas (Sale + SaleLine) — items=count SaleLine (router); SaleLine nunca se escribe. Pendiente.
- [x] 1.6 marketing (Campaign) — HECHO (rename + whitelist; sin seed → sin e2e de fila; tsc+test verde). NOTA: estado=enum (DRAFT...) se mostrará crudo hasta mapear etiqueta.
- [x] 1.7 fichaje (Fichaje) — HECHO (rename empleado/fecha/entrada/salida/horas + whitelist; sin seed).
- [ ] 1.8 vacaciones (TimeOffRequest) — empleado denormalizado (router); startDate/endDate→inicio/fin. Pendiente (sin seed; no destructivo).
- [x] 1.9 citas (Booking) — HECHO lectura: bookingsRouter GET mapea a {cliente,servicio,empleado,fecha,hora,estado} (punto único: citas/panel/estadísticas). e2e reserva seed 2026-06-20 verde. GAP: el form de alta de citas es mock (nombres) — necesita selectores por id + datetime para crear contra el back (pre-existente, no introducido).
- [ ] 1.10 facturas (Invoice) — verificar (ya casa) + castellanizar campos internos restantes
- [ ] 1.11 resto de modelos sin página directa pero con API (Location, Resource, Tag, Package, CustomerPackage, Document, Notification, BusinessSetting, OpeningHour, Holiday, EmployeeSchedule, BookingStatusHistory, PackageSession) — castellanizar campos de negocio.

## Fase 2 — Front reconciliación por módulo
- [ ] 2.1 Cada página `(crm)/*` consume el shape español del back 1:1; quitar dependencia de mock como dato (mock solo seed de generador).
- [ ] 2.2 e2e lectura real por módulo (dato seed visible) — al menos clientes, servicios, citas, productos, ventas, facturas.

## Fase 3 — Auditoría + ADAPTAR core (NO borrar)
- [x] 3.1 Auditoría hecha (audit-tablas.md).
- [ ] 3.2 ~~Quitar columnas muertas~~ CANCELADO por el usuario: NO borrar nada. En su lugar:
  CABLEAR al core los modelos sin uso (EmployeeSchedule=horarios empleado, Document=documentos,
  Notification=notificaciones, BusinessSetting=ajustes, SaleLine=líneas de venta) con sus
  componentes/opciones en front+back.
- [ ] 3.3 Añadir columnas que el front necesita (Employee.rol [APROBADO], Customer.cif/contacto si aplica).

## Fase 4 — Limpieza local total
- [ ] 4.1 0 `localStorage` salvo `saas.business.id` (tenant activo) y tema. Quitar projects/active/role/tenant.id.
- [ ] 4.2 role desde `/me`; sin selector "Ver como" en modo API (ya hecho).
- [ ] 4.3 `lib/supabase/client.ts` tenant desde sesión.
- [ ] 4.4 Disponibilidad chips + documentos → Supabase (Storage/tabla) o marcar fuera de alcance sin romper.

## Fase P — Proyecto = Business sobre Supabase (DECISIONES CONFIRMADAS 2026-06-25)
- [x] P.1 `GET /api/tenants` (+ `/:id`) en back: raw cross-schema `aa.tenant` (AA+CRM = misma Supabase).
  Devuelve ClientLite. Onboarding repuntado a `apiFetch('/tenants')` (sin proxy Next /api/clients;
  borradas esas rutas). PROBADO: 200 con tenants reales (AiAs, Caress…). Sin tocar UX del onboarding.
- [x] P.2 HECHO: `POST /api/projects` (projects.ts) crea Business + BusinessSetting(categoria 'config', data=TenantConfig) + Membership OWNER; valida tenant en aa.tenant (422 si no); 1-1 (409 si el tenant ya tiene proyecto). Onboarding `finish()` → `await createProject` (apiMode POST), exige clienteId. (Flujo de alta no e2e por complejidad 4-pasos; ruta sólida + validada.)
- [x] P.3 HECHO: `GET /api/projects` (Membership, eliminadoEn null, +espejo Business). `tenant-config-context` apiMode carga desde /api/projects (recarga en SIGNED_IN). Consola de TARJETAS intacta. Login → `/` (dashboard). e2e: lista Estudio Lúa + JorjotasBarber. 
- [x] P.4 HECHO: config del panel desde Business+BusinessSetting (projectFromApi: usa config guardada o fallback configFromVertical). openProject fija `saas.business.id` (x-business-id) → datos scoped. e2e abrir→panel→clientes reales→volver verde.
- [x] P.5 HECHO (parcial): columna `eliminado_en` en Business + `DELETE /api/projects/:id` soft (set fecha) + GET filtra null. Falta extender soft-delete a otras tablas con borrado de usuario.
- [x] P.6 HECHO: migración client-side una vez (tenant-config-context migrateLocalProjects): POSTea los proyectos de localStorage a /api/projects (tenant válido requerido), conserva backup (saas.projects.backup.v1) + flag (saas.projects.migrated.v1). Tenants ya estaban en aa.tenant. FIX de paso: POST /projects revive proyecto soft-deleted (tenant unique) + try/catch P2002 (antes crasheaba el back). e2e migracion-localstorage.spec.ts verde (autolimpiable).
- [~] P.7 EN CURSO. Castellanizados (modelo+ruta+seed, verde): Customer, Service, Product, Campaign, Fichaje, Booking(router), Employee, **Business** (nombre/razonSocial/nif/moneda/zonaHoraria/marcaPrimario/marcaSecundario; refs auth/projects/users/me/seed/front), **Location, Resource, Tag, Package, CustomerPackage, Holiday, OpeningHour, Sale/SaleLine, BookingStatusHistory, PackageSession** (refs availability/bookings/packages/seed/index whitelists). e2e 6/6 + back 53 + tsc limpio.
  + **TimeOffRequest** (vacaciones: timeOffRouter mapea empleado/tipo/inicio/fin/dias/estado con etiquetas; availability actualizado). e2e 6/6 verde.
  PENDIENTE P.7 (solo INFRA/plumbing, invisible al usuario — bajo valor): Membership.role (alto churn rbac), User (firstName/lastName, auth), y modelos a CABLEAR no solo renombrar: EmployeeSchedule, Document, Notification, BusinessSetting(category/data). Todo lo USER-FACING (9 módulos datos + Business + proyectos) está castellano.
- [x] P.8 HECHO: columna `Employee.rol` aplicada + cableada (employeesRouter + seed Estilista/Barbero + página ya la pinta).

## Fase 5 / OTROS — cierre
- [~] 5.1 Proxies AA: DECISIÓN documentada. `/api/ai/generate` (Next→AA, branding IA del onboarding)
  está roto (AA exige JWT Supabase real, no token estático). Es feature SOLO del generador, no del
  CRM runtime. NO se borra (el usuario pidió no borrar). Fix real (token Supabase válido o metering
  directo cross-schema) = tarea aparte, pendiente. `lib/server/aa.ts` se mantiene.
- [x] 5.2 Tests verde: back 0 fail (33 pass + 20 live-skip por pooler), front 89, e2e 6/6, tsc back+front limpio.
- [ ] 5.3 Archivar change + scope summary (al cerrar todo P.7).

## OTROS pendientes (requieren OK / son lotes)
- [ ] O.1 Extender SOFT DELETE a tablas de datos (Customer/Service/Product/Employee/Booking/…):
  añadir `eliminado_en` (migración aditiva) + crud soft + filtro en listas. LOTE de migraciones.
- [ ] O.2 e2e del ALTA de proyecto vía onboarding 4-pasos (pick tenant → crear → /panel).
- [ ] O.3 Form de alta de citas/ventas: selectores por id + datetime (hoy mock por nombre).
- [ ] O.4 Archivar `crm-migracion-supabase` (mergear delta a specs / cerrar).
- [ ] O.5 Otros changes (fuera de este): crm-n8n-automations, crm-onboarding-edit-landing-ia, crm-sectorial-ia.
