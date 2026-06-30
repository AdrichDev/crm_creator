# Validation — Exportador multi-plataforma + rediseño Dashboard

> Change: `crm-exportador-multiformato` · Nivel 3
> Convención: cada AC debe ser verificable con un test automatizado o smoke manual documentado.

---

## Bloque B — Back: endpoint y streaming

### B-AC1 — Autenticación obligatoria

- `POST /api/exports` sin `Authorization` header → respuesta `401`.
- `POST /api/exports` con Bearer inválido → respuesta `401`.

### B-AC2 — Content-Type NDJSON

- `POST /api/exports` con request válido → cabecera `Content-Type: application/x-ndjson` en la respuesta.

### B-AC3 — Secuencia de eventos completa (web-zip)

- Dado `{ projectId: "<válido>", formats: ["web-zip"], outputDir: "./exports-test" }`:
  - El stream emite exactamente un evento `format-start` con `format: "web-zip"`.
  - Emite al menos un evento `progress`.
  - Emite exactamente un evento `format-done` con `outputPath` no vacío.
  - El último evento es `complete` con `results[0].success: true`.
  - Cada línea del stream es JSON válido terminado en `\n`.

### B-AC4 — ZIP contiene los tres artefactos

- El archivo en `outputPath` del evento `format-done` (web-zip) es un ZIP que contiene:
  - `manifest.json` — JSON válido.
  - `schema.sql` — texto no vacío.
  - `schema.prisma` — texto no vacío.
- MUST NOT ejecutar `next build` durante la generación del ZIP.

### B-AC5 — format-error en ipa sobre Windows

- Dado `formats: ["ipa"]` ejecutado en Windows:
  - El stream emite `{ type: "format-error", format: "ipa", message: "Requiere macOS" }`.
  - No se crea ningún directorio en `back/tmp/`.
  - El evento `complete` muestra `{ format: "ipa", success: false }`.

### B-AC6 — format-error no cancela otros formatos

- Dado `formats: ["ipa", "web-zip"]` ejecutado en Windows:
  - `ipa` emite `format-error` inmediatamente.
  - `web-zip` se procesa y emite `format-done`.
  - `complete` contiene dos resultados: `ipa` fallido y `web-zip` exitoso.

### B-AC7 — Preflight: toolchain ausente

- Dado `formats: ["exe"]` y electron-builder no instalado:
  - El stream emite `format-error` con mensaje que contiene `"electron-builder"`.
  - No se crea directorio temporal en `back/tmp/`.

### B-AC8 — Lock: 409 en build concurrente

- Dado un build activo en el back:
  - Una segunda `POST /api/exports` recibe `409` con body `{ error: "build_in_progress" }`.
  - La respuesta es inmediata (no espera al build activo).

### B-AC9 — Lock liberado en finally

- Dado un build que falla con excepción inesperada:
  - `isBuildRunning` vuelve a `false` (verificable con una petición siguiente que no recibe 409).

### B-AC10 — Timeout de build

- Dado un mock de build que supera 20 minutos (test con clock fake):
  - El proceso hijo es abortado.
  - `isBuildRunning` vuelve a `false`.
  - El evento `complete` refleja los formatos no completados como `success: false`.

### B-AC11 — Copia temporal no contamina el original

- Al finalizar un build exe (exitoso o fallido):
  - `back/tmp/build-<uuid>/` no existe (limpiado en finally).
  - `front/src/` no contiene archivos modificados por el build.
  - `front/.next/` no fue creado ni modificado por el build.

---

## Bloque S — Código compartido

### S-AC1 — build-sql.ts sin imports browser/React

- `import { buildSQL } from "../shared/generate/build-sql"` compila en contexto Node (back) sin errores.
- `import { buildSQL } from "../shared/generate/build-sql"` compila en contexto Next.js (front) sin errores.

### S-AC2 — tenant-types.ts sin deps browser/React

- El archivo `shared/generate/tenant-types.ts` no importa nada de `react`, `next`, `window`, `document` ni APIs browser.
- `tsc --noEmit` sobre el archivo pasa sin errores.

---

## Bloque F — Front: Dashboard rediseñado

### F-AC1 — Pestañas presentes

- La página `/dashboard` renderiza exactamente dos pestañas: `"Dashboard"` y `"Exportar"`.
- Por defecto, la pestaña activa es `"Dashboard"`.

### F-AC2 — Botón "Generar" eliminado

