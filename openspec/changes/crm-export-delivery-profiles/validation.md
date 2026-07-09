# Validación — crm-export-delivery-profiles

Historia: como **operador de la plataforma** que exporta la app de un tenant, quiero declarar en
la exportación si el paquete es interno (yo compilo el binario y el cliente solo recibe el
artefacto compilado) o entregable (el cliente recibe fuente + instrucciones), para que cada ZIP
salga con el README correcto para su destinatario y ningún paquete cara al cliente contenga
referencias internas de mi pipeline de compilación.

## Criterios de aceptación (AC)
- **AC1 (contrato):** `POST /api/exports` acepta `deliverable: 'binary' | 'binary+source'`;
  valor no reconocido → 400 `invalid_deliverable`; ausente → `'binary+source'` (comportamiento
  actual preservado).
- **AC2 (trazabilidad):** el `deliverable` de la petición queda registrado en el `ExportJob` y
  en el `manifest.json` dentro del ZIP de los 4 formatos.
- **AC3 (README operador):** con `'binary'`, el README del ZIP de cada formato es la variante de
  pipeline del operador y abre con el aviso "PAQUETE INTERNO — no entregar al cliente"; en
  `web-zip`, la variante `'binary'` es el README interno de deploy/hosting.
- **AC4 (README cliente, anti-fuga):** con `'binary+source'`, el README es la variante cara al
  cliente y NO contiene ningún marcador interno del operador (nombres de keystore, rutas
  locales, URLs internas — lista de marcadores en el test).
- **AC5 (UI):** la tabla de exportación ofrece las 2 opciones como radios, con
  `'binary+source'` preseleccionado, y el POST envía la elegida.
- **AC6 (fuera de alcance verificable):** ningún builder invoca compilación (gradle, xcodebuild,
  electron-builder); los 4 siguen produciendo ZIPs de fuente. `tsc` limpio en `back/` y
  `front/`; suites verdes.

## Por tarea (Given-When-Then + test)
- **WU1.1-1.2** Contrato y propagación → Given un body con `deliverable: 'x'`, When
  `createExportHandler`, Then 400 `invalid_deliverable`; Given un body sin `deliverable`, When
  se arranca el job, Then `startJob` recibe `'binary+source'`; Given `deliverable: 'binary'`,
  Then el `ExportJob` lo registra tal cual. Test: ampliar la suite de handlers de
  `exports.ts` (deps inyectadas, sin BD ni lock).
- **WU1.3-1.4** Manifest → Given una exportación con `deliverable: 'binary'` en cada formato,
  When se lee el `manifest.json` del ZIP resultante, Then declara `"deliverable": "binary"`
  (y `'binary+source'` en el caso simétrico). Test: ampliar
  `export-builders-web-zip.test.ts` y suites hermanas leyendo el contenido del ZIP.
- **WU2.1** Variante operador → Given `deliverable: 'binary'`, When `buildWebZip`/`buildApk`/
  `buildExe`/`buildIpa`, Then el `README.md` del ZIP contiene el aviso "PAQUETE INTERNO" y pasos
  del pipeline del operador. Test: caso nuevo por builder (parametrizable).
- **WU2.2-2.3** Anti-fuga cliente → Given `deliverable: 'binary+source'` (explícito y por
  default), When se genera el ZIP de cada formato, Then el `README.md` no matchea ninguno de los
  marcadores prohibidos de la lista del test y los tests de regresión existentes siguen verdes.
  Test: `export-readme-leak.test.ts` (parametrizado por los 4 builders) + suites existentes sin
  tocar.
- **WU3.1-3.3** Selector UI → Given la tabla de exportación renderizada, When el operador no
  toca nada y exporta, Then el POST lleva `deliverable: 'binary+source'`; When selecciona "Solo
  binario" y exporta, Then el POST lleva `'binary'`. Test: ampliar
  `front/tests/export-job.test.tsx` (render + interacción + inspección del body).

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Pendiente de aprobación antes de codear. Dependencia blanda:
`crm-export-clean-manifest` (mismo punto de generación de README); orden recomendado
`clean-manifest` → esta change (ver `proposal.md` § Riesgos).
