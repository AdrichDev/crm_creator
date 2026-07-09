# Tareas — crm-export-delivery-profiles

Alcance: flag `deliverable` (API + job + manifest) + variantes de README por builder + selector
en la UI de exportación. Orden = por dependencia (contrato y propagación → variantes README →
front). Compilación server-side FUERA de alcance. Review gate antes de cualquier push.

## WU1 — Contrato `deliverable`: route + job manager + manifest
- [x] 1.1 `back/src/lib/export-job-manager.ts`: exportar `type Deliverable = 'binary' |
  'binary+source'`; añadir el campo a `StartJobParams`, `ExportJob` y al contexto de build que
  reciben los builders.
- [x] 1.2 `back/src/routes/exports.ts`: aceptar `deliverable` en el body de
  `createExportHandler`, validar contra `VALID_DELIVERABLES` (400 `invalid_deliverable` si no
  reconocido), default `'binary+source'`, pasar a `startJob`.
- [x] 1.3 Estampar `deliverable` en `manifest.json`: campo nuevo en el manifest de `web-zip`;
  manifest mínimo (`format`, `deliverable`, `generatedAt`, `business.name`) en `apk`/`exe`/`ipa`.
- [x] 1.4 Test route (handlers con deps inyectadas): inválido → 400; ausente → `startJob` recibe
  `'binary+source'`; explícito → se propaga. Test manifest: el ZIP de cada formato declara el
  `deliverable` de la petición.

## WU2 — Variantes de README por builder
- [x] 2.1 `renderReadme(productName, deliverable)` en los 4 builders: variante `'binary'` =
  pipeline de compilación/deploy del operador con aviso inicial "PAQUETE INTERNO — no entregar
  al cliente" (en `web-zip`, README interno de deploy/hosting); variante `'binary+source'` =
  instrucciones cara al cliente (equivalente funcional al README actual).
- [x] 2.2 Barrera anti-fuga: la variante `'binary+source'` no contiene marcadores internos
  (nombres de keystore, rutas locales, URLs internas); lista de marcadores prohibidos definida
  en el test, no en producción.
- [x] 2.3 Test por builder (ampliar suites existentes): con `'binary'`, README con aviso interno
  y pasos de operador; con `'binary+source'`, README sin ningún marcador prohibido; regresión:
  sin `deliverable`, los tests actuales siguen verdes (variante cliente por default).

## WU3 — Front: selector de deliverable
- [x] 3.1 `front/components/dashboard/export-table.tsx`: grupo de 2 radios bajo la selección de
  formato ("Cliente" / "Interno", espejo de `Deliverable`), `'binary+source'` preseleccionado;
  ampliar firma de `onExport`.
- [x] 3.2 DESVIACIÓN: el POST real vive en `front/lib/export/use-export-job.ts` (no en
  `export-job-context.tsx`, que solo envuelve el hook + auto-resume). `use-export-job.ts` ya
  serializa `params` completo sin tocar campo a campo, así que basta con añadir `deliverable` a
  `StartExportParams` (`front/lib/export/types.ts`) y propagarlo desde
  `dashboard-tabs.tsx::handleExport` → `startExport({ projectId, formats, deliverable }, handle)`.
- [x] 3.3 Test front (ampliar `front/tests/export-job.test.tsx`): las 2 opciones se renderizan
  con el default correcto y el POST lleva el valor elegido.

## Cierre
- [x] Z.1 `tsc` limpio en `back/` y `front/`.
- [x] Z.2 Suites completas de `back/` (node:test) y `front/` (vitest) verdes, incluidos los
  tests nuevos de WU1-WU3.
- [ ] Z.3 Review gate antes de cualquier push (foco: que ningún marcador interno pueda acabar en
  un ZIP `'binary+source'` y que el default preserve el comportamiento actual). Pendiente: gate
  de revisión externo (fuera del alcance de `sdd-apply`), no ejecutado en esta sesión.
- [x] Z.4 `crm-export-clean-manifest` ya aterrizó (`buildEnvContent`/`writeFreshEnvLocal`
  single-writer intacto); las variantes de README se integran en el mismo punto de generación
  (`renderReadme` inline por builder) sin duplicar lógica de `.env.local`/allowlist.
- [ ] Z.5 Documentar en el README interno (`'binary'`) que la compilación server-side es fase
  futura; actualizar `ARQUITECTURA.md`/Engram si documentan el flujo de exportación. Pendiente:
  `ARQUITECTURA.md` no cubre el flujo de exportación en absoluto (ninguna mención de
  export/README/manifest) — añadir una sección nueva excede el alcance de esta change; se deja
  para una change de documentación dedicada. El "fase futura" ya queda anotado inline en el
  README operador de `web-zip.ts` (comentario de código, no en el texto entregado al operador).
