# Spec — Exportador multi-plataforma + rediseño Dashboard

> Change: `crm-exportador-multiformato` · Nivel 3

---

## Requisitos Funcionales

### RF-01 — Endpoint de exportación
El back MUST exponer `POST /api/exports` con `Authorization: Bearer` obligatorio. Sin token válido → `401`.

### RF-02 — Protocolo NDJSON streaming
La respuesta MUST usar `Content-Type: application/x-ndjson`. Cada línea es un JSON completo terminado en `\n`. El front consume el stream con `fetch + ReadableStream`.

Tipos de evento obligatorios:
- `format-start` — inicio de un formato
- `progress` — paso intermedio con `pct: number`
- `format-done` — éxito con `outputPath`
- `format-error` — fallo de un formato con `message` (no cancela los demás)
- `complete` — evento final con array `results[]`

### RF-03 — Formato `web-zip`
MUST generar un ZIP que contiene `manifest.json` + `schema.sql` + `schema.prisma`. MUST NOT ejecutar `next build`.

### RF-04 — Formato `exe`
MUST copiar `front/` a `back/tmp/build-<uuid>/`, escribir `NEXT_PUBLIC_TENANT_JSON=<TenantConfig>` en `.env.local` de la copia, ejecutar `next build` (static export) y `electron-builder` → `.exe` portable. La copia MUST eliminarse en `finally`.

### RF-05 — Formato `apk`
MUST ejecutar `next build` + `capacitor sync` + `gradlew assembleRelease` → `.apk`. Misma estrategia de copia temporal que RF-04.

### RF-06 — Formato `ipa` (solo macOS)
En Windows MUST emitir `format-error` inmediatamente con `message: "Requiere macOS"`. MUST NOT iniciar ningún proceso. El stream continúa con el resto de formatos.

### RF-07 — Lock de build
Si hay un build activo, una segunda petición MUST recibir `409 { error: "build_in_progress" }` sin iniciar ningún proceso. Lock liberado siempre en `finally`.

### RF-08 — Timeout de build
Si el build activo supera 20 minutos, MUST abortarse y el lock liberarse. Los formatos no completados MUST aparecer como fallidos en `complete`.

### RF-09 — Preflight de toolchain
Antes de iniciar cada formato MUST verificar que su toolchain existe (`electron-builder`, `java`, `gradle`). Si falta → emitir `format-error` con mensaje accionable. MUST NOT empezar el build de ese formato.

### RF-10 — Código compartido sin deps browser
`build-sql.ts`, `build-prisma.ts`, `build-manifest.ts` y `tenant-types.ts` MUST residir en `creador_CRM/shared/generate/` sin importaciones React ni browser API. Front y back importan desde ahí.

### RF-11 — Dashboard: pestañas
La página `/dashboard` MUST tener dos pestañas en la parte superior: **Dashboard** y **Exportar**.

### RF-12 — Pestaña Dashboard
MUST mostrar grid de tarjetas de proyectos. El botón "Generar" MUST eliminarse de TODAS las tarjetas. Paginación de 10 tarjetas/página (Anterior / Siguiente). Filtro por nombre/vertical: client-side, estado local, sin petición al back.

### RF-13 — Pestaña Exportar
MUST mostrar tabla con columnas: **Proyecto | Cliente | Tipo de negocio | Formatos | Exportar**.
- Columna Formatos: checkboxes `Web ZIP / .exe / .apk / .ipa`. `.ipa` desactivado en Windows con tooltip `"Requiere macOS"`. Al menos un formato seleccionado para habilitar el botón Exportar.
- Columna Exportar: botón por fila. Input de carpeta destino encima de la tabla (default `./exports`).

### RF-14 — Un export a la vez (front)
Si hay un export en curso, pulsar Exportar en otra fila MUST mostrar el mensaje `"Hay un build en curso"` sin enviar petición.

### RF-15 — Panel de progreso
Al pulsar Exportar MUST aparecer un panel/modal inline con:
- Nombre del proyecto + formatos seleccionados.
- Estado por formato: `pendiente → en progreso (spinner) → done ✓ / error ✗`.
- Barra de progreso global (%).
- Log del paso actual (texto del campo `step` del evento `progress`).
- Al llegar `complete`: ruta final y botón "Cerrar".

---

## Requisitos No Funcionales

