# Proposal — nodemailer 6 → 9 (deuda de seguridad) (crm-nodemailer-9-security)

**Nivel Gru: 2 — Medio.** Major de dep runtime, 1 fichero de uso, reversible.
**Estado: APROBADO (2026-06-28) — F5 seguridad, liberar deuda.**

## Contexto

`creador_CRM/back` usa `nodemailer ^6.9.16` (drainer de recordatorios + emails de citas).
`npm audit` reporta HIGH en nodemailer ≤9.0.0: SMTP command injection (CRLF en transport name,
envelope.size), interpretation conflict de dominio, DoS en addressparser, TLS cert bypass en
OAuth2, bypass de disableFileAccess/UrlAccess. Fix = nodemailer@9.0.1 (major breaking).

Uso real en `lib/email.ts`: `createTransport({host,port,secure,auth})` + `sendMail({from,to,subject,html,text})`.
Ambas APIs son estables 6→9 (sin opciones retiradas en esta config).

## Intención

Subir nodemailer + @types a ^9 para cerrar la deuda de seguridad. Validar typecheck + suite.

## Decisiones técnicas

- `nodemailer` → `^9`; `@types/nodemailer` → `^9` (o el que corresponda).
- Sin cambios de código esperados (API usada estable). Corregir solo si typecheck lo exige.

## Alcance

1. `back/package.json`: nodemailer + @types/nodemailer → ^9.
2. Ajustes mínimos en `lib/email.ts` si la API cambió (no esperado).

## Fuera de alcance

- Cambiar el proveedor SMTP o la lógica de envío.

## Riesgos

- Algún cambio de tipos en @types/nodemailer@9. Mitigación: typecheck + fix local.
- Comportamiento SMTP runtime: cubierto por tests de email (soft-fail) + e2e.
