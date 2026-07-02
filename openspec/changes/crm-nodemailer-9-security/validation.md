# Validación — crm-nodemailer-9-security

Historia: como responsable del CRM quiero cerrar la deuda de seguridad HIGH de `nodemailer`
subiendo de 6 a 9, sin cambiar el proveedor SMTP ni romper el envío de emails.

## Criterios de aceptación (AC)
- **AC1:** `nodemailer` en `^9.0.1`; el HIGH de `npm audit` (SMTP command injection, DoS
  addressparser, TLS bypass OAuth2, bypass disableFileAccess/UrlAccess) desaparece.
- **AC2:** la API usada (`createTransport({host,port,secure,auth})` + `sendMail`) sigue idéntica;
  cambios de código solo si el typecheck lo exige.
- **AC3:** `tsc` limpio y suite back verde tras el bump.
- **AC4:** gate Ruflo superado antes de cualquier commit/push.

## Por tarea (Given-When-Then + test)
- **A.1 upgrade** → Given `package.json`, When se sube a `nodemailer@^9.0.1`, Then instala;
  `@types/nodemailer@^6.4.24` se mantiene (nodemailer 9 no trae tipos propios; cubre
  createTransport/sendMail estables). Test: instala + `tsc`.
- **A.2 sin cambios** → Given `lib/email.ts`, When se compila con v9, Then sin cambios de
  código (API idéntica). Test: `tsc`.
- **B.1 typecheck** → Given el proyecto, When `npx tsc --noEmit`, Then limpio. Test: tsc.
- **B.2 suite** → Given la suite back, When `npm test` (con `--env-file`), Then verde. Test:
  109/0/0 (email + drainer + e2e live).
- **B.3 audit** → Given `npm audit`, When se ejecuta, Then el HIGH de nodemailer no aparece. Test.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado (2026-06-28) — IMPLEMENTADO Y VERIFICADO
- `nodemailer` → `^9.0.1`; `@types/nodemailer@^6.4.24` mantenido; sin cambios en `lib/email.ts`. ✓
- `npx tsc --noEmit` limpio. ✓
- `npm test` (con `--env-file`) CRM back verde — 109/0/0 (incluye email + drainer + e2e live). ✓
- `npm audit`: el HIGH de nodemailer ya no aparece. ✓
- Gate Ruflo PASS — bump de dep sin cambios de código; gate = tsc + suite verde + vuln cerrada. ✓
