# Design — crm-image-upload

## D1 — Supabase Storage
Bucket: `crm-media` (público).  
Path: `{businessId}/services/{serviceId}.{ext}` y `{businessId}/products/{productId}.{ext}`  
URL pública: `supabaseClient.storage.from('crm-media').getPublicUrl(path).data.publicUrl`

No se usa el SDK de Supabase en el back (ya hay `@supabase/supabase-js` instalado como dep del proyecto — verificar; si no, usar `fetch` a la Storage API REST).

## D2 — Endpoint de upload (back)
```
POST /upload/service/:id      multipart/form-data, campo "image"
POST /upload/product/:id      multipart/form-data, campo "image"
```
Middleware: `authenticate` + `staffOnly` + `multer({ limits: { fileSize: 5*1024*1024 }, fileFilter: jpeg/png/webp }`

Flujo:
1. Multer lee el buffer en memoria (`memoryStorage`)
2. Verificar que el servicio/producto pertenece al negocio del usuario
3. Upload a Supabase Storage (`supabaseAdmin.storage.from('crm-media').upload(path, buffer, { contentType, upsert: true })`)
4. Obtener URL pública
5. `prisma.service.update({ where: { id }, data: { imagenUrl: publicUrl } })`
6. Responder `{ url: publicUrl }`

Librería multer: `npm install multer @types/multer` en `back/`.

## D3 — Schema Prisma
```prisma
// En model Service:
imagenUrl   String?  @map("imagen_url")

// En model Product:
imagenUrl   String?  @map("imagen_url")
```

## D4 — crudRouter (routes/index.ts)
Añadir `'imagenUrl'` a los `fields` de services y products para que el PATCH normal también pueda actualizar la URL (por si se usa otro método).

## D5 — Front: componente ImageUpload inline
No se crea modal. El thumbnail en la tabla tiene un overlay de cámara al hover.  
`<input type="file" accept="image/jpeg,image/png,image/webp" hidden ref={fileRef}>`  
Al seleccionar: `apiFetch('/upload/service/'+id, { method: 'POST', body: formData })`

## D6 — Archivos
| Archivo | Acción |
|---------|--------|
| `back/prisma/schema.prisma` | Añadir `imagenUrl` a Service y Product |
| `back/src/routes/upload.ts` | Nuevo — endpoints de subida |
| `back/src/routes/index.ts` | Montar `/upload` router + añadir imagenUrl a fields |
| `front/app/(crm)/servicios/page.tsx` | Thumbnail + botón de carga |
| `front/app/(crm)/productos/page.tsx` | Ídem |
| `front/lib/api/client.ts` | Verificar que soporta FormData (o añadir helper) |

## D7 — Migración DDL (requiere aprobación)
```sql
ALTER TABLE crm.servicio ADD COLUMN IF NOT EXISTS imagen_url TEXT;
ALTER TABLE crm.producto ADD COLUMN IF NOT EXISTS imagen_url TEXT;
```
⚠️ El agente NO aplica esta migración. Espera aprobación humana.
