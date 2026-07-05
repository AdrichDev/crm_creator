# Tasks — crm-cliente-solo-mi-cuenta (Nivel 2, posible 3)

## Dependencia: requiere `crm-perfil-editable` (página "Mi Cuenta").

## A — Gating de módulos
- [x] A.1 `lib/config/roles.ts`: `ROLE_MODULES.cliente` → quitar `'configuracion'`, añadir destino "Mi Cuenta" (`mi-cuenta`/`/cuenta`).
- [x] A.2 Quitar `WRITE_EXCEPTIONS.cliente` (reemplazado por `mi-cuenta`).
- [x] A.3 Definir el módulo/ruta "Mi Cuenta" accesible a todos los roles (`mandatory: true` en `modules.ts`, icon `UserCircle`, href `/cuenta`).

## B — Guard de ruta (front)
- [x] B.1 Si `role==='cliente'` navega a `/configuracion` (o subrutas admin) → redirect a `/cuenta`. Implementado en `sidebar.tsx` vía `useEffect`.
- [x] B.2 Centralizado con `moduleFromPath` + `moduleAllowedForRole` (cualquier ruta no permitida → redirect a `/cuenta` para cliente, `/panel` para otros roles).

## C — Authz server-side (verificar/añadir)
- [x] C.1 Auditado (diseño confirma): `back/src/routes/index.ts:38` monta `staffOnly` como gate global; endpoints admin responden 403 a token CLIENT. No hay BUG de authz.
- [x] C.2 No requiere trabajo adicional. Nivel permanece en 2.

## D — Tests
- [x] D.1 `moduleAllowedForRole('cliente','configuracion')` === false. `canWrite('cliente','configuracion')` === false. Verde.
- [x] D.2 Guard: lógica subyacente testada (`moduleFromPath` + `moduleAllowedForRole`). Admin entra a configuracion. Cliente en /configuracion → debería redirigir. Verde.
- [x] D.3 Omitido por diseño: back auditado como seguro; test e2e de 403 queda fuera de harness vitest del front.

## Verificación
- [x] V.1 sidebar: `moduleAllowedForRole('cliente','configuracion') === false` → Configuración no entra en `active`. `mi-cuenta` es `mandatory` + permitido → aparece.
- [x] V.2 Guard en `sidebar.tsx` redirige cliente desde `/configuracion` a `/cuenta`. Página `/cuenta` ya existe.
- [x] V.3 Admin/trabajador: ROLE_MODULES.admin = '*', trabajador incluye `mi-cuenta` explícitamente; configuracion se mantiene para admin. `tsc` limpio. 170 tests verde.

## Tras verde: gate Agentic Runtime antes de commit.
