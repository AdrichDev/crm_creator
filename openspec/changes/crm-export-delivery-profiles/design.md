# Diseño técnico — crm-export-delivery-profiles

## 1. Contrato HTTP: campo `deliverable`

`POST /api/exports` (`back/src/routes/exports.ts`, `createExportHandler` línea ~130) acepta un
campo opcional nuevo en el body:

```
{
  projectId: string,
  formats: BuildFormat[],
  outputDir?: string,
  deliverable?: 'binary' | 'binary+source'   // nuevo; ausente → 'binary+source'
}
```

Validación junto al bloque actual de `formats` (mismo patrón que `invalid_format`,
`VALID_FORMATS` línea 44):

```
const VALID_DELIVERABLES: ReadonlySet<string> = new Set(['binary', 'binary+source']);
const deliverable = req.body.deliverable ?? 'binary+source';
if (!VALID_DELIVERABLES.has(String(deliverable))) {
  return res.status(400).json({ error: { code: 'invalid_deliverable', message: ... } });
}
```

Semántica:
- `'binary'`: paquete INTERNO de operador. El cliente solo recibirá el artefacto compilado
  (`.apk`/`.exe`/`.ipa`) o, en web, el sitio alojado por el operador. El ZIP nunca llega al
  cliente.
- `'binary+source'` (default, comportamiento actual): paquete CARA AL CLIENTE con código fuente
  e instrucciones de compilación/self-host, sin referencias internas del operador.
- `web-zip` acepta ambos: `'binary'` = "el operador aloja" (README interno de deploy);
  `'binary+source'` = README de self-host actual. No hay valor rechazado por formato.

## 2. Propagación por el job manager

`back/src/lib/export-job-manager.ts`:

- `StartJobParams` (línea 75): añadir `deliverable: Deliverable` (tipo exportado
  `type Deliverable = 'binary' | 'binary+source'`, junto a `BuildFormat`).
- `ExportJob` (línea 38): añadir `deliverable: Deliverable` (trazabilidad del job en
  `GET /:id`; los jobs viven en memoria, sin migración de datos).
- `JobBuildContext` (línea ~204, `ctx` que reciben los builders): añadir `deliverable`. Cada
  builder lo lee de su contexto igual que hoy lee `config`/`outputDir`/`frontDir`.
- El handler (`createExportHandler`) pasa `deliverable` en `startJob({...})`.

## 3. Variantes de README por builder

Hoy cada builder genera su README con un template literal inline
(`renderReadme(productName)`: `web-zip.ts:68`, `apk.ts:48`, `exe.ts:42`, `ipa.ts:48`) y lo
añade con `archive.append(readme, { name: 'README.md' })`. El cambio:

```
function renderReadme(productName: string, deliverable: Deliverable): string
```

Con dos ramas por builder:

| Formato | `'binary+source'` (cliente) | `'binary'` (operador) |
|---|---|---|
| `web-zip` | Self-host actual (sin cambios de fondo) | Pipeline interno de deploy/hosting del operador |
| `apk` | Compilación Android genérica para el cliente (SDK propio, keystore propio) | Pipeline local del operador: SDK en ruta local, keystore de release y flags de firma (referencias operativas reales) |
| `exe` | Compilación electron-builder genérica para el cliente | Pipeline local del operador en Windows (electron-builder + firma si aplica) |
| `ipa` | Compilación Xcode genérica para el cliente (su cuenta Apple Developer) | Pipeline del operador en macOS (Xcode, firma con su cuenta) |

Reglas duras:
- La variante `'binary+source'` NO contiene: nombres de keystore, rutas locales de la máquina
  del operador, URLs internas, credenciales ni alias de firma. Se define una lista de marcadores
  prohibidos (p.ej. `operaos-release.jks`, `C:\\Android`, alias de keystore) usada por el test
  transversal (§6) — la lista vive en el propio test, no en producción.
- La variante `'binary'` abre con un aviso explícito: "PAQUETE INTERNO — no entregar al
  cliente" (primera línea del README), para que el ZIP sea distinguible al abrirlo.
- Si `crm-export-clean-manifest` aterriza primero y mueve/reorganiza `renderReadme`, esta change
  se adapta al punto de generación resultante; el contrato (dos variantes por builder) no cambia.

