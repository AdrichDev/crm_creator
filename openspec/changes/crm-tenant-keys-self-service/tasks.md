# Tareas — crm-tenant-keys-self-service

Alcance: pestaña de autoservicio en Configuración que monta el componente compartido
`TenantKeysPanel` (de `crm-onboarding-tenant-keys`) con el `businessId` de la sesión propia, gateada
por el `MemberRole` crudo (`ADMIN`/`MANAGER`). Front-only salvo tests. Nivel 2. Sin migración. NO se
crea backend, catálogo, `provider-test` ni componente: se REUTILIZAN de `crm-onboarding-tenant-keys`.
Orden por dependencia (verificación de reutilizables → pestaña + gate → tests). TODO es PROPUESTA.

## WU0 — Dependencia dura (bloqueo global)
- [x] 0.1 Confirmar que `crm-onboarding-tenant-keys` ha aterrizado: existen los endpoints
  `/tenant-keys/:businessId/secrets[...]`, el catálogo (`back/src/lib/tenant-secrets/catalog.ts`),
  `testProviderConnection` (`back/src/lib/tenant-secrets/provider-test.ts`), el cliente
  `front/lib/api/tenant-keys.ts` y el componente `front/components/config/tenant-keys-panel.tsx`.
  **Si no han aterrizado, TODA esta change queda BLOQUEADA** (no hay nada que montar).

## WU1 — Rol crudo disponible (solo verificación, sin código)
- [x] 1.1 Confirmar que `GET /auth/me` (`back/src/routes/auth.ts:56-69`) ya expone `role: req.role`
  crudo — sin cambio de código; test de regresión (si no existe) que fija `role` a nivel raíz para
  los 4 `MemberRole`.
- [x] 1.2 Confirmar que `getAuthProfile()` (`front/lib/api/profile.ts`) ya devuelve `role` crudo y
  que el tipo `AuthUserProfile.role` cubre los 4 valores — sin ajuste de tipos.

## WU2 — Pestaña + gate en Configuración (front)
- [x] 2.1 `front/app/(crm)/configuracion/page.tsx`: nuevo estado `memberRole` (`useState<string | null>(null)`)
  poblado en un `useEffect` que llama `getAuthProfile()` cuando `apiEnabled` (mismo patrón que el
  `useEffect` de horario ya existente); en fallo, `memberRole` queda `null` (fail-closed).
- [x] 2.2 `Tab` gana `'claves-api'`; `TAB_LABEL['claves-api'] = 'Claves API'`; `TABS` incluye
  `'claves-api'` solo si `apiEnabled && (memberRole === 'ADMIN' || memberRole === 'MANAGER')`
  (independiente de `isAdmin`).
- [x] 2.3 Render: `{tab === 'claves-api' && apiEnabled && (memberRole === 'ADMIN' || memberRole === 'MANAGER') && (<Card><CardBody><TenantKeysPanel businessId={activeBusinessId} /></CardBody></Card>)}`,
  pasando el `businessId` de la sesión activa. La condición se repite en el render además de en `TABS`
  (defensa en profundidad).

## WU3 — Tests
- [x] 3.1 `configuracion-page.test.tsx`: `getAuthProfile()` mockeado con `role: 'EMPLOYEE'` → pestaña
  ausente y contenido no renderizado aunque se fuerce `tab='claves-api'`; `role: 'MANAGER'`/`'ADMIN'`
  → pestaña presente; `role` no resuelto (`null`) → oculta (fail-closed).
  (Implementado en `front/tests/configuracion-claves-api-tab.test.tsx`, 7 casos, verde.)
- [ ] 3.2 (Opcional) Añadir un caso de aislamiento cross-tenant desde la perspectiva self-service a la
  suite compartida `tenant-keys.route.test.ts` (propiedad de `crm-onboarding-tenant-keys`) SOLO si
  aporta cobertura no cubierta ya — sin duplicar la suite.

## Cierre
- [x] Z.1 `tsc` limpio en `front/` (y `back/` si se toca la suite compartida). — `npx tsc --noEmit` exit 0, back sin tocar.
- [x] Z.2 Suite relevante de `front/` verde (WU3); la suite del backend compartido ya la cubre
  `crm-onboarding-tenant-keys`. — 20/20 verde (nuevo tab test 7 + panel 11 + horario 2).
- [ ] Z.3 Revisión de seguridad dedicada de la superficie front antes de cualquier push (foco: la
  pestaña no se muestra a `EMPLOYEE`/`CLIENT`; el `businessId` pasado al panel es siempre el de
  sesión; ningún valor de secreto se renderiza). Pendiente de humano/reviewer dedicado, no se marca
  DONE por autoverificación.
- [x] Z.4 Registrar en Engram el patrón "gate de pestaña por `MemberRole` crudo vía `getAuthProfile()`"
  y que esta change REUTILIZA el backend/componente de `crm-onboarding-tenant-keys` (no los duplica).
  — Engram obs #850 (apply-progress) + #851 (conventions/tab-gate-memberrole-crudo).
