# Validation: crm-operator-role-gate

## Historia de usuario

Como plataforma, quiero que solo usuarios con rol operador puedan invocar los proxies que
reenvían con `AA_SERVICE_TOKEN`, para que un usuario normal de un tenant no pueda disparar
generación IA ni estudios de mercado con privilegios de servicio.

## Criterios de aceptación

- AC1: token Supabase válido con `app_metadata.role === 'operator'` → guard devuelve `true`.
- AC2: token Supabase válido SIN rol operador (rol ausente, otro rol, o `user_metadata.role`
  intentando suplantar) → guard devuelve `false`.
- AC3: token inválido, ausente, env vars ausentes, respuesta no-200, body no parseable o
  error de red → guard devuelve `false` (fail-closed, comportamiento previo preservado).

## Escenario Given-When-Then

- Given un usuario autenticado en Supabase cuyo `app_metadata` no contiene `role: 'operator'`
- When llama a `POST /api/ai/generate` con su access_token como Bearer
- Then el proxy responde 401 y no se reenvía nada a agents-agency.

## Tests por tarea

| Tarea | Test | Estado |
|---|---|---|
| T1 guard con validación de rol | `require-operator.test.ts`: 200 + app_metadata.role=operator → true | pendiente |
| T1 | 200 + sin role / role distinto / role solo en user_metadata → false | pendiente |
| T1 | 401 de Supabase / body no-JSON / fetch throw / envs ausentes → false | pendiente |

Regla: tarea DONE solo con su test verde.
