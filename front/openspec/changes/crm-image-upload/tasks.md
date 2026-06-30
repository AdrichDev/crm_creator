# Tasks — crm-image-upload

> Change: `crm-image-upload` · Nivel 3
> ⚠️ Tarea M1 (migración DDL) BLOQUEADA hasta aprobación humana.

## B1. Schema Prisma (sin migración todavía)
- [x] B1.1 Añadir `imagenUrl String? @map("imagen_url")` a model `Service`
- [x] B1.2 Añadir `imagenUrl String? @map("imagen_url")` a model `Product`
- [x] B1.3 Ejecutar `prisma generate` para regenerar el cliente (`--no-engine` no existe en Prisma 7; generate normal no dio EPERM)

## B2. Endpoint upload
- [x] B2.1 `npm install multer @types/multer` en `back/`
- [x] B2.2 Crear `back/src/routes/upload.ts` con `uploadRouter`
- [x] B2.3 `POST /service/:id`: multer memoryStorage, validar tipo+tamaño, verificar ownership, upload a Storage, update prisma, devolver url
- [x] B2.4 `POST /product/:id`: ídem para productos
- [x] B2.5 Montar `api.use('/upload', uploadRouter)` en `routes/index.ts` (authenticate+staffOnly ya aplicados globalmente arriba)

## B3. crudRouter fields
- [x] B3.1 Añadir `'imagenUrl'` a services fields en `routes/index.ts`
- [x] B3.2 Añadir `'imagenUrl'` a products fields en `routes/index.ts`

## F1. Front servicios
- [x] F1.1 En `servicios/page.tsx`: mostrar thumbnail 48×48 si `imagenUrl` existe, sino icono actual
- [x] F1.2 Overlay de cámara al hover → `<input type="file" hidden>` + click programático
- [x] F1.3 Al seleccionar: `POST /upload/service/:id` con FormData, actualizar lista local con nueva URL
- [x] F1.4 Error inline si > 5 MB o tipo inválido

## F2. Front productos
- [x] F2.1-F2.4 Ídem que F1.1-F1.4 para `productos/page.tsx` (componente compartido `components/ui/image-cell.tsx`)

## M1. Migración DDL — BLOQUEADA (espera aprobación)
- [x] M1.1 Aplicar via MCP Supabase: `ALTER TABLE crm.servicio ADD COLUMN IF NOT EXISTS imagen_url TEXT;`
- [x] M1.2 Aplicar via MCP Supabase: `ALTER TABLE crm.producto ADD COLUMN IF NOT EXISTS imagen_url TEXT;`
- [x] M1.3 Crear bucket `crm-media` en Supabase Storage si no existe

## Cierre (tras M1)
- [x] Z1 `cd back && npm test` — todos verdes (109/0)
- [ ] Z2 `cd front && npx tsc --noEmit` — 0 errores
- [ ] Z3 `cd front && npm test -- --run` — todos verdes
