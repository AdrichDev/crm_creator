# SaaS Multi-Negocio — Arquitectura y Modelo de Configuración

> Plantilla SaaS modular y multi-vertical. Un único producto que, según una
> **configuración por tenant**, se adapta a peluquerías, tiendas de uñas, bares,
> restaurantes, boxes de CrossFit, salas de escalada, gimnasios, etc. Cada
> negocio decide qué módulos activa (CRM completo, control de empleados,
> vacaciones, productos, citas, ventas/TPV, fichaje, web pública, marketing…).

Estado: **scaffold funcional con datos mock, sin base de datos**. Pensado para
portarse después al proyecto *agents-agency*.

---

## 1. Visión

El producto es un **panel de gestión + web pública** que se configura por
negocio. La idea central, heredada de **ExceliaTrack**, es que la aplicación es
**multi-tenant** y **configurable**: el mismo código sirve a clientes muy
distintos cambiando únicamente la configuración (módulos activos, branding,
terminología). El **dominio de negocio** (citas, empleados, productos,
vacaciones, ventas, reseñas, galería…) se ha extraído del TFG **JorjotasBarber**.

```
                 ┌────────────────────────────────────────────┐
                 │              TenantConfig                    │
                 │  vertical · módulos activos · branding ·     │
                 │  terminología · datos de empresa             │
                 └───────────────┬────────────────────────────┘
                                 │ (drive todo)
        ┌────────────────────────┼─────────────────────────┐
        ▼                        ▼                          ▼
   Sidebar/Nav            Pantallas (módulos)          Web pública
  (solo módulos on)     (render condicional)        (landing + reservas)
```

## 2. Origen del diseño (qué se reutiliza)

| Concepto | Viene de | Cómo se usa aquí |
|---|---|---|
| Multi-tenant + branding por cliente (color/logo) | ExceliaTrack (`lib/tenant-branding.ts`, `branding-settings-card`) | `TenantConfig.branding` aplica variables CSS en runtime |
| Navegación derivada de config/rol (`nav-config.ts`) | ExceliaTrack | Sidebar se genera desde los **módulos activos**, no por rol fijo |
| Settings por categoría (`admin/settings`) | ExceliaTrack | Página **Configuración** reedita módulos, branding y terminología |
| Landing page propia del producto | ExceliaTrack (`components/landing`) | Web pública configurable por negocio |
| Entidades de negocio (Cita, Servicio, Producto, Maestro, Vacaciones, Transacción, Reseña, Galería) | JorjotasBarber (`models/*.java`) | Catálogo de módulos y datos mock |
| Arquitectura feature-based | ExceliaTrack (`features/*`) | Carpeta por módulo en `app/(panel)/*` + `lib/modules` |

## 3. Catálogo de módulos

Cada módulo es **activable/desactivable** por negocio. `dashboard` y
`configuracion` son siempre obligatorios.

| id | Nombre | Categoría | Descripción | Depende de |
|---|---|---|---|---|
| `dashboard` | Inicio | core | Resumen y KPIs (siempre activo) | — |
| `clientes` | CRM / Clientes | core | Ficha de cliente, historial, segmentos | — |
| `citas` | Citas / Reservas | operativa | Agenda, reservas online, estados | `servicios` (recom.) |
| `servicios` | Servicios | operativa | Catálogo de servicios, duración, precio | — |
| `empleados` | Empleados | personas | Plantilla, roles, especialidades | — |
| `fichaje` | Fichaje / Horas | personas | Control de jornada e imputación (ExceliaTrack) | `empleados` |
| `vacaciones` | Vacaciones | personas | Solicitudes y aprobaciones de ausencias | `empleados` |
| `productos` | Productos / Inventario | retail | Stock, categorías, proveedores | — |
| `ventas` | Ventas / TPV | retail | Tickets, métodos de pago, caja | `productos` (recom.) |
| `web` | Web pública + Landing | marketing | Landing configurable, galería, reseñas, reserva online | — |
| `marketing` | Marketing / Comms | marketing | Campañas, fidelización, notificaciones | `clientes` |
| `configuracion` | Configuración | core | Edita módulos, branding, terminología (siempre activo) | — |

> Las **dependencias** son "recomendadas", no estrictas, para no bloquear al
> usuario. El wizard avisa pero permite continuar.

## 4. Verticales (presets de configuración)

Un **vertical** es un preset que rellena de golpe: módulos activos por defecto,
**terminología** y branding sugerido. El usuario siempre puede ajustar después.

