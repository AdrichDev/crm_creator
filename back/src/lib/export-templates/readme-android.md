# {{PRODUCT_NAME}} — Aplicacion Android (APK)

Este paquete contiene la aplicacion Android de **{{PRODUCT_NAME}}**, generada con
Capacitor a partir de la version web estatica del panel y firmada para su
instalacion en dispositivos reales.

## Contenido del ZIP

- `app-release.apk` — APK **firmado** listo para instalar en un movil o tablet
  Android.
- `mobile-src/` — Codigo fuente completo (Next.js + Capacitor + proyecto
  `android/`) usado para generar el APK. Permite recompilar desde cero.
- `README.md` — Este documento.

## Como instalar el APK

### Opcion A — Instalacion directa en el dispositivo

1. Copia `app-release.apk` al telefono (cable USB, correo, nube...).
2. En el telefono, abre el archivo con el explorador.
3. Android pedira permiso para instalar apps de **origenes desconocidos**:
   acepta y habilita el permiso para la app desde la que abres el APK.
4. Pulsa **Instalar**.

### Opcion B — adb (desde un PC con Android Platform Tools)

1. Habilita **Depuracion USB** en el telefono (Ajustes → Opciones de
   desarrollador).
2. Conecta el telefono por USB y ejecuta:

```bash
adb install app-release.apk
```

## Como recompilar desde el codigo fuente

Requisitos:

- **JDK 17 o superior** (Temurin/Adoptium recomendado).
- **Android SDK** (platform-tools + una plataforma reciente). Puedes instalarlo
  con Android Studio o con las command-line tools.
- **Node.js 20+** y conexion a internet (la primera compilacion descarga
  dependencias de Gradle).

```bash
cd mobile-src
npm install
# 1) Genera la salida estatica de Next.js en out/
#    (Windows: set NEXT_OUTPUT_MODE=export && npx next build)
NEXT_OUTPUT_MODE=export npx next build
# 2) Sincroniza los assets web al proyecto android/
npx cap sync android
# 3) Compila el APK de release con el wrapper de Gradle incluido
cd android
./gradlew assembleRelease        # Windows: gradlew.bat assembleRelease
```

El APK resultante queda en
`mobile-src/android/app/build/outputs/apk/release/`.

> La configuracion del negocio ({{PRODUCT_NAME}}) viene ya horneada en el codigo
> fuente (`mobile-src/.env.local`). Para cambiarla, regenera el paquete desde el
> exportador.
>
> El APK de este ZIP viene firmado con el keystore de release del exportador. Si
> recompilas a mano sin pasar las propiedades `-PrelKeystore` a Gradle, el APK se
> firmara con la clave de depuracion (valido para pruebas, no para publicar).
