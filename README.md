# SaaS Multi-Negocio (plantilla configurable)

Plantilla de SaaS **modular y multi-vertical**: un mismo producto que, según la
**configuración de cada negocio**, activa unos módulos u otros (CRM, citas,
empleados, fichaje, vacaciones, productos, ventas/TPV, web pública, marketing…)
y se adapta a peluquerías, centros de estética, hostelería, gimnasios/box,
salas de escalada, clínicas, talleres, veterinarios, etc.

> Estado: **front (consola de proyectos + panel demo) + backend OperaOS ejecutable
> (Express + Prisma + Postgres)**. Diseño completo en `SDD_v1.md`.

## Documentos clave

- `SDD_v1.md` — especificación completa del producto (Business OS para negocios
  locales): PRD, módulos, modelo de datos, APIs, UX, fases, riesgos, Devil's
  Advocate, backlog y criterios de aceptación.
- `ARQUITECTURA.md` — diseño del front configurable (consola + módulos).

## Estructura del repo

```
SaaS_Negocios/
  SDD_v1.md         ← especificación del producto (Business OS)
  ARQUITECTURA.md   ← diseño del front / consola
  GENERAR.md        ← cómo generar el CRM completo de un cliente
  generar.mjs       ← CLI guiado: crea back+front+.env por cliente
  README.md         ← este archivo
  front/            ← Next.js: consola de proyectos + panel demo
  back/             ← backend OperaOS (Express + Prisma + Postgres) ejecutable
```

## Generar el CRM completo de un cliente

El botón **Generar** de la consola exporta la *especificación* (manifest +
schema). Para crear el **CRM completo (back + front) con su `.env` escrito**, usa
el asistente guiado en terminal:

```bash
node generar.mjs            # te pregunta nombre BD, conexión, puertos… y escribe el .env
```

Detalle completo en `GENERAR.md`.

El front se conecta al backend definiendo `NEXT_PUBLIC_API_URL` en
`front/.env.local` (prioridad de datos: API REST > Supabase > local). Arranque del
backend en `back/README.md`.

## ⚠️ Antes de empezar (importante)

En la raíz quedó un `node_modules/` **parcial** generado durante la verificación
que no se pudo limpiar automáticamente. **Bórralo** (no afecta a `front/`):

```bash
# Windows (cmd):   rmdir /s /q node_modules
# PowerShell:      Remove-Item -Recurse -Force node_modules
```

## Puesta en marcha (front)

```bash
cd front
npm install
npm run dev      # http://localhost:3002
```

Al abrir por primera vez te lleva al **wizard de onboarding** (`/onboarding`):
eliges tipo de negocio → módulos → marca → datos. La config se guarda en
`localStorage`. Luego entras al panel.

- `/onboarding` — asistente de configuración (vertical + módulos + branding)
- `/panel` — dashboard; el **sidebar solo muestra los módulos activos**
- `/configuracion` — reactiva/desactiva módulos, cambia marca y datos en caliente
- `/web` — vista previa de la **web pública** generada desde tu configuración

## Botones funcionales (CRUD)

Todas las pantallas tienen botones operativos **sin base de datos todavía**:
crear, editar y eliminar funcionan en cliente y **persisten en `localStorage`**
(clave `saas.data.<modulo>.v1`), sembrados desde los datos mock. Además: fichaje
ficha entrada/salida real, vacaciones aprueba/rechaza, y el formulario de la web
pública crea una cita pendiente que aparece en el panel.

La conmutación a Supabase ya está cableada (ver más abajo): cuando haya
credenciales, el mismo CRUD escribe en la base de datos sin tocar las pantallas.

## Backend (carpeta `back/`)

Esquema **Postgres/Supabase multi-tenant y modular**: incluye TODOS los módulos,
pero el generador produce, por proyecto, **solo el SQL de los módulos activos**.

```bash
cd back
node scripts/build-schema.mjs --all --out schema/all_modules.sql            # estructura general
node scripts/build-schema.mjs --modules clientes,citas,servicios --out proyecto.sql
node scripts/build-schema.mjs --from ../mi-config.json --out proyecto.sql   # desde una config de tenant
```

Ver `back/README.md` para el detalle (RLS, relaciones entre módulos, aplicar a
Supabase). El DDL está validado contra el parser real de PostgreSQL.

## Cómo está montado el front

Rutas relativas a `front/`.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + lucide-react.
  Estado con React Context (`lib/tenant-config-context.tsx`), datos CRUD con
  `lib/data/use-collection.ts`. Sin Zustand ni React Query.
- **Catálogo de módulos:** `lib/config/modules.ts`
- **Verticales (presets):** `lib/config/verticals.ts`
- **Modelo de configuración del tenant:** `lib/config/tenant-config.ts`
- **Render condicional:** cada ruta usa `<ModuleGuard module="...">`; el sidebar
  se genera desde los módulos activos.
- **Terminología:** la misma pantalla se titula "Citas", "Reservas" o "Clases"
  según el vertical, vía `useTerm()`.

## Añadir un módulo nuevo

1. Añade su entrada en `MODULES` (`front/lib/config/modules.ts`).
2. Crea `front/app/(panel)/<modulo>/page.tsx` envuelta en `<ModuleGuard>`.
3. Crea su tabla en `back/schema/<NN>_<modulo>.sql` y regístrala en
   `back/schema/manifest.json`.
4. (Opcional) Inclúyelo en los `defaultModules` de los verticales que lo usen.

## Portado a agents-agency / Supabase

1. **Datos:** conecta `front/lib/data/use-collection.ts` al cliente de Supabase.
2. **Config del tenant:** conecta `TenantConfigProvider` a la API en vez de
   `localStorage`.
3. **Esquema:** genera el SQL del proyecto con `back/scripts/build-schema.mjs`
   según los módulos activos y aplícalo a Supabase.

Ver `ARQUITECTURA.md` (secciones 5 y 8) para el detalle.

## Conexión Supabase (preparada, desactivada)

El cableado a Supabase ya está hecho y **se activa solo con poner credenciales**:

- `front/lib/supabase/client.ts` — cliente null-safe (`isSupabaseEnabled()`).
- `front/lib/supabase/tables.ts` — mapeo colección↔tabla y camelCase↔snake_case.
- `front/lib/data/backend.ts` — `getBackend()` elige local o Supabase según el
  entorno. `front/lib/data/use-collection.ts` lo usa de forma transparente.
- `front/.env.example` — variables a rellenar (`.env.local`).

Mientras `.env.local` esté vacío, la app usa datos locales. Pasos detallados de
activación en **`back/ACTIVAR_SUPABASE.md`**.
