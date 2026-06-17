# Devil Notes — Gestión de usuarios y autenticación

## 1. Reinventar auth con Supabase Auth a la vuelta
Spec construye credenciales propias + reset propio + tabla PasswordResetToken. Supabase Auth ya da signup/login/hash/reset/tokens-un-solo-uso/anti-enumeración gratis. El reset (UC-3) es justo lo que Supabase regala y lo más delicado de hacer bien. Migración futura NO medida: bcrypt propio != hashing Supabase → migrar hashes suele forzar reset masivo. Riesgo no cubierto: no hay análisis de qué trabajo es desechable en la migración.

## 2. Password en claro por email (AC-1.3) — LO MÁS GRAVE
Genera password y la manda EN CLARO por email vía n8n. Queda en buzón, logs n8n, payloads webhook, históricos del proveedor. Email no es E2E → credencial usable en texto plano "para siempre". Si el usuario no la cambia (lo normal), password permanente en su inbox. Un log de n8n filtra TODAS las altas. Estándar: NO mandar password; mandar enlace "set password" (mismo mecanismo que UC-3 reset). Colapsa alta+reset en un flujo: menos código, más seguro, portable a Supabase (invite link). Recomendación fuerte: MATAR AC-1.3, reemplazar por invite/set-password link.

## 3. Multi-tenant: un email en varios negocios
User.email único global, pero Membership es por negocio. Sin responder: ¿un trabajador en 2 negocios = 1 User+2 Membership o 2 User? AC-1.1 "email único → 409": admin de negocio B crea email que ya existe en A → 409 filtra que el email existe en la plataforma (enumeración cross-tenant) Y bloquea alta legítima. ¿Admin de B puede tocar/resetear un User existente de A? Vector de toma de cuenta cross-tenant. Decisión de modelo de datos, cerrar ANTES de implementar.

## 4. Enumeración inconsistente
UC-3 reset es neutro (bien). UC-1 alta devuelve 409 explícito → admin malicioso enumera emails de toda la plataforma (409 vs 201). O el 409 es solo dentro del propio negocio (cross-tenant no filtra) o se neutraliza.

## 5. Rate limiting AUSENTE
Nada en login (fuerza bruta), reset (spam de emails a víctimas + agotar cuota n8n + coste), ni alta. n8n sin límite = arma de spam/DoS y reputación de dominio.

## 6. Edge cases sin spec
- AC-2.3 "≥8 chars" vs AC-1.2 genera "≥12": política incoherente.
- Reset no invalida sesiones/JWT activos: cuenta comprometida sigue viva tras cambio.
- JWT sin TTL/refresh/revocación definidos.
- Borrar User (AC-1.4) con datos asociados → huérfanos.
- AC-1.3 email falla → password solo hasheada, nadie la sabe → usuario inaccesible; "reenviar" ¿invalida la anterior? sin definir.

## RECOMENDACIÓN: PROCEDER-CON-CAMBIOS
1. Eliminar envío de password en claro → invite/set-password link (mismo token que reset).
2. Cerrar modelo multi-tenant User↔Membership con email repetido; 409 por-negocio sin filtrar cross-tenant.
3. Rate limiting en login y reset.
4. Invalidar sesiones/JWT al cambiar/resetear password.
Supabase no bloquea pero exige decisión consciente: construir solo lo portable. Si migración <6 meses, considerar hacer invite/reset ya sobre Supabase Auth.