| ID | Requisito |
|----|-----------|
| RNF-01 | `tsc --noEmit` sin errores en front y back tras el cambio |
| RNF-02 | `"engines": { "node": ">=20.3" }` en `back/package.json` |
| RNF-03 | `back/tmp/` en `back/.gitignore` |
| RNF-04 | La copia temporal NEVER escribe en `front/src/` ni `front/.next/` originales |
| RNF-05 | Lock liberado en bloque `finally`, no en `catch` suelto |
| RNF-06 | Abort de proceso hijo: combinación manual de señales (no `AbortSignal.any`) |
| RNF-07 | `ipa` en Windows: NEVER causa crash ni excepción no capturada |

---

## Casos de Uso

### UC-01 — Exportar web-zip exitoso

- **GIVEN** el back recibe `POST /api/exports` con `{ projectId, formats: ["web-zip"], outputDir: "./exports" }` y Bearer válido
- **WHEN** procesa el stream
- **THEN** emite: `format-start` → uno o más `progress` → `format-done` con `outputPath` → `complete` con `results[0].success: true`
- **AND** el ZIP resultante contiene exactamente `manifest.json`, `schema.sql`, `schema.prisma`
- **AND** no se ejecuta `next build`

### UC-02 — Exportar exe en Windows

- **GIVEN** electron-builder está instalado y el back corre en Windows
- **WHEN** se solicita `formats: ["exe"]`
- **THEN** se crea `back/tmp/build-<uuid>/` con una copia de `front/`, se escribe `.env.local` con `NEXT_PUBLIC_TENANT_JSON`, se ejecuta `next build` + `electron-builder`
- **AND** se emite `format-done` con la ruta al `.exe`
- **AND** `back/tmp/build-<uuid>/` es eliminado al finalizar (incluso si el build falla)

### UC-03 — Exportar ipa en Windows

- **GIVEN** el back corre en Windows
- **WHEN** se solicita `formats: ["ipa"]`
- **THEN** el back emite `format-error` con `{ format: "ipa", message: "Requiere macOS" }` inmediatamente
- **AND** NO se inicia ningún proceso de build
- **AND** el stream sigue con los demás formatos solicitados (si los hay)
- **AND** el evento `complete` muestra `ipa` como `success: false`

### UC-04 — Lock: segunda petición mientras build activo

- **GIVEN** hay un build activo en el back (`isBuildRunning = true`)
- **WHEN** llega una segunda `POST /api/exports`
- **THEN** el back responde `409 { error: "build_in_progress" }` sin iniciar ningún proceso

### UC-05 — Timeout de build

- **GIVEN** un build ha estado activo más de 20 minutos
- **WHEN** se dispara el timeout de guarda
- **THEN** el proceso de build es abortado, el lock liberado y el evento `complete` muestra los formatos no completados como `success: false`

### UC-06 — Preflight fallido (toolchain ausente)

- **GIVEN** se solicita `formats: ["exe", "web-zip"]` y electron-builder no está instalado
- **WHEN** el back ejecuta el preflight para `exe`
- **THEN** emite `format-error` para `exe` con mensaje `"electron-builder no encontrado"`
- **AND** continúa procesando `web-zip` normalmente
- **AND** el evento `complete` refleja ambos resultados

### UC-07 — Dashboard: cambio de pestaña

- **GIVEN** el usuario está en `/dashboard` (pestaña Dashboard activa)
- **WHEN** hace clic en la pestaña "Exportar"
- **THEN** aparece la tabla con columnas Proyecto | Cliente | Tipo de negocio | Formatos | Exportar
- **AND** desaparece el grid de tarjetas

### UC-08 — Dashboard: filtrar proyectos (pestaña Dashboard)

- **GIVEN** hay 15 proyectos cargados y el usuario está en la pestaña Dashboard
- **WHEN** escribe "cafe" en el input de filtro
- **THEN** solo se muestran tarjetas cuyo nombre o vertical contiene "cafe" (insensible a mayúsculas)
- **AND** la paginación se ajusta al número de resultados filtrados
- **AND** no se realiza ninguna petición al back

### UC-09 — Dashboard: paginación (pestaña Dashboard)

