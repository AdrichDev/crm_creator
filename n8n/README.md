# Automatizaciones n8n — CRM

Integración CRM ↔ n8n. El back emite **eventos de dominio** firmados (HMAC) hacia un
único webhook de n8n; n8n verifica la firma, deduplica y envía el email correspondiente.

> Principio rector: **el CRM nunca depende de n8n.** Si n8n cae, `emit()` hace fallo suave
> y el flujo de negocio sigue. n8n es un consumidor best-effort.

## Arquitectura (Fase 1)

```
back/src/lib/automation/emit()  --POST firmado-->  n8n Webhook (/webhook/crm-automation)
                                                      └─ Verify & Route (Code): HMAC + replay + idempotencia
                                                          ├─ auth_failed              → 401
                                                          ├─ user.invited             → Email: alta usuario → 200
                                                          ├─ password.reset_requested → Email: reset         → 200
                                                          └─ fallback (duplicate/desconocido) → 200
```

Un solo webhook porque el back usa una sola `AUTOMATION_WEBHOOK_URL`. El enrutado por
tipo de evento ocurre dentro de n8n (header `X-Automation-Event` / campo `name`).

## Seguridad del webhook (V.2)

- **Firma**: `X-Automation-Signature = HMAC-SHA256(secret, "${timestamp}.${rawBody}")` en hex.
  El nodo *Verify & Route* recomputa el HMAC reconstruyendo el envelope en el **mismo orden de
  claves** que firma el back (`eventId,name,businessId,occurredAt,data`). Comparación en tiempo
  constante (`timingSafeEqual`).
- **Anti-replay**: ventana de 5 min sobre `X-Automation-Timestamp`.
- **Idempotencia**: `eventId` guardado en *workflow static data*; un reenvío → ruta `duplicate` → 200 sin reenviar email.
- **PII mínima**: las plantillas solo usan `firstName` + enlace con token de un solo uso. Sin contraseñas en claro, sin logs de `data`.
- **Secreto**: `AUTOMATION_WEBHOOK_SECRET` debe ser idéntico en el back y en el contenedor n8n.

## Puesta en marcha (Fase 0.1)

1. **Variables** (`.env` en la raíz del repo / entorno del back):
   ```env
   AUTOMATION_WEBHOOK_URL=http://localhost:5678/webhook/crm-automation
   AUTOMATION_WEBHOOK_SECRET=<secreto-largo-aleatorio>   # mismo valor en back y n8n
   N8N_ENCRYPTION_KEY=<clave-cifrado-credenciales-n8n>
   # opcionales (defaults en env.ts): AUTOMATION_MAX_ATTEMPTS=3  AUTOMATION_TIMEOUT_MS=5000
   ```
2. **Arrancar n8n**:
   ```bash
   docker compose --profile n8n up -d
   ```
   Abre http://localhost:5678 y crea el usuario owner.
3. **Credencial SMTP**: en n8n → *Credentials* → *SMTP* → crea "SMTP CRM" con tu proveedor de correo.
4. **Importar el workflow**: *Workflows* → *Import from File* → `n8n/workflows/crm-automation-dispatcher.json`.
   - Reasigna la credencial SMTP en los dos nodos *Email* (el JSON trae el placeholder `REPLACE_WITH_SMTP_CREDENTIAL_ID`).
   - Ajusta el `fromEmail` (`no-reply@tudominio.com`) al dominio real.
   - **Activa** el workflow (toggle *Active*) para que el webhook quede productivo en `/webhook/...`
     (en modo test la URL es `/webhook-test/...`).

## API key de n8n (para el MCP / despliegue automatizado)

El MCP `n8n-mcp` (gestión de workflows desde Claude) necesita:
- `N8N_API_URL=http://localhost:5678` y `N8N_API_KEY` (n8n → *Settings* → *n8n API* → *Create API Key*).
- **Nota**: el MCP bloquea `localhost` por *SSRF protection (strict mode)*. Para desplegar workflows
  vía MCP, expón n8n por un host/alias no-localhost o desactiva el modo estricto del MCP. Mientras tanto,
  el despliegue es manual (Import from File, arriba).

## Verificación (V.1 — requiere n8n arriba)

- **Envío**: dispara `user.invited` / `password.reset_requested` desde el back (o `curl` firmado) → llega el email.
- **Idempotencia**: reenvía el mismo `eventId` → no se duplica el email (ruta `duplicate`, 200).
- **Fallo suave**: apaga n8n → `emit()` devuelve `failed`/`skipped` sin romper el request del CRM.
- **Firma inválida**: manipula el body o el secreto → 401, sin email.

## Estado

- Fase 0.1 (infra docker) + Fase 1 (alta usuario, reset contraseña): **artefactos listos para importar**.
- Fases 2–5 (citas, facturación, marketing, equipo): pendientes; requieren endpoints/eventos del back aún no emitidos.
