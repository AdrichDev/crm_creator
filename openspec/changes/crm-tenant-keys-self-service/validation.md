# Validación — crm-tenant-keys-self-service

Historia: como **ADMIN o MANAGER de un negocio** en el panel CRM, quiero gestionar mis propias claves
de OpenAI/Gemini/Anthropic/Google Maps y mi URL de BD desde la pestaña de Configuración, reutilizando
el mismo panel que usa el onboarding, sin pedirle al operador que las gestione por mí, para activar o
rotar mis integraciones cuando lo necesite.

## Criterios de aceptación (AC)
- **AC1 (reutiliza, no duplica):** esta change NO crea backend, catálogo, `testProviderConnection` ni
  componente propios; monta el `TenantKeysPanel` compartido de `crm-onboarding-tenant-keys` y consume
  sus endpoints `/tenant-keys/:businessId/secrets[...]`.
- **AC2 (businessId de la sesión propia):** el `businessId` que el panel pone en el path de los
  endpoints es el de la sesión activa del usuario; el backend compartido lo valida contra la
  `Membership` del `req.userId` (patrón `projects.ts:111`).
- **AC3 (cross-tenant imposible):** dado un usuario con `Membership` solo en el negocio A, ningún
  payload/param/header permite que una operación afecte o exponga datos del negocio B; un `:businessId`
  ajeno cae en el 404 del `membership.findFirst` del backend compartido (garantía heredada, verificada
  en la suite de `crm-onboarding-tenant-keys`).
- **AC4 (403 para EMPLOYEE/CLIENT):** un usuario `EMPLOYEE`/`CLIENT` recibe 403 en los endpoints
  compartidos (gate de rol del backend), y la pestaña ni siquiera se le muestra.
- **AC5 (pestaña gateada por `MemberRole` crudo):** la pestaña "Claves API" es visible únicamente
  cuando el `MemberRole` real (de `GET /auth/me` vía `getAuthProfile()`) es `ADMIN` o `MANAGER`;
  oculta para `EMPLOYEE` (que colapsa a `'trabajador'` como `MANAGER`), `CLIENT`, y mientras el rol no
  se ha resuelto (fail-closed).
- **AC6 (valor nunca legible):** ningún endpoint devuelve el valor de un secreto, ni al propio dueño;
  ningún render de la pestaña muestra el valor (garantía del componente compartido).

## Por tarea (Given-When-Then + test)
- **WU0** Dependencia dura → Given `crm-onboarding-tenant-keys` no aterrizada, When se intenta montar
  la pestaña, Then no hay componente ni endpoints que usar → change BLOQUEADA hasta que aterrice. (Sin
  test; es una precondición.)
- **WU1.1** Rol crudo en `/auth/me` → Given un usuario `MANAGER`, When `GET /auth/me`, Then la
  respuesta trae `role: 'MANAGER'` a nivel raíz (no colapsado). Test: regresión sobre `auth.ts`.
- **WU1.2** Rol crudo en el front → Given `getAuthProfile()`, When se llama, Then devuelve `role`
  crudo y el tipo cubre los 4 valores. Test: verificación de tipos (sin ajuste).
- **WU2/WU3.1** Pestaña gateada → Given `getAuthProfile()` mockeado con `role: 'EMPLOYEE'`, When
  `ConfiguracionPage` monta, Then `TABS` no incluye `'claves-api'` y el contenido no se renderiza
  aunque se fuerce `tab='claves-api'`; Given `role: 'MANAGER'`/`'ADMIN'`, Then la pestaña aparece y
  monta `<TenantKeysPanel businessId={activeBusinessId} />`; Given `role` `null`, Then oculta. Test:
  `configuracion-page.test.tsx`.
- **WU3.2 (opcional)** Aislamiento cross-tenant self-service → Given 2 negocios A/B y un usuario
  miembro solo de A, When se opera con el `businessId` de sesión (A), Then B no se ve afectado; un
  `:businessId = B` cae en 404. Test: caso adicional en la suite compartida, solo si no está cubierto.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.
> WU0 es una precondición dura: esta change entera queda BLOQUEADA hasta que
> `crm-onboarding-tenant-keys` aterrice el componente y los endpoints compartidos.

## Estado
PROPUESTA — sin iniciar. Front-only salvo tests. Depende de `crm-onboarding-tenant-keys` (dueña del
backend y del componente compartidos; bloqueante global), `crm-tenant-api-keys` (modelo de datos, ya
aterrizada) y `crm-tenant-secrets-runtime-maps` (reflejo runtime de Maps, consumido por el componente
compartido). Su aporte propio (pestaña + gate por `MemberRole` crudo) es ejecutable en cuanto el
componente compartido exista.
