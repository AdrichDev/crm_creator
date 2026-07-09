# crm-export-delivery-profiles

## Intención
Introducir un campo `deliverable: 'binary' | 'binary+source'` en `POST /api/exports` que declare
QUIÉN es el destinatario del ZIP generado y adapte el paquete a ese destinatario: `'binary'`
produce un paquete INTERNO para el operador (que compila el binario en su máquina y entrega al
cliente solo el artefacto compilado — `.apk`/`.exe`/etc.), mientras que `'binary+source'` produce
el paquete CARA AL CLIENTE actual (código fuente + instrucciones de compilación/self-host). La
diferencia material entre ambos es la variante de README empaquetada y la garantía de que el
paquete cara al cliente no contiene referencias internas del operador. La compilación server-side
queda explícitamente FUERA de alcance (los builders siguen produciendo solo ZIPs de fuente).

## Problema
Verificado en código (`back/src/routes/exports.ts`, `back/src/lib/export-builders/*.ts`,
`back/src/lib/export-job-manager.ts`):

- **Un solo tipo de paquete para dos audiencias distintas.** `POST /api/exports`
  (`createExportHandler`, línea ~130 de `exports.ts`) acepta `projectId`, `formats` y `outputDir`;
  no existe forma de expresar si el ZIP es para el cliente final o para el propio operador. Los 4
  builders (`web-zip.ts`, `apk.ts`, `exe.ts`, `ipa.ts`) producen SIEMPRE el mismo paquete de
  código fuente con un único README.
- **README con audiencia ambigua.** Cada builder genera su README inline (`renderReadme()`, p.ej.
  `web-zip.ts` línea 68, `apk.ts` línea 48, `exe.ts` línea 42, `ipa.ts` línea 48) dirigido hoy a
  un lector genérico. En la operativa real, quien compila el binario es el operador (Android SDK +
  keystore para `apk`, electron-builder en Windows para `exe`, Xcode en macOS para `ipa`): las
  instrucciones que ÉL necesita (pipeline local, keystore, flags de firma) no son las que debe
  recibir el cliente, y viceversa (self-host, requisitos mínimos, sin nombres de keystore ni URLs
  internas).
- **Sin trazabilidad del perfil de entrega.** Ni el job (`ExportJob`, `export-job-manager.ts`
  línea 38) ni el `manifest.json` del ZIP (`web-zip.ts` línea 183) registran para quién se
  generó el paquete; a posteriori no se puede distinguir un ZIP interno de uno entregable.
- **Riesgo de fuga de referencias internas.** Si un README de operador (con nombre de keystore,
  rutas locales o URLs internas) acabara en un ZIP entregado al cliente, sería una fuga
  operacional. Hoy no hay ninguna barrera que lo impida porque no existe la distinción.

## Alcance
- **Campo `deliverable` en el contrato HTTP.** `POST /api/exports` acepta
  `deliverable?: 'binary' | 'binary+source'`; ausente → `'binary+source'` (compatibilidad hacia
  atrás: el comportamiento actual es el paquete cara al cliente). Valor no reconocido → 400
  (mismo patrón que `invalid_format`).
- **Propagación y persistencia.** `deliverable` viaja por `StartJobParams` → `ExportJob` →
  contexto de build de cada builder, y se persiste en el `manifest.json` dentro del ZIP.
- **Variantes de README por deliverable.** Cada builder genera dos variantes:
  - `'binary'` → README de pipeline de compilación del operador (pasos con SDK/keystore/Xcode
    locales, sin instrucciones de self-host para cliente). El ZIP es interno; el cliente nunca
    lo ve.
  - `'binary+source'` → README cara al cliente (compilación/self-host), con CERO referencias
    internas del operador (sin nombres de keystore, sin URLs internas, sin rutas locales).
- **Matiz `web-zip`.** El formato web no produce un binario compilable; `web-zip` acepta ambos
  valores, pero `'binary'` significa "el operador alojará el sitio" → README interno de deploy
  (pipeline de hosting del operador), y `'binary+source'` mantiene el README de self-host actual.
- **Selector en el front.** La UI de exportación (`front/components/dashboard/export-table.tsx`)
  añade la elección de deliverable con 2 opciones radio, enviada en el body del POST.
- **Fuera de alcance:** compilación server-side de binarios (los builders siguen siendo
  source-only; se documenta como fase futura), cambios en allowlist/`.env.local`
  (es `crm-export-clean-manifest`), runtime de las apps exportadas
  (`crm-export-runtime-config`), migraciones de datos (los jobs viven en memoria, no hay modelo
  Prisma afectado).

## Riesgos
- **Solape con `crm-export-clean-manifest` (pendiente, no implementada).** Ambas changes tocan la
  generación de README/`.env.local` en los 4 builders. Mitigación: esta change solo añade la
  variante de README y el metadato; si `clean-manifest` aterriza primero, el punto de generación
  del README es el mismo (`renderReadme` por builder) y el conflicto es de merge textual, no de
  diseño. Orden recomendado: `clean-manifest` primero.
- **Fuga inversa.** El riesgo nuevo es empaquetar el README de operador en un ZIP
  `'binary+source'`. Mitigación: test por builder que verifica que el README del ZIP
  cara al cliente no contiene marcadores internos (nombre de keystore, rutas locales) y que el
  `manifest.json` declara el deliverable correcto.
- **Default y compatibilidad.** Clientes del API existentes (front actual, tests) no envían
  `deliverable`; el default `'binary+source'` preserva el output actual byte-a-byte salvo por el
  nuevo campo en `manifest.json` (cambio aditivo, no rompe consumidores del manifest).
- **`web-zip` semántica.** Tratar `'binary'` en web como "operador aloja" es una convención, no
  una restricción técnica; queda documentada en el README interno de deploy para evitar que un
  operador confunda el paquete interno con el entregable.

## Dependencias
- **Blanda** sobre `crm-export-clean-manifest` (pendiente): comparte los puntos de generación de
  README y `.env.local` fresco en los builders; no bloquea, pero conviene aterrizar
  `clean-manifest` primero para minimizar conflictos.
- Ninguna dependencia sobre `crm-export-runtime-config`.
- Código existente: `back/src/routes/exports.ts`, `back/src/lib/export-job-manager.ts`,
  `back/src/lib/export-builders/*.ts`, `front/components/dashboard/export-table.tsx`.
