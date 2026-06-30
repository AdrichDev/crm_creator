# Spec — crm-image-upload

## AC-I1 — Subir imagen servicio
**Given** el usuario está en la lista de servicios  
**When** hace clic en el icono de cámara de un servicio  
**Then** se abre el selector de archivo del sistema  
**And** solo admite JPEG, PNG, WEBP (atributo `accept`)  

## AC-I2 — Proceso de subida
**Given** el usuario selecciona un archivo válido (≤ 5 MB)  
**When** confirma la selección  
**Then** el archivo se sube al endpoint `POST /upload/service/:id`  
**And** el endpoint almacena la imagen en `crm-media/business_id/services/service_id.ext`  
**And** actualiza `imagenUrl` en el registro del servicio  
**And** devuelve la URL pública  
**And** el front actualiza la thumbnail inmediatamente

## AC-I3 — Validación de tamaño
**Given** el usuario selecciona un archivo > 5 MB  
**Then** el endpoint devuelve 413 con mensaje de error  
**And** el front muestra el error inline (no alert())

## AC-I4 — Thumbnail en lista
**Given** un servicio tiene `imagenUrl`  
**Then** se muestra una thumbnail cuadrada (48×48) antes del nombre  
**Given** no tiene imagen  
**Then** se muestra el icono del servicio (comportamiento actual)

## AC-I5 — Ídem para productos
Mismas ACs I1-I4 aplicadas a `POST /upload/product/:id`

## AC-I6 — Autorización
**Given** el endpoint de upload  
**Then** requiere token válido + rol staff (staffOnly middleware)  
**And** solo permite subir imágenes al negocio del usuario autenticado
