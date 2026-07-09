# Contrato de variables de entorno por tier de cliente

Fuente única del contrato de variables de entorno del CRM. `front/.env.example`
es la proyección de este documento para el caso tier 3 (cliente aloja todo);
este documento cubre los tres tiers de despliegue.

## 1. Los tres tiers

- **Tier 1 — el operador aloja back + DB.** Todas las variables de runtime de
  plataforma (`DATABASE_URL`, Supabase, `ANTHROPIC_API_KEY` propia del
  operador, SMTP, automatizaciones n8n) viven en el env de host del back del
  operador (Render u otro). Las claves de terceros PROPIAS de un cliente
  concreto (su OpenAI, su WhatsApp, su Google Maps) NO van en ese env
  compartido: viven en `TenantSecret`, el almacén por negocio de
  `crm-tenant-api-keys`:
  - Server-side (`scope=BACKEND_SECRET`) → las lee el back por negocio en
    runtime vía `getTenantSecret(businessId, name, { fallbackEnv })`.
  - Públicas de build (`scope=FRONTEND_PUBLIC` + `envVarName`) → las hornea el
    exportador como `NEXT_PUBLIC_*` en el `.env.local` generado.
  - Sin clave propia del negocio → fallback a la clave del operador, uso
    medible (`source='operator'`, ref. `crm-ai-proxy`).
- **Tier 2 — el operador aloja el back, la DB es del cliente.** Igual que
  tier 1, con una diferencia: `DATABASE_URL` (y `SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY` si el cliente trae su propio proyecto Supabase)
  apuntan a la base del cliente. **Regla vinculante de despliegue: una
  instancia de back AISLADA por cliente tier 2.** Nunca un back compartido con
  credenciales de DB de más de un propietario en el mismo env (R2). Es
  contrato de despliegue — no hay código multi-DB; cada instancia tier 2 es un
  clon del env de tier 1 salvo `DATABASE_URL`/Supabase.
- **Tier 3 — el cliente aloja todo (front y, si aplica, su propio back).** La
  entrega es el export de fuente limpia (`crm-export-clean-manifest`).
  `front/.env.example` es el contrato COMPLETO documentado: toda variable que
  el front puede consumir, con placeholder y comentario, **nunca valores
  reales** — ni siquiera los del tenant exportado (mismo principio que
  `crm-export-runtime-config`).

## 2. Reglas del contrato (normativas, no código)

- **R1 — un `BACKEND_SECRET` jamás sale del servidor.** Ni por HTTP
  (`GET /tenant-config` filtra por `scope=FRONTEND_PUBLIC` en la query,
  `crm-tenant-api-keys`) ni horneado en un export (`buildEnvContent` filtra
  por el mismo scope y revalida en profundidad, `crm-env-contract-tiers`).
- **R2 — tier 2 exige una instancia de back por cliente.** Prohibido un env
  compartido con credenciales de DB de más de un propietario. Automatizar el
  provisioning de esas instancias es una change futura si el volumen lo
  justifica; hoy es un proceso manual siguiendo este documento.
- **R3 — todo secreto `FRONTEND_PUBLIC` con `envVarName` es, por definición,
  público en el bundle JS.** Solo se marcan así claves diseñadas para
  exposición pública (p. ej. Google Maps) y restringidas por referrer/origen
  en la consola del tercero — responsabilidad del operador al dar de alta el
  secreto, no algo que el código pueda imponer.
- **R4 — sin clave propia del tenant para una integración con fallback, se
  usa la del operador y el uso es medible.** `getTenantSecret` devuelve
  `source: 'tenant' | 'operator'`; los consumidores futuros de metering
  (`crm-ai-proxy`, `crm-metering-core`) miden solo cuando `source='operator'`.

## 3. Tabla de variables

| Variable / secreto | Tier 1 (operador: back+DB) | Tier 2 (operador: back; DB cliente) | Tier 3 (cliente aloja todo) |
|---|---|---|---|
| `DATABASE_URL` (`?schema=crm`) | env host operador | env host operador, **apunta a DB del cliente**, instancia aislada (R2) | env del cliente |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | env host operador | env host operador (instancia aislada) | env del cliente |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` (operador) | env host operador (fallback medido, R4) | ídem | n/a — el cliente configura la suya si quiere IA propia |
| Clave IA propia del cliente (Anthropic/OpenAI) | `TenantSecret` `BACKEND_SECRET` (`getTenantSecret`) | `TenantSecret` `BACKEND_SECRET` | env del cliente (su propio back, si lo tiene) |
| Credencial WhatsApp del cliente | `TenantSecret` `BACKEND_SECRET` | `TenantSecret` `BACKEND_SECRET` | env del cliente |
| Clave Google Maps del cliente | `TenantSecret` `FRONTEND_PUBLIC` + `envVarName=NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → horneada en export | ídem | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` en su `.env.local` (documentada en `.env.example`) |
| `PLATFORM_API_URL` / `TENANT_ID` / `TENANT_API_KEY` (bridge runtime, `crm-export-runtime-config`) | horneadas por export | ídem | placeholders reservados en `.env.example`; solo aplican si el cliente decide seguir conectado a la plataforma del operador |
| `NEXT_PUBLIC_API_URL` | horneada por export (apunta al back del operador) | ídem | env del cliente (su propio backend, si lo tiene) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no aplica (el front no habla con Supabase directo en modo plataforma) | ídem | env del cliente, solo si su despliegue consume Supabase directamente desde el front |
| `NEXT_PUBLIC_BUSINESS_ID` | no aplica (resuelto por sesión/auth) | ídem | opcional — tenant activo por defecto en desarrollo, hasta tener auth/login real |
| `NEXT_OUTPUT_MODE` | build-time del operador (pipeline de export) | ídem | build-time del cliente, si recompila el front exportado |
| `AA_API_URL` / `AA_SERVICE_TOKEN` (bridge Operador/Telegram, `agents-agency`) | env host operador (integración interna, no forma parte del contrato tenant-facing) | ídem | n/a — integración interna del operador, no se exporta al cliente |
| `AUTOMATION_WEBHOOK_URL` / `AUTOMATION_WEBHOOK_SECRET` (n8n) | env host operador (opcional, fail-open) | env host operador (instancia aislada) | env del cliente, si mantiene su propio n8n |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_SECRET` / `GOOGLE_OAUTH_REDIRECT_URI` | env host operador (opcional) | env host operador (instancia aislada) | env del cliente |
| `SMTP_*` / `EMAIL_ENABLED` | env host operador | env host operador (instancia aislada) | env del cliente |
| `FRONT_URL` / `CORS_ORIGIN` / `TRUST_PROXY` / `PORT` | env host operador (infraestructura, nunca tenant-facing) | ídem | env del cliente |

## 4. Notas

- `NEXT_PUBLIC_TENANT_JSON` (config completa del tenant, en base64) NO se
  documenta en `.env.example`: la hornea siempre `buildEnvContent` en cada
  export (single-writer, `crm-export-clean-manifest`), nunca la rellena una
  persona a mano y cualquier placeholder rompería la decodificación.
- Variables de tooling de test (p. ej. `SMOKE_EMAIL`/`SMOKE_PASSWORD` de los
  specs de Playwright) quedan fuera de este contrato: no las consume la app en
  producción, solo scripts de verificación.
- Ninguna variable `BACKEND_SECRET` aparece jamás en `front/.env.example` ni
  en un `.env.local` generado (R1).
