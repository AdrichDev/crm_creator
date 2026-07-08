# Generar un CRM completo para un cliente

Hay **dos cosas distintas** y conviene no confundirlas:

| Acción | Qué produce | Dónde |
|---|---|---|
| Botón **Generar** de la consola | La *especificación*: `manifest.json` + `schema.sql` + `schema.prisma` (un `.zip`) | Navegador |
| `node generar.mjs` | El **CRM completo**: back + front (solo módulos activos) con el `.env` ya escrito | Terminal |

Un navegador **no puede escribir en un `.env` de tu disco**, por eso el CRM
completo se genera con el CLI (Node), que sí tiene acceso a tus archivos.

## Asistente paso a paso (lo que quieres)

Desde la raíz de `SaaS_Negocios`:

```bash
node generar.mjs
```

Te irá preguntando, paso a paso, y al terminar **escribe el `.env` directamente**:

1. **Proyecto**: nombre del negocio/cliente y slug de la carpeta.
2. **Módulos**: qué módulos incluir (clientes, citas, servicios, empleados,
   fichaje, vacaciones, productos, ventas, marketing).
3. **Base de datos (PostgreSQL)**: nombre de la BD, host, puerto, usuario,
   contraseña, schema. → con esto construye el `DATABASE_URL`.
4. **Backend y seguridad**: puerto del backend, puerto del front, `JWT_SECRET`
   (se autogenera si lo dejas vacío).
5. **Conexión front↔API**: si el front debe consumir la API (escribe
   `NEXT_PUBLIC_API_URL`).

### Resultado

```
generated/<slug>/
  back/      ← Express + Prisma, solo los módulos elegidos, con .env ESCRITO
  front/     ← Next.js, solo los módulos elegidos, con .env.local ESCRITO
  PROYECTO.json
  COMO_ARRANCAR.md   ← pasos exactos para levantarlo
```

- `back/.env` queda con tu `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`.
- `front/.env.local` queda con `NEXT_PUBLIC_API_URL`.

### Usar la selección hecha en la consola

Si ya configuraste el proyecto en la consola web y pulsaste **Generar**,
descomprime el `.zip` y pásale su `manifest.json`:

```bash
node generar.mjs --from ruta/al/manifest.json
```

Así toma de ahí el vertical y los módulos, y solo te pregunta la base de datos y
los puertos.

## Arrancar el CRM generado

```bash
cd generated/<slug>/back
npm install
npm run prisma:generate
npm run migrate:deploy   # aplica las migraciones
npm run seed        # datos demo (opcional)
npm run dev

# en otra terminal
cd generated/<slug>/front
npm install
npm run dev
```

Todo el paso a paso queda también en `generated/<slug>/COMO_ARRANCAR.md`.

> Requisitos: Node 18+ y un PostgreSQL accesible con los datos que introduzcas.
> Nota: hoy el CLI poda las **páginas del front** y los **endpoints del backend**
> de los módulos desactivados; el esquema Prisma se mantiene completo para no
> romper relaciones entre tablas (las tablas no usadas son inofensivas).
