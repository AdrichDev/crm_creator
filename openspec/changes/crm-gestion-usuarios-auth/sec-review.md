# Security review — crm-gestion-usuarios-auth

Auditoría blue-team (read-only) del flujo de credenciales. **Veredicto: APTO-CON-FIXES** → 4 fixes aplicados + 12 tests de regresión.

## Verificado correcto (núcleo sólido)
- Sin password en claro: alta = `passwordHash='!'` + status `invited` + token un-solo-uso (`/set-password`).
- Tokens: 32B randomBytes (~256 bits), SHA-256 en BD, `usedAt` un-solo-uso, expiración (invite 7d / reset 30min), invalidación cruzada al consumir.
- No fuga `passwordHash` (select `USER_PUBLIC`, test de regresión).
- Multi-tenant: 409 solo intra-negocio; email de otro negocio enlaza Membership sin tocar credenciales (cierra vector toma-cuenta cross-tenant).
- RBAC `requireRole` a nivel router; guardas last_admin/owner/self.
- Session-invalidation `iat < passwordChangedAt`. forgot neutro. HMAC `timestamp.body` + timingSafeEqual. emit no loguea `data`.

## Fixes aplicados (hardening)
| # | Sev | Fix | Test |
|---|---|---|---|
| H1 | ALTA | `trust proxy` + login limiter por ip+email (no solo IP) | ✅ |
| H2 | ALTA | No firmar/emitir webhook con secreto vacío | ✅ |
| H3 | ALTA | Fallar arranque en prod si `JWT_SECRET` default/vacío | ✅ |
| H4 | MEDIA | `/register` usa `validatePassword` (mín 8) | ✅ |

## Deuda no bloqueante
- H5 (timing forgot, mitigado por rate-limit), H6 (sin historial de passwords).
- JWT TTL 30d sin refresh token (deuda design §5).
- Pendiente: `cybersec:blueteam-detect` → gates CI. Workflows n8n (Fase 1+). `.env.example` con claves nuevas.
- **Deploy a prod**: exige setear `JWT_SECRET` y `AUTOMATION_WEBHOOK_SECRET` (H3 ahora lo fuerza).
