# Validación — crm-front-roles-4

Historia: como CRM con un contrato de roles único (4 roles reales), quiero que el front no
declare ni mapee roles legacy inexistentes, para evitar ramas muertas y confusión.

## Criterios de aceptación (AC)

- **AC1**: `MemberRole` en `session.ts` es exactamente `'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CLIENT'`.
- **AC2**: `roleFromMembership('ADMIN')` = 'admin'; `('CLIENT')` = 'cliente';
  `('MANAGER')` = `('EMPLOYEE')` = `(undefined)` = 'trabajador'.
- **AC3**: No queda referencia a OWNER/RECEPTIONIST/PROFESSIONAL/ACCOUNTANT en código fuente
  (no test, no e2e) salvo el test defensivo `memberRoleLabel('OWNER')→'Usuario'`.
- **AC4**: `lib/data/backend.ts` (demo/localStorage) sin cambios.
- **AC5**: tsc limpio; CRM front suite verde.

## Por tarea (Given-When-Then + test)

### T.1 — session.ts
- **Given** `roleFromMembership`, **When** se llama con cada rol real (ADMIN/MANAGER/EMPLOYEE/CLIENT)
  y undefined, **Then** mapea según AC2. _Test: `tests/session.test.ts` describe roleFromMembership._

### T.2 — profile.ts
- **Given** el comentario del campo `role`, **When** se revisa, **Then** lista solo ADMIN/MANAGER/EMPLOYEE/CLIENT.
  _Test: revisión + tsc._

### T.3 — no regresión de labels
- **Given** `memberRoleLabel`, **When** recibe un valor fuera del enum (p.ej. 'OWNER'),
  **Then** devuelve 'Usuario'. _Test: `tests/sidebar-user.test.tsx` (sin cambios)._

### V — Verificación
- **Given** el cambio, **When** `npx tsc --noEmit` y `npm test`, **Then** tsc limpio y suite verde.
  _Test: CRM front (vitest)._
