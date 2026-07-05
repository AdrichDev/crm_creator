# ESTRUCTURA — índice de changes openspec (creador_CRM)

Estado global de la carpeta `openspec/changes/`. Estructura unificada objetivo por change:
`proposal.md` + `tasks.md` + `validation.md` (con `design.md`/`specs/` opcionales, conservados
tal cual). `validation.md` sigue la convención del repo: historia + criterios de aceptación +
Given-When-Then por tarea + estado verificado. Regla de oro: **una tarea está DONE solo con su
test verde; sin spec → no code**.

Leyenda: ✓ presente · ✗ ausente · (nuevo) creado en esta pasada de unificación.
No se toca `archive/` ni el código; `archive/2026-07-02-crm-castellano-supabase-total` queda fuera.

| Change | proposal | tasks | validation | design | specs | Tareas abiertas + motivo |
|---|---|---|---|---|---|---|
| crm-autoregistro-cliente | ✓ | ✓ | ✓ (nuevo) | ✓ | ✓ | Ninguna bloqueante. Implementado y verificado e2e (2026-06-17). Pendiente no bloqueante: cablear front CLIENT a `/me/*` (→ crm-portal-cliente) + matriz EMPLOYEE/ADMIN. |
| crm-castellano-supabase-total | ✓ | ✓ | ✓ | ✓ | ✓ | Ninguna. Tests finales verdes (back 53/0 · front 89 · e2e 10/10). Copia archivada en `archive/`. |
| crm-citas-supabase | ✓ | ✓ | ✓ | ✓ | ✗ | Ninguna abierta registrada. |
| crm-cliente-estadisticas-fixes | ✓ | ✓ | ✓ (nuevo) | ✓ | ✓ | Ninguna. CERRADO (vitest 40/40, tsc limpio, next build OK). |
| crm-cliente-solo-mi-cuenta | ✓ | ✓ | ✓ | ✓ | ✗ | Ninguna abierta registrada. |
| crm-comercial-campo | ✓ | ✓ | ✓ | ✓ | ✓ | Ninguna. Migración APLICADA (Z.4, verificada sin drift); Agentic Runtime review hecho (Z.2). CERRADO 100%. |
| crm-deuda-buenas-practicas | ✓ (nuevo) | ✓ (nuevo) | ✓ (nuevo) | ✗ | ✗ | TODAS: PROPUESTA — sin iniciar. Audit de buenas prácticas 2026-07-02 (lotes A-D); prioriza el usuario. |
| crm-deuda-p3 | ✓ | ✓ | ✓ | ✗ | ✗ | Ninguna abierta registrada. |
| crm-estudios-clon-aa | ✓ | ✓ (nuevo) | ✓ (nuevo) | ✗ | ✗ | TODAS: PROPUESTA — sin iniciar (solo existía proposal). |
| crm-front-roles-4 | ✓ | ✓ | ✓ | ✗ | ✗ | Ninguna abierta registrada. |
| crm-gestion-usuarios-auth | ✓ | ✓ | ✓ (nuevo) | ✓ | ✓ | Ninguna bloqueante. Blueteam APROBADO-CON-NOTAS; 2 BAJA diferidas (Redis rate-limit, trust proxy) = gates de despliegue. |
| crm-integraciones-comunicacion | ✓ | ✓ (nuevo) | ✓ (nuevo) | ✗ | ✗ | TODAS: PROPUESTA — sin iniciar; requiere aprobación humana (OAuth2, tokens por tenant, costes API, nº WhatsApp). |
| crm-migracion-supabase | ✓ | ✓ | ✓ | ✓ | ✓ | Ninguna abierta registrada. |
| crm-n8n-automations | ✓ | ✓ | ✓ | ✓ | ✓ | 3.1 factura PDF por email (BLOQUEADA: falta email/FK cliente + PDF → migración + decisión); 5.3 estudio programado (BLOQUEADA: estudios solo en front/localStorage); V.2 rate limit del webhook (infra usuario). |
| crm-nodemailer-9-security | ✓ | ✓ | ✓ (nuevo) | ✗ | ✗ | Ninguna. Verificado (tsc + back 109/0/0 + audit limpio + Agentic Runtime PASS). |
| crm-onboarding-edit-landing-ia | ✓ | ✓ | ✓ (nuevo) | ✓ | ✓ | Fase 2 (2.1-2.3 ZIP), Fase 3 (3.1-3.3 landing+login) y 4.1 (extractor paleta) POSPUESTAS POR EL USUARIO (seguridad: servir JS de terceros); V.2/V.3 pendientes con ellas. Fase 1 + IA branding HECHAS y verdes. |
| crm-perfil-editable | ✓ | ✓ | ✓ | ✓ | ✗ | V.1/V.2/V.3 = PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO (código + tests verde, falta vistazo humano). |
| crm-portal-cliente | ✓ | ✓ | ✓ (nuevo) | ✓ | ✓ | V.3 flujo manual cliente = PENDIENTE VERIFICACIÓN MANUAL; "Mis bonos"/"Mi perfil" diferidos (falta módulo/página); facturas fuera (decisión B=NO). |
| crm-prisma-7-upgrade | ✓ | ✓ | ✓ | ✗ | ✗ | Ninguna abierta registrada. |
| crm-sectorial-ia | ✓ | ✓ | ✓ (nuevo) | ✓ | `spec.md` (suelto) | Verificación final PENDIENTE MANUAL (npm test/e2e por usuario); tarea (b) ledger `tokensUsed` BLOQUEADA (no cableada en AA, repo aparte). `spec.md` suelto conservado, referenciado desde validation. |
| crm-sidebar-usuario-real | ✓ | ✓ | ✓ | ✗ | ✗ | V.1/V.2 = PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO (código + tests verde; CSS presente). |
| crm-tema-claro-oscuro | ✓ | ✓ | ✓ | ✗ | ✗ | V.1/V.2 = PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO (cubierto por test; falta visual). |
| crm-trabajador-chips | ✓ | ✓ | ✓ (nuevo) | ✗ | ✗ | Ninguna. DISCREPANCIA RESUELTA 2026-07-02: implementado de verdad (worker-chips-grid.tsx + workerChips en tenant-config + tab trabajador); proposal actualizado. |
| front-ui-paleta-dorada | ✓ | ✓ (nuevo) | ✓ | ✗ | ✗ | TODAS: las 8 tareas de verificación del validation están sin marcar → nada verificado. Checklist derivada; pendiente revisión visual. |

## Notas de esta pasada
- **validation.md creados (8):** crm-autoregistro-cliente, crm-cliente-estadisticas-fixes,
  crm-gestion-usuarios-auth, crm-nodemailer-9-security, crm-onboarding-edit-landing-ia,
  crm-portal-cliente, crm-sectorial-ia, crm-trabajador-chips.
- **tasks.md creados (3):** crm-estudios-clon-aa y crm-integraciones-comunicacion (PROPUESTA —
  sin iniciar); front-ui-paleta-dorada (derivado de proposal+validation, nada verificado).
- **Anotaciones de tareas abiertas:** crm-perfil-editable, crm-sidebar-usuario-real,
  crm-tema-claro-oscuro, crm-sectorial-ia (V.x = PENDIENTE VERIFICACIÓN MANUAL DEL USUARIO);
  crm-onboarding-edit-landing-ia (Fases 2/3 marcadas POSPUESTAS POR EL USUARIO). crm-n8n-automations
  3.1/5.3 ya estaban anotadas BLOQUEADA (no se duplicó).
- **Honestidad:** nada se dio por verificado sin evidencia en el propio change. Los estados
  "PENDIENTE"/"Sin verificación registrada"/"BLOQUEADA" reflejan lo que dicen proposal/tasks/design.
