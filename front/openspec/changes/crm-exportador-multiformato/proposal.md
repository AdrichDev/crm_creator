# Propuesta — Exportador multi-plataforma + rediseño Dashboard

> Estado: **aprobada** · Nivel: **3** · Fecha: 2026-06-30

## Intención

El generador CRM produce proyectos configurados pero no los entrega empaquetados. El tenant debe hacer la exportación manualmente (zip manual, build propio). Esto rompe el flujo end-to-end.

**Éxito**: el tenant pulsa "Exportar", elige el formato (web, .exe, .apk, .ipa) y recibe el artefacto listo sin tocar la terminal. El dashboard muestra el progreso en tiempo real.

## Alcance

### Back — nuevo endpoint

| Componente | Detalle |
|---|---|
| `POST /api/exports` | Streaming NDJSON, Bearer obligatorio |
| Formatos | `web-zip`, `exe`, `apk`, `ipa` |
| Lock | Un build a la vez; `409` si hay build activo |
| Timeout | 20 minutos; lock liberado en `finally` |
| Preflight | Verificación toolchain antes de cada build |

### Código compartido

`creador_CRM/shared/generate/` — fuentes únicas para SQL, Prisma schema y manifest, sin dependencias React/browser. Front y back importan desde ahí.

### Front — rediseño `/dashboard`

| Cambio | Detalle |
|---|---|
| Dos pestañas | **Dashboard** (tarjetas) y **Exportar** (tabla) |
| Eliminar "Generar" | Desaparece de todas las tarjetas |
| Paginación | 10 tarjetas/página con filtro client-side |
| Tabla Exportar | Checkboxes por formato, botón por fila, carpeta destino |
| Panel progreso | Stream NDJSON en tiempo real por formato |

## Restricciones

- TypeScript sin errores (`tsc --noEmit`) en front y back.
- `back/tmp/` en `.gitignore`; copia temporal NEVER toca `front/src/` ni `front/.next/`.
- `ipa` en Windows → `format-error` inmediato, sin crash ni proceso iniciado.
- Preflight de toolchain obligatorio antes de cada build.
- `"engines": { "node": ">=20.3" }` en `back/package.json`.
- Lock liberado siempre en bloque `finally`.

## Criterio de éxito global

Un tenant con proyecto guardado puede: (1) ir al dashboard, (2) pestaña Exportar, (3) seleccionar Web ZIP, (4) pulsar Exportar, (5) ver el progreso en tiempo real y (6) obtener la ruta del ZIP. Sin terminal, sin error TypeScript, sin crash.