- **GIVEN** hay 25 proyectos y el filtro está vacío
- **WHEN** el usuario llega a la pestaña Dashboard
- **THEN** se muestran 10 tarjetas (página 1 de 3) con botón "Siguiente" habilitado y "Anterior" deshabilitado
- **WHEN** pulsa "Siguiente"
- **THEN** se muestran las siguientes 10 tarjetas

### UC-10 — Progreso en tiempo real

- **GIVEN** el usuario selecciona `Web ZIP` y `.exe` para un proyecto y pulsa Exportar
- **WHEN** el panel de progreso aparece
- **THEN** ambos formatos muestran estado "pendiente"
- **AND** a medida que llegan eventos NDJSON, el estado de cada formato avanza (`en progreso → done / error`)
- **AND** la barra global muestra el porcentaje acumulado
- **AND** al llegar `complete`, se muestra la ruta del artefacto y el botón "Cerrar"

### UC-11 — Un export a la vez (front)

- **GIVEN** hay un export en curso con el panel de progreso visible
- **WHEN** el usuario pulsa "Exportar" en otra fila de la tabla
- **THEN** aparece el mensaje `"Hay un build en curso"`
- **AND** no se envía ninguna petición al back

---

## Interfaces TypeScript (back)

```typescript
// POST /api/exports — body
interface ExportRequest {
  projectId: string;
  formats: Array<"web-zip" | "exe" | "apk" | "ipa">;
  outputDir?: string; // default: "./exports"
}

// Eventos NDJSON (una línea por evento)
type ExportEvent =
  | { type: "format-start"; format: string; index: number; total: number }
  | { type: "progress";     format: string; step: string; pct: number }
  | { type: "format-done";  format: string; outputPath: string }
  | { type: "format-error"; format: string; message: string }
  | { type: "complete";     results: FormatResult[] };

interface FormatResult {
  format: string;
  success: boolean;
  outputPath?: string;
  error?: string;
}

// shared/generate/tenant-types.ts — sin deps React/browser
interface TenantConfig {
  projectId: string;
  projectName: string;
  vertical: string;
  clientName: string;
  modules: string[];
  // resto de campos de configuración CRM
}
```

---

## Mapa de archivos

### Nuevos

| Archivo | Responsabilidad |
|---------|-----------------|
| `back/src/routes/exports.ts` | Handler `POST /api/exports`, streaming NDJSON, orquestación |
| `back/src/lib/export-lock.ts` | Estado `isBuildRunning`, timeout 20 min, release en finally |
| `back/src/lib/export-preflight.ts` | Verificación de toolchain por formato |
| `back/src/lib/export-temp-copy.ts` | Copia `front/ → back/tmp/build-<uuid>/`, escritura `.env.local`, limpieza |
| `back/src/lib/export-builders/web-zip.ts` | Generación ZIP (sin next build) |
| `back/src/lib/export-builders/exe.ts` | next build + electron-builder |
| `back/src/lib/export-builders/apk.ts` | next build + capacitor + gradle |
| `back/src/lib/export-builders/ipa.ts` | format-error inmediato en Windows |
| `shared/generate/build-sql.ts` | Fuente única: generación SQL (portada de front/lib/generate/build.ts) |
| `shared/generate/build-prisma.ts` | Fuente única: generación schema Prisma |
| `shared/generate/build-manifest.ts` | Fuente única: generación manifest.json |
| `shared/generate/tenant-types.ts` | TenantConfig sin deps React/browser |
| `front/components/dashboard/dashboard-tabs.tsx` | Componente de pestañas (Dashboard / Exportar) |
| `front/components/dashboard/export-table.tsx` | Tabla con checkboxes, botón por fila, input carpeta |
| `front/components/dashboard/export-progress.tsx` | Panel de progreso (estados por formato, barra global) |
| `front/lib/export/use-export-stream.ts` | Hook: fetch + ReadableStream NDJSON → estado progreso |

### Modificados

| Archivo | Cambio |
|---------|--------|
| `back/src/routes/index.ts` | Registrar ruta `POST /api/exports` |
| `back/package.json` | Añadir `"engines": { "node": ">=20.3" }` |
| `back/.gitignore` | Añadir línea `tmp/` |
| `front/app/dashboard/page.tsx` | Reemplazar layout con dos pestañas; eliminar botón "Generar" de tarjetas |
| `front/lib/generate/build.ts` | Re-exportar desde `shared/generate/` (o mover lógica) |
