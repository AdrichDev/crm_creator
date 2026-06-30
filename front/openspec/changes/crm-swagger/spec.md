# Spec — crm-swagger

## AC-S1 — Swagger UI accesible
**Given** el back está corriendo en dev  
**When** el cliente visita `GET /api/docs`  
**Then** se sirve la Swagger UI con la especificación del CRM

## AC-S2 — Spec JSON disponible
**Given** la Swagger UI está montada  
**When** un cliente hace `GET /api/docs/swagger.json` (o `/api/docs-json`)  
**Then** obtiene el OpenAPI 3.0 JSON completo

## AC-S3 — Endpoints documentados
**Then** la spec cubre al menos:
- `POST /auth/login`, `POST /auth/logout`
- `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id`
- `GET/POST /employees`, `GET/PATCH/DELETE /employees/:id`
- `GET/POST /bookings`, `GET/PATCH/DELETE /bookings/:id`
- `GET/POST /services`, `GET/PATCH/DELETE /services/:id`
- `GET/POST /products`, `GET/PATCH/DELETE /products/:id`
- `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`

## AC-S4 — Componentes/Schemas
**Then** la spec define schemas reutilizables: `Customer`, `Employee`, `Booking`, `Service`, `Product`, `PaginatedResponse`, `ErrorResponse`

## AC-S5 — Seguridad
**Then** la spec define `BearerAuth` como security scheme  
**And** todos los endpoints protegidos tienen `security: [{ BearerAuth: [] }]`

## AC-S6 — Prod bloqueado
**Given** `NODE_ENV=production`  
**Then** `GET /api/docs` devuelve 404 (middleware condicional)
