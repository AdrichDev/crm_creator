# Activar Supabase (cuando tengas cuentas / proyecto creado)

Hoy la app funciona en **modo local** (datos en `localStorage`). Todo el cableado
para Supabase ya está hecho y desactivado. Para activarlo:

## 1. Crear el proyecto en Supabase
Crea un proyecto en https://supabase.com y copia:
- Project URL  → `NEXT_PUBLIC_SUPABASE_URL`
- anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Aplicar el esquema
Genera el SQL del proyecto con los módulos que use ese negocio y aplícalo:

```bash
cd back
node scripts/build-schema.mjs --modules clientes,citas,servicios,empleados --out proyecto.sql
# o el esquema completo:  node scripts/build-schema.mjs --all --out schema/all_modules.sql
```

Pega el `.sql` en el **SQL Editor** de Supabase (o `psql "$DB_URL" -f proyecto.sql`).
Crea un tenant (ver `seed.example.sql`) y anota su `id`.

## 3. Configurar variables en el front
Edita `front/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
NEXT_PUBLIC_DEFAULT_TENANT_ID=<uuid-del-tenant>   # provisional, hasta tener login
```

## 4. Listo
Con esas variables presentes, `isSupabaseEnabled()` pasa a `true` y
`getBackend()` (en `front/lib/data/backend.ts`) usa automáticamente las tablas
de Supabase en vez de `localStorage`. **Las pantallas no cambian.**

## Qué queda para producción (no incluido aún)
- **Auth/login**: hoy el tenant sale de env/localStorage. Al añadir Supabase
  Auth, `getActiveTenantId()` debe leerlo de la sesión (membership del usuario).
- **Config del tenant**: `TenantConfigProvider` aún guarda en `localStorage`.
  Para multi-dispositivo, cargar/guardar la config desde `app.tenants` +
  `app.tenant_modules` + `app.tenant_terms`.
- **Revisar el mapeo** de columnas en `front/lib/supabase/tables.ts` si añades
  campos nuevos (el front es camelCase, la DB snake_case).
