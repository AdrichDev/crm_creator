# {{PRODUCT_NAME}} — Aplicacion de escritorio (Windows)

Este paquete contiene la aplicacion de escritorio de **{{PRODUCT_NAME}}**,
empaquetada con Electron a partir de la version web estatica del panel.

## Contenido del ZIP

- `{{PRODUCT_NAME}}-portable.exe` — Version **portable**. No requiere instalacion:
  haz doble clic y la aplicacion arranca. Ideal para probarla o llevarla en un
  USB. No crea accesos directos ni entradas en el menu de inicio.
- `{{PRODUCT_NAME}}-setup.exe` — **Instalador** (NSIS). Instala la aplicacion en
  el equipo, crea acceso directo en el escritorio y en el menu de inicio, y
  permite desinstalarla desde "Aplicaciones y caracteristicas" de Windows.
- `desktop-src/` — Codigo fuente completo (Next.js + Electron) usado para
  generar los ejecutables. Permite recompilar desde cero.
- `README.md` — Este documento.

## Como instalar

### Opcion A — Portable (sin instalar)

1. Descomprime el ZIP en cualquier carpeta.
2. Haz doble clic en `{{PRODUCT_NAME}}-portable.exe`.

> Windows SmartScreen puede advertir por tratarse de un ejecutable sin firma
> comercial. Pulsa **Mas informacion → Ejecutar de todas formas**.

### Opcion B — Instalador

1. Haz doble clic en `{{PRODUCT_NAME}}-setup.exe`.
2. Sigue el asistente. Al terminar tendras el acceso directo creado.

## Como recompilar desde el codigo fuente

Requisitos: **Node.js 20+** y conexion a internet (la primera compilacion
descarga los binarios de Electron).

```bash
cd desktop-src
npm install
# 1) Genera la salida estatica de Next.js en out/
set NEXT_OUTPUT_MODE=export && npx next build
# 2) Empaqueta los ejecutables en dist-electron/
npx electron-builder --win portable nsis
```

Los ejecutables resultantes quedan en `desktop-src/dist-electron/`.

> La configuracion del negocio ({{PRODUCT_NAME}}) viene ya horneada en el codigo
> fuente (`desktop-src/.env.local`). Para cambiarla, regenera el paquete desde
> el exportador.