- Ningún elemento en `/dashboard` contiene el texto `"Generar"` ni una clase/id relacionada con el botón original de generación.
- Búsqueda textual en `front/app/dashboard/page.tsx` y todos los componentes que renderiza: cero ocurrencias del botón "Generar".

### F-AC3 — Paginación en pestaña Dashboard

- Con 25 proyectos mockeados y filtro vacío:
  - La primera página muestra exactamente 10 tarjetas.
  - El botón "Anterior" está deshabilitado.
  - El botón "Siguiente" está habilitado.
- Al pulsar "Siguiente": se muestran las siguientes 10 tarjetas. "Anterior" habilitado.
- Al llegar a la última página: "Siguiente" deshabilitado.

### F-AC4 — Filtro client-side (pestaña Dashboard)

- Con 25 proyectos y filtro `"cafe"`:
  - Solo aparecen tarjetas cuyo `nombre` o `vertical` contiene `"cafe"` (insensible a mayúsculas).
  - No se realiza ninguna petición de red al back.
  - La paginación se ajusta al número de resultados.

### F-AC5 — Tabla Exportar: columnas

- La pestaña Exportar renderiza una tabla con las cabeceras: `Proyecto`, `Cliente`, `Tipo de negocio`, `Formatos`, `Exportar`.

### F-AC6 — Checkboxes de formato

- Cada fila de la tabla muestra checkboxes: `Web ZIP`, `.exe`, `.apk`, `.ipa`.
- `.ipa` está deshabilitado (atributo `disabled`) cuando el entorno es Windows.
- El tooltip de `.ipa` en Windows contiene el texto `"Requiere macOS"`.
- El botón Exportar de una fila está deshabilitado si ningún checkbox está seleccionado.

### F-AC7 — Input carpeta destino

- Encima de la tabla hay un input de texto con valor por defecto `"./exports"`.
- El valor del input se incluye como `outputDir` en la petición `POST /api/exports`.

### F-AC8 — Panel de progreso: secuencia de estados

- Al pulsar Exportar con `Web ZIP` seleccionado:
  - Aparece el panel con el formato en estado `"pendiente"`.
  - Al recibir `format-start`: formato pasa a `"en progreso"` con spinner.
  - Al recibir `progress`: el log muestra el texto del campo `step` y la barra avanza al `pct`.
  - Al recibir `format-done`: formato pasa a `"done ✓"`.
  - Al recibir `complete`: aparece la ruta final y el botón `"Cerrar"`.

### F-AC9 — format-error en panel

- Al recibir `format-error` para un formato:
  - Ese formato muestra estado `"error ✗"` con el mensaje de error.
  - Los demás formatos siguen su flujo normal.

### F-AC10 — Un export a la vez (front)

- Con un export en curso (panel visible):
  - Pulsar Exportar en otra fila muestra el mensaje `"Hay un build en curso"`.
  - No se envía ninguna petición al back.

### F-AC11 — Cerrar panel

- Al pulsar "Cerrar" después de `complete`:
  - El panel desaparece.
  - El botón Exportar de la fila vuelve a estar habilitado.

---

## Bloque T — TypeScript y configuración

### T-AC1 — Sin errores TypeScript

```bash
cd back && npx tsc --noEmit   # 0 errores
cd front && npx tsc --noEmit  # 0 errores
```

### T-AC2 — Node engine declarado

- `back/package.json` contiene `"engines": { "node": ">=20.3" }`.

### T-AC3 — back/tmp en .gitignore

- `back/.gitignore` (o `.gitignore` raíz) contiene una línea que excluye `back/tmp/` o `tmp/`.

---

## Smoke manual

| ID | Paso | Resultado esperado |
|----|------|--------------------|
| SM-01 | Abrir `/dashboard`, clic pestaña "Exportar" | Tabla visible, sin botón "Generar" en ningún lado |
| SM-02 | Seleccionar Web ZIP para un proyecto, pulsar Exportar | Panel de progreso aparece; progreso avanza; ruta final mostrada |
| SM-03 | Mientras SM-02 activo, pulsar Exportar en otra fila | Mensaje "Hay un build en curso" visible; sin segunda petición |
| SM-04 | Cerrar panel, volver a pestaña Dashboard | Grid de tarjetas sin botón "Generar"; paginación funcional |
| SM-05 | En Windows: checkbox `.ipa` | Deshabilitado con tooltip "Requiere macOS" |