## 4. `manifest.json`

`web-zip.ts` (línea 183) empaqueta `manifest.json` generado en memoria. Se añade el campo:

```
{ ..., "deliverable": "binary" | "binary+source" }
```

Los formatos que hoy no empaquetan `manifest.json` (`apk`/`exe`/`ipa` solo llevan README) pasan
a incluir un `manifest.json` mínimo (`{ format, deliverable, generatedAt, business.name }`) o,
si se prefiere mantenerlos sin manifest, el deliverable queda registrado solo en el README y en
el `ExportJob`. Decisión: incluir el manifest mínimo en los 4 formatos — es barato, uniforme y
da trazabilidad al ZIP suelto sin depender del job en memoria (que expira a los ~30 min,
`RETENTION_MS`).

## 5. Front: selector de deliverable

`front/components/dashboard/export-table.tsx` (selección de formato ya es radio, línea ~230):

- Añadir un segundo grupo de 2 radios bajo la selección de formato:
  - "Solo binario (paquete interno de compilación)" → `'binary'`
  - "Binario + código fuente (entregable al cliente)" → `'binary+source'` (preseleccionado)
- El callback `onExport(projectId, formats, handle)` incorpora `deliverable` (firma ampliada) y
  `front/lib/export/export-job-context.tsx` lo envía en el body del POST.
- Sin persistencia de preferencia (se elige por exportación); sin cambios de layout más allá del
  grupo de radios.

## 6. Archivos afectados

| Archivo | Cambio |
|---|---|
| `back/src/routes/exports.ts` | Validación `deliverable` + default + paso a `startJob`. |
| `back/src/lib/export-job-manager.ts` | Tipo `Deliverable`; campo en `StartJobParams`/`ExportJob`/`JobBuildContext`. |
| `back/src/lib/export-builders/web-zip.ts` | `renderReadme(name, deliverable)` 2 variantes; `deliverable` en `manifest.json`. |
| `back/src/lib/export-builders/apk.ts` | 2 variantes README; manifest mínimo con `deliverable`. |
| `back/src/lib/export-builders/exe.ts` | 2 variantes README; manifest mínimo con `deliverable`. |
| `back/src/lib/export-builders/ipa.ts` | 2 variantes README; manifest mínimo con `deliverable`. |
| `front/components/dashboard/export-table.tsx` | Grupo de radios deliverable. |
| `front/lib/export/export-job-context.tsx` | `deliverable` en el body del POST. |

## 7. Data flow

`POST /api/exports { ..., deliverable }` → validación (400 si inválido, default
`'binary+source'`) → `startJob({ ..., deliverable })` → `ExportJob.deliverable` → contexto de
build → cada builder elige variante de README y estampa `deliverable` en `manifest.json` → ZIP
en `outputDir` → `GET /:id/download`. La compilación del binario sigue siendo un paso MANUAL del
operador fuera de la plataforma (fase futura documentada, no parte de esta change).

## 8. Estrategia de test

- **Route (unit, handlers con deps inyectadas — patrón existente `ExportsDeps`):**
  `deliverable` inválido → 400 `invalid_deliverable`; ausente → `startJob` recibe
  `'binary+source'`; explícito → se propaga tal cual.
- **Builder (unit por formato, ampliando suites existentes tipo
  `export-builders-web-zip.test.ts`):** con `deliverable: 'binary'`, el README del ZIP contiene
  el aviso "PAQUETE INTERNO" y pasos de pipeline de operador; con `'binary+source'`, el README no
  contiene ninguno de los marcadores internos prohibidos (lista en el test) y el
  `manifest.json` del ZIP declara el `deliverable` correcto en ambos casos.
- **Regresión:** llamada sin `deliverable` produce un ZIP cuyo README es la variante cliente
  (equivalente funcional al actual) — los tests existentes de builders siguen verdes con el
  default.
- **Front (vitest, ampliando `front/tests/export-job.test.tsx`):** el selector renderiza las 2
  opciones con `'binary+source'` preseleccionado y el POST lleva el valor elegido.
- `tsc` limpio en `back/` y `front/`.
