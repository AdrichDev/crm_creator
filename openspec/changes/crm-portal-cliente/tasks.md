# Tasks — crm-portal-cliente   (Nivel 3; sube a 4 si Decisión B = migración)

> Bloqueado por decisiones A/B/C (ver proposal). Core (perfil/citas/bonos) es firme.

## Fase 0 — Decisiones (humano)
- [ ] 0.1 Decisión A (catálogo lectura para cliente: sí/no).
- [ ] 0.2 Decisión B (facturas del cliente ahora: sí→migración / no).
- [ ] 0.3 Decisión C (set de vistas del portal).

## Fase 1 — Front core (firme)
- [ ] 1.1 `lib/api/me.ts`: `getMyProfile/getMyBookings/getMyPackages`.
- [ ] 1.2 `apiBackend` (backend.ts): remapeo por rol `cliente` (`citas→/me/bookings`, staff-only→`[]`, writes no-op).
- [ ] 1.3 Vista "Mis bonos" (panel simple `/me/packages`) + "Mis citas" (citas solo lectura) + "Mi perfil".
- [ ] 1.4 Ajustar `ROLE_MODULES.cliente` al set final.

## Fase 2 — Catálogo  [si A=sí]
- [ ] 2.1 Guard `staffOrClient` (GET permite CLIENT, escritura staff) + mover `services/products/locations`.
- [ ] 2.2 Test back: `CLIENT GET catálogo 200, POST/PATCH/DELETE 403`.

## Fase 3 — Facturas del cliente  [si B=sí → Nivel 4, human approval migración]
- [ ] 3.1 Migración `Invoice += customerId String?` (sin DROP).
- [ ] 3.2 `/me/invoices` scoped por Customer.
- [ ] 3.3 Front facturas cliente + test.

## Verificación
- [ ] V.1 Front `npm test` + tsc. Flujo manual cliente: perfil/citas/bonos sin 403, sin datos de terceros.
- [ ] V.2 Back tests según A/B. Reaudit RBAC (catálogo no expone PII).
