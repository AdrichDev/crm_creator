# OpenSpec: ZIP Source Export para Apps Moviles y Escritorio

## Intent
Sustituir la compilacion pesada en servidor (Gradle, Xcode, Electron-builder) por una exportacion limpia del codigo fuente (ZIP). Esto elimina los cuellos de botella y fallos por dependencias de compilacion en el servidor, trasladando la construccion a la maquina local del cliente.

## Scope
- Modificacion de los builders `apk.ts`, `exe.ts` (e `ipa.ts`) en `creador_CRM/back` para que emitan archivos ZIP en lugar de binarios.
- Modificacion de los textos y extensiones en el front de `creador_CRM` para reflejar que se descargan codigos fuente ZIP.

## Risks
- Los usuarios tendran que instalar dependencias localmente (Node, Android Studio) para generar sus binarios.

## Dependencies
- Paquete `archiver` para generar los ZIPs (ya instalado en el back).
