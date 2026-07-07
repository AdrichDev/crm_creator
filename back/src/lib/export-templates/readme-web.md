# {{PRODUCT_NAME}} — Aplicacion web (Next.js standalone)

Este paquete contiene la aplicacion **{{PRODUCT_NAME}}** lista para desplegar en
cualquier servidor con Node.js, mas el codigo fuente y el esquema de base de datos.

## Contenido del ZIP

- `standalone/` — Aplicacion autocontenida lista para ejecutar (`node server.js`).
- `app/` — Codigo fuente completo del proyecto (para recompilar o modificar).
- `schema.sql` — Esquema SQL para crear la base de datos.
- `schema.prisma` — Modelos Prisma equivalentes.
- `manifest.json` — Metadatos de la exportacion.

## Requisitos

- **Node.js 20 o superior** (LTS recomendado). Comprueba con `node --version`.
- Una base de datos PostgreSQL accesible (ver `schema.sql`).

## Arranque rapido (produccion)

1. Descomprime el ZIP en el servidor.
2. Entra en la carpeta `standalone/`.
3. Arranca el servidor:

   ```bash
   node server.js
   ```

4. La app queda escuchando en el puerto **3000** por defecto. Para cambiarlo,
   define la variable de entorno `PORT` antes de arrancar:

   ```bash
   # Linux / macOS
   PORT=8080 node server.js

   # Windows (PowerShell)
   $env:PORT=8080; node server.js
   ```

> La carpeta `standalone/` ya incluye solo las dependencias de produccion
> necesarias. No hace falta ejecutar `npm install` para arrancarla.

## Recompilar desde el codigo fuente (opcional)

Si prefieres compilar desde `app/`:

```bash
cd app
npm ci
npm run build
npm start
```

Para instalar unicamente dependencias de produccion: `npm ci --omit=dev`.

## Base de datos

Crea la base de datos ejecutando `schema.sql` en tu PostgreSQL:

```bash
psql "postgresql://usuario:password@host:5432/basededatos" -f schema.sql
```

Configura la cadena de conexion de la app mediante las variables de entorno
correspondientes (por ejemplo `DATABASE_URL`) antes de arrancar.

## Poner un dominio (reverse proxy)

La app escucha en un puerto local (p. ej. 3000). Para servirla en tu dominio con
HTTPS, coloca un reverse proxy delante.

### nginx

```nginx
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Apache (mod_proxy)

```apache
<VirtualHost *:80>
    ServerName tudominio.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

### IIS (Windows, con URL Rewrite + ARR)

Crea una regla de reverse proxy que reenvie las peticiones entrantes a
`http://localhost:3000/`. Habilita antes *Application Request Routing* y activa
el proxy en su configuracion.

Para HTTPS, gestiona el certificado en el reverse proxy (por ejemplo con
Let's Encrypt / certbot en nginx o Apache).
