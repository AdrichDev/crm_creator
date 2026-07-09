# Validación — crm-env-contract-tiers

Historia: como **operador de la plataforma** quiero un contrato formal de variables de
entorno por tier de cliente y que los secretos por negocio lleguen solos a donde se
consumen — los públicos horneados como `NEXT_PUBLIC_*` en la app exportada y los
server-side resueltos por negocio con fallback a mi clave —, para entregar apps que
funcionan (mapas incluidos) en cualquiera de los tres modelos de alojamiento sin filtrar
jamás un secreto de servidor.

## Criterios de aceptación (AC)
- **AC1 (contrato de tiers):** existe `docs/ENV-CONTRACT.md` que asigna cada variable /
  secreto consumido por front y back a su ubicación en los tiers 1/2/3, incluidas las
  reglas R1-R4 (backend nunca sale, tier 2 instancia aislada, `FRONTEND_PUBLIC` horneado
  = público restringido por referrer, fallback medible).
- **AC2 (`.env.example` completo):** `front/.env.example` documenta con placeholder +
  comentario TODA variable que el front puede consumir — incluida
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (hoy ausente pese a que `front/lib/maps/loader.ts`
  lanza sin ella) — y no contiene ningún valor real.
- **AC3 (puente build-time):** un export de un negocio con secreto `FRONTEND_PUBLIC` +
  `envVarName` produce un `.env.local` generado que incluye `<envVarName>=<valor>`; el
  mismo negocio sin ese secreto exporta sin error y sin la línea.
- **AC4 (backend jamás horneado):** ningún secreto `scope=BACKEND_SECRET` aparece en el
  `.env.local` generado bajo ninguna combinación de datos, ni siquiera con `envVarName`
  poblado por error (defensa en profundidad en `buildEnvContent`).
- **AC5 (escritor único):** el `.env.local` generado sale exclusivamente de
  `buildEnvContent`; este change no añade ningún otro punto de escritura ni append.
- **AC6 (validación de mapeo):** el alta de secreto rechaza `envVarName` que no cumpla
  `^NEXT_PUBLIC_[A-Z0-9_]+$`, `envVarName` sobre `BACKEND_SECRET`, y valores con saltos
  de línea.
- **AC7 (resolución por negocio):** `getTenantSecret(businessId, name, { fallbackEnv })`
  devuelve la clave del negocio con `source='tenant'` si existe; la del operador con
  `source='operator'` si no; `null` sin ninguna — y branding usa la del negocio cuando
  existe sin regresión para negocios sin secreto.
- **AC8 (no regresión):** back tests verde, `tsc` limpio, `prisma migrate status` sin
  drift; migración aditiva (solo ADD COLUMN).

## Por tarea (Given-When-Then + test)
- **WU1.1** Contrato tiers → Given el doc escrito, When se busca cualquier variable de
  `back/src/env.ts` o `process.env.*` del front, Then el doc la asigna a los 3 tiers.
  Test: revisión contra inventario de variables (script/checklist de auditoría del WU).
- **WU1.2** `.env.example` → Given auditoría de `process.env.*` en `front/`, When se
  compara con `front/.env.example`, Then toda variable consumida está documentada con
  placeholder y ningún valor real. Test: `env-example.contract.test.ts` (o script de
  auditoría verde).
- **WU2.1** Helper → Given negocio con secreto `ANTHROPIC_API_KEY` y env de operador
  poblada, When `getTenantSecret`, Then `source='tenant'`; sin secreto →
  `source='operator'`; sin ambos → `null`. Test: `tenant-secrets.store.test.ts`.
- **WU2.2** Adopción branding → Given negocio con clave IA propia, When se invoca la ruta
  de branding IA, Then usa la clave del negocio; negocio sin clave conserva el
  comportamiento actual. Test: `branding.route.test.ts`.
- **WU3.1** Migración + validación alta → Given migración aplicada, When alta de secreto
  con `envVarName` inválido / sobre `BACKEND_SECRET` / valor con `\n`, Then 400; alta
  válida persiste `env_var`. Test: `secrets.operator.envvar.test.ts` + `prisma migrate
  status` sin drift.
- **WU3.2** Puente `buildEnvContent` → Given config + 1 `FRONTEND_PUBLIC` con
  `envVarName` + 1 `BACKEND_SECRET`, When se genera el contenido, Then incluye la línea
  `NEXT_PUBLIC_*`, excluye el backend, no pisa variables base y omite secretos sin
  `envVarName`. Test: `build-env-content.test.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. WU1 (contrato + `.env.example`) no tiene dependencias y puede
aterrizar solo. WU2 y WU3 bloqueados hasta que `crm-tenant-api-keys` (almacén) y
`crm-export-clean-manifest` (`buildEnvContent`) existan en código. Migración pendiente
de aplicar por el usuario, después de la de `crm-tenant-api-keys`.
