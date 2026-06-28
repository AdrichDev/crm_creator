# Tasks — crm-nodemailer-9-security  (Nivel 2 — APROBADO)

> Liberar deuda de seguridad (HIGH nodemailer). Validación = tsc + suite.

## Fase A — Upgrade
- [x] A.1 `nodemailer` → `^9.0.1`. nodemailer 9 NO trae tipos propios → mantener `@types/nodemailer@^6.4.24` (cubre createTransport/sendMail, estables).
- [x] A.2 Sin cambios de código en `lib/email.ts` (API usada idéntica).

## Fase B — Verificación
- [x] B.1 `npx tsc --noEmit` limpio. (2026-06-28)
- [x] B.2 `npm test` (con --env-file) CRM back verde — 109/0/0 (incluye email + drainer + e2e live).
- [x] B.3 `npm audit`: el HIGH de nodemailer ya no aparece.

## Tras verde: gate Ruflo ANTES de cualquier commit/push.
- [x] Ruflo PASS — bump de dep sin cambios de código; gate = tsc + suite verde + vuln cerrada.
