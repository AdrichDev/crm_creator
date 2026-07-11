# validation.md — crm-tenant-keys-freeform

## Historia de usuario
Como operador/admin de un negocio, quiero poder guardar cualquier variable de entorno que mi app
exportada necesite (ej. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, o cualquier
otra credencial de terceros no prevista en el catálogo curado) desde el panel "BD, API y Keys",
sin esperar a que se añada un slot nuevo en código.

## Criterios de aceptación
1. Los 5 presets existentes (OpenAI/Gemini/Anthropic/Maps/DATABASE_URL) siguen funcionando
   exactamente igual que hoy (guardar/probar/quitar) — sin regresión.
2. Puedo añadir una variable con nombre libre en formato `MAYUS_CON_GUION_BAJO` y un valor; queda
   guardada cifrada y aparece en el listado.
3. Si el nombre no cumple el formato (minúsculas, espacios, empieza por dígito), el front bloquea
   el guardado antes de llamar al backend, y si se fuerza la llamada igualmente, el backend
   también la rechaza (422).
4. Si el nombre empieza por `NEXT_PUBLIC_`, la variable queda marcada como pública y se hornea en
   el próximo export de esa app (`.env.local`); si no, queda marcada como secreta y NUNCA aparece
   en el bundle exportado.
5. No puedo crear una variable con nombre `NEXT_PUBLIC_TENANT_JSON` ni `NEXT_PUBLIC_API_URL`
   (colisión con las variables base del export).
6. Puedo borrar una variable libre ya creada.
7. "Probar conexión" solo está disponible para los 5 presets conocidos; para una variable libre no
   se ofrece esa opción (o devuelve error claro si se intenta forzar la llamada).

## Given-When-Then por tarea

**T3 — alta free-form**
- Given un negocio sin la key `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- When el admin hace PUT `/tenant-keys/:businessId/secrets/NEXT_PUBLIC_SUPABASE_ANON_KEY` con un
  `value` válido
- Then responde 200 con `scope: FRONTEND_PUBLIC`, `envVarName: NEXT_PUBLIC_SUPABASE_ANON_KEY`, y la
  fila queda cifrada en `TenantSecret`.
- Test: `back/src/routes/__tests__/tenant-keys.route.test.ts`.

**T3 — nombre reservado**
- Given cualquier negocio
- When el admin intenta PUT `.../secrets/NEXT_PUBLIC_TENANT_JSON`
- Then responde 422 `reserved_name`, sin crear fila.
- Test: mismo archivo.

**T4 — listado mixto**
- Given un negocio con `OPENAI_API_KEY` configurada y `STRIPE_SECRET_KEY` (free-form) configurada
- When GET `/tenant-keys/:businessId/secrets`
- Then la respuesta incluye ambas, cada una con su `scope` correcto (`BACKEND_SECRET` en ambos
  casos en este ejemplo) y `configured: true`.
- Test: mismo archivo.

**T5 — borrado free-form**
- Given una key free-form ya creada
- When DELETE `.../secrets/STRIPE_SECRET_KEY`
- Then responde 200 y un GET posterior ya no la incluye.
- Test: mismo archivo.

**T6 — test no disponible**
- Given una key free-form sin `provider` conocido
- When POST `.../secrets/STRIPE_SECRET_KEY/test`
- Then responde 400 `not_testable` sin invocar `testProviderConnection` ni consumir rate-limit.
- Test: mismo archivo, mock de `testProviderConnection` con contador de llamadas en 0.

**T8 — UI añadir fila**
- Given el panel abierto en un negocio
- When el usuario escribe `NEXT_PUBLIC_FOO` + un valor en la fila draft y pulsa "Agregar"
- Then se llama `upsertSecret(businessId, 'NEXT_PUBLIC_FOO', valor)`, la fila pasa a la lista
  persistida con badge "Pública", y aparece una nueva fila draft vacía.
- Test: `front/tests/tenant-keys-panel.test.tsx`.

**T9 — smoke export (manual, usuario)**
- Given "Comercial Demo IA" con `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  guardadas vía el panel nuevo
- When se genera un nuevo export de esa app y se abre el login
- Then YA NO aparece "Supabase no configurado"; el login contra Supabase funciona.
- Verificación: manual del usuario, no automatizable (credenciales reales de terceros).

## Estado
Todo PROPUESTO — nada implementado todavía. Task DONE solo cuando su test correspondiente esté
verde (regla de oro del repo).
