# Proposal: crm-operator-role-gate

## Problema

`creador_CRM/front/lib/server/require-operator.ts` (`isAuthedOperator`) valida únicamente
que el caller tenga una sesión Supabase válida (`GET /auth/v1/user` → 200). No comprueba
ningún rol. Los proxies que lo usan reenvían a agents-agency con `AA_SERVICE_TOKEN`
(privilegio de servicio):

- `app/api/ai/generate/route.ts` — generación IA (coste financiero directo).
- `app/api/market-studies/[...path]/route.ts` — estudios de mercado.

Resultado: cualquier usuario autenticado de cualquier tenant (incluido rol CLIENT) puede
disparar generación con privilegios de servicio. Severidad CRITICAL (auditoría 03/07/2026).

## Solución

Validar rol de operador vía `app_metadata.role === 'operator'` en el usuario Supabase.
`app_metadata` solo es modificable server-side (service_role), nunca por el propio usuario —
a diferencia de `user_metadata`. La respuesta de `/auth/v1/user` ya incluye `app_metadata`,
así que el cambio no añade requests: se parsea el body en vez de mirar solo `r.ok`.

Fail-closed: sin body parseable, sin `app_metadata`, o rol distinto → `false`.

## Alcance

- `creador_CRM/front/lib/server/require-operator.ts` — única pieza de código de producto.
- Test unitario del guard (mock fetch).
- Operativa (manual, fuera de código): marcar usuario(s) operador reales con
  `app_metadata: { role: 'operator' }` vía Supabase Admin API / dashboard.

## Fuera de alcance

- Resto de hallazgos de la auditoría (contrato ops-crm, generar.mjs, gates QA).
- UI de gestión de operadores.
- Cambios en agents-agency.