| Vertical | Módulos por defecto | Terminología destacada |
|---|---|---|
| 💈 Peluquería | clientes, citas, servicios, empleados, vacaciones, productos, ventas, web, marketing | Citas · Estilistas |
| 💅 Centro de estética | clientes, citas, servicios, empleados, vacaciones, productos, ventas, web, marketing | Citas · Esteticistas · Tratamientos |
| 🍽️ Restaurante / Bar | clientes, citas, productos, ventas, empleados, fichaje, vacaciones, web, marketing | Reservas · Personal de sala · TPV |
| 🏋️ Gimnasio / Box | clientes, citas, servicios, empleados, fichaje, vacaciones, productos, ventas, web, marketing | Clases · Entrenadores · Socios |
| 🧗 Escalada | clientes, citas, servicios, empleados, productos, ventas, web | Reservas/Pases · Monitores · Socios |
| 🩺 Clínica | clientes, citas, servicios, empleados, vacaciones, productos, ventas, web, marketing | Citas · Profesionales · Pacientes · Tratamientos |
| 🔧 Taller mecánico | clientes, citas, servicios, empleados, fichaje, vacaciones, productos, ventas, web | Órdenes de trabajo · Mecánicos · Recambios |
| 🐾 Centro veterinario | clientes, citas, servicios, empleados, vacaciones, productos, ventas, web, marketing | Citas · Veterinarios · Pacientes |

> Verticales **unificados**: estética agrupa uñas/belleza/bienestar; hostelería
> agrupa bar/cafetería/restaurante; fitness agrupa gimnasio/box de CrossFit.
> Clínica cubre fisioterapia y dental.

La terminología permite que la misma pantalla de "citas" se titule **"Reservas"**
en un restaurante o **"Clases"** en un gimnasio, sin duplicar código.

## 5. Modelo de configuración (`TenantConfig`)

```ts
type TenantConfig = {
  business: { name: string; vertical: VerticalId; phone?; email?; address? };
  modules: Record<ModuleId, boolean>;   // qué se activa
  terminology: Partial<Record<TermKey, string>>; // overrides de nombres
  branding: { primary: string; secondary: string; logoText: string };
  setupComplete: boolean;
};
```

- **Persistencia (sin DB):** se guarda en `localStorage` mediante
  `TenantConfigProvider` (React Context). Al portar a *agents-agency*, este
  provider es el único punto que hay que conectar a la API/DB real.
- **Punto único de verdad:** sidebar, rutas, web pública y terminología leen de
  aquí. Activar un módulo en Configuración lo hace aparecer en el sidebar y
  habilita su ruta inmediatamente.

## 6. Arquitectura del scaffold

> Todo el front vive en `front/`. Las rutas de abajo son relativas a esa carpeta.

```
app/
  layout.tsx                 # html + TenantConfigProvider + branding CSS vars
  page.tsx                   # redirige a /onboarding o /panel según setupComplete
  onboarding/                # wizard: vertical → módulos → branding → empresa
  (panel)/
    layout.tsx               # AppShell: sidebar derivado de módulos activos
    panel/                   # dashboard
    clientes/ citas/ servicios/ empleados/ fichaje/
    vacaciones/ productos/ ventas/ marketing/
    configuracion/           # reedita config
  web/                       # vista previa de la web pública configurable
lib/
  config/
    modules.ts               # catálogo de módulos
    verticals.ts             # presets por vertical
    terminology.ts           # claves y defaults de terminología
    tenant-config.ts         # tipos + default + (de)serialización
  tenant-config-context.tsx  # Provider + hooks (useTenantConfig, useModuleEnabled, useTerm)
  mock/                      # datos mock por módulo
components/
  ui/                        # primitivos (Button, Card, Stat, Table, Badge, Toggle…)
  layout/                    # AppShell, Sidebar, Topbar, ModuleGuard
  config/                    # VerticalPicker, ModuleToggleGrid, BrandingForm
```

**Stack (versión ligera elegida):** Next.js (App Router) + TypeScript + Tailwind
CSS + lucide-react. Estado con **React Context + hooks** (sin Zustand ni React
Query) y **datos mock** en TS. Sin base de datos.

**Render condicional:** cada ruta de módulo está envuelta en `<ModuleGuard
module="...">`, que redirige al dashboard si el módulo está desactivado. El
sidebar solo pinta módulos activos. Así, "seleccionar qué toma el negocio" se
traduce literalmente en lo que se ve.

## 7. Roles (preparado, no bloqueante)

Se mantiene el patrón de ExceliaTrack (owner/admin/manager/empleado). En el
scaffold se asume `owner`. La función `resolveNav()` ya admite filtrar por rol
además de por módulo, para activarlo al conectar auth real.

## 8. Plan de portado a agents-agency / base de datos

1. **Persistencia real:** sustituir el `localStorage` de `TenantConfigProvider`
   por llamadas a API (cargar config del tenant al iniciar sesión).
2. **Modelo de datos:** convertir las entidades mock (`lib/mock/*`) en tablas.
   Sugerido: una tabla `tenant` con su JSON de configuración + tablas por módulo
   (clientes, citas, servicios, empleados, productos, transacciones, ausencias).
3. **Feature flags = columnas/JSON:** `modules` y `terminology` viven en la
   config del tenant; el front no cambia.
4. **Auth + roles:** conectar el provider de sesión y activar el filtrado por rol
   ya previsto en `resolveNav()`.
5. **Web pública:** servir `/web` por subdominio/slug del tenant.

## 9. Fuera de alcance (esta fase)

Base de datos, autenticación real, pasarela de pago, multi-idioma e
internacionalización completa, y backend. Todo ello está contemplado en el
diseño pero deliberadamente no implementado para centrarse en el **modelo de
configuración modular**.
