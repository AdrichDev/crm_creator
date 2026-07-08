# Design

## Technical Approach
Vamos a simplificar los archivos `apk.ts`, `exe.ts` y `ipa.ts` para que solo realicen:
1. `createTempCopy`: copia del entorno base de Next.js + Capacitor.
2. Inyeccion de configuraciones (`capacitor.config.ts`, `package.json`, variables `.env.local` con API en prod).
3. Compresion a ZIP via `archiver`.

Se elimina el spawn de procesos de node (`npm ci`, `next build`) y dependencias nativas.

## Archivos a Modificar
- `creador_CRM/back/src/lib/export-builders/apk.ts`
- `creador_CRM/back/src/lib/export-builders/exe.ts`
- `creador_CRM/back/src/lib/export-builders/ipa.ts`
- `creador_CRM/front/components/dashboard/export-table.tsx`
- `creador_CRM/front/components/dashboard/export-header-progress.tsx`
