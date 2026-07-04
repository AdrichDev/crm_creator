# Tareas — crm-sectorial-ia

## ESTADO (2026-06-25)
Fases 1-5 (sector-data, picker, usage-client, tema, stats, provisión) YA estaban implementadas.
HECHO (subagente, integrado): arreglada fragilidad de teardown en auth e2e (guard `if(!backUp||!SB_URL) return`
en auth-users/auth-client-register.e2e) → back 53/0. (smoke ya estaba alineado en mi rama.)
DECISIÓN (2026-07-04): la nota anterior de bloqueo quedó obsoleta. `POST /ai/marketing-plan` y
`/ai/generate` YA existen en agents-agency (`back/src/routes/ai.ts:121-179`) y están documentados
como **generación server-to-server SIN metering de cliente**: es coste de PLATAFORMA (clave OpenAI
propia de AA), no descuenta `tokensUsed` del cliente. `deductTokens` sigue aplicando solo al chat
del agente. UC-6.3/AC-6.3.1 se actualizó en spec.md para reflejar esta decisión (Opción A: spec se
ajusta al código, no al revés). Sin deuda pendiente en este punto.


Orden de implementación. ✅ = hecho en esta entrega; ⏳ = fase siguiente.

## Fase 1 — Base testeable (esta entrega)
- [✅] T1. Arnés de tests: `vitest.config.ts`, `playwright.config.ts`, scripts y devDeps. (UC todas)
- [✅] T2. `lib/config/sector-data.ts`: `clientesMock`, `serviciosMock`, `documentosMock`,
  `clienteExtraFields`, por vertical. (UC-1, UC-2, UC-3)
- [✅] T3. Terminología `abogados`: `servicios` → "Tarifas". (UC-2.4)
- [✅] T4. `crm_project` en provisión + `clienteId` en payload; schema por sector. (UC-4)
- [✅] T5. Tests Vitest: `sector-data.test.ts`, `tenant-schema.test.ts`. (UC-1..4)

## Fase 2 — Cliente real + Datos
- [✅] T6. `lib/clients/picker.ts` (orden alfabético, top-20 + resto, filtro por nombre) + test. (UC-5)
- [✅] T7. Endpoint `GET /api/clients` proxy a agents-agency + `GET /api/clients/:id`. (UC-5.4)
- [✅] T8. Onboarding: paso con `<select>` de clientes (20 + scroll, filtro) y auto-relleno de Datos. (UC-5)
- [✅] T9. Guardar `id_cliente` en `crm_project` al crear. (UC-4.1)
- [✅] T10. E2E `e2e/onboarding-cliente.spec.ts`.

## Fase 3 — IA con tokens compartidos
- [✅] T11. Reutilizar selector modelo/effort de agents-agency en el CRM. (UC-6.1)
- [✅] T12. `lib/ai/usage-client.ts` + endpoints `/api/ai/*` proxy → agents-agency. (UC-6, UC-7)
- [✅] T13. UI "Generar con IA" (plan de marketing) con estado y manejo 402. (UC-6)
- [✅] T14. Tests `usage-client.test.ts` (fetch mock, manejo error, parseo uso). (UC-6.3 — DONE-SIN-METERING)

## Fase 4 — Estadísticas
- [✅] T15. Portar módulo `estadisticas` (UI idéntica a agents-agency) + estudios IA. (UC-7)
- [✅] T16. E2E `e2e/estadisticas.spec.ts`.

## Fase 5 — Tema claro/oscuro
- [✅] T17. `lib/theme/crm-theme.ts` (system/light/dark) + variables claras en `globals.css` + toggle. (UC-8)
- [✅] T18. Arreglar modo claro de agents-agency (`theme.ts`/CSS). (UC-9)
- [✅] T19. Tests `crm-theme.test.ts` + E2E `e2e/tema.spec.ts`.

## Verificación final
- [ ] `npm run test` y `npm run test:e2e` en verde (lo ejecuta el usuario; iteramos sobre fallos). — PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO.
- [✅] Confirmar que una generación del CRM NO incrementa `tokensUsed` del cliente (comportamiento
  esperado: coste de plataforma). Verificado por lectura de código en `ai.ts:121-125`; sin acción pendiente.

### Notas de integración (requieren entorno para validar)
- El proxy `/api/ai/generate` mapea `market-study → /api/market-studies` y `marketing-plan → /api/ai/marketing-plan`
  en agents-agency. `/api/market-studies` ya existe; **el endpoint `marketing-plan` puede tener que añadirse**
  en el backend de agents-agency (mismo patrón: genera + `deductTokens`).
- AA protege `/api` con sesión + CORS por allowlist. Para que el CRM (server-side) llame:
  añadir el origen del CRM a `CORS_ORIGINS` y definir un token de servicio (`AA_SERVICE_TOKEN`) aceptado
  por AA, o compartir sesión. Variables del CRM: `AA_API_URL`, `AA_SERVICE_TOKEN`.
