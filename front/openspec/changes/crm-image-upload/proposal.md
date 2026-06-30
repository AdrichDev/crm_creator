# Proposal — crm-image-upload

**Change:** `crm-image-upload` · Nivel 3 · Back + Front + Supabase Storage

## Intent
Permitir cargar una foto para cada servicio y producto del CRM.  
La imagen se sube a Supabase Storage (bucket `crm-media`) y su URL pública  
se almacena en los modelos `Service` y `Product` de la BD.

## Scope
| Área | Acción |
|------|--------|
| `back/prisma/schema.prisma` | Añadir `imagenUrl String? @map("imagen_url")` a Service y Product |
| Supabase — migración DDL | `ALTER TABLE crm.servicio ADD COLUMN imagen_url TEXT; ALTER TABLE crm.producto ADD COLUMN imagen_url TEXT;` |
| Supabase — Storage | Crear bucket `crm-media` (público) si no existe |
| `back/src/routes/index.ts` | Añadir `imagenUrl` al campo-list de services y products en crudRouter |
| `back/src/routes/upload.ts` | Nuevo — `POST /upload/service/:id` y `POST /upload/product/:id` (multipart → Storage → PATCH record) |
| `front/app/(crm)/servicios/page.tsx` | Añadir thumbnail + botón de carga de imagen |
| `front/app/(crm)/productos/page.tsx` | Ídem |

## Constraints
- La migración DDL necesita aprobación humana antes de aplicarse.
- Imágenes: max 5 MB, tipos JPEG/PNG/WEBP.
- La URL pública de Storage se guarda; no se guardan blobs en BD.
- Si el negocio borra el servicio/producto: la imagen en Storage queda (cleanup futuro).
- Back tests deben pasar tras el cambio.
