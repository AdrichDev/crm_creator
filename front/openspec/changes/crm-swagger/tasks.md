# Tasks — crm-swagger

> Change: `crm-swagger` · Nivel 1

## S1. Dependencias
- [ ] S1.1 `npm install swagger-ui-express` en `back/`
- [ ] S1.2 `npm install -D @types/swagger-ui-express` en `back/`

## S2. Spec OpenAPI
- [ ] S2.1 Crear `back/src/lib/swagger.ts` — objeto `swaggerSpec` (OpenAPI 3.0)
- [ ] S2.2 Definir `info`, `servers`, `components.securitySchemes.BearerAuth`
- [ ] S2.3 Schemas: `Customer`, `Employee`, `Booking`, `Service`, `Product`, `PaginatedResponse<T>`, `ErrorResponse`
- [ ] S2.4 Paths: auth (login, logout)
- [ ] S2.5 Paths: customers (CRUD + search/pagination)
- [ ] S2.6 Paths: employees (CRUD + search/pagination)
- [ ] S2.7 Paths: bookings (CRUD + search/pagination)
- [ ] S2.8 Paths: services y products (CRUD)
- [ ] S2.9 Paths: projects (GET, POST, PATCH, DELETE)

## S3. Montar en app
- [ ] S3.1 En `back/src/app.ts` (o donde se crea el Express app): importar `swaggerUi` + `swaggerSpec`
- [ ] S3.2 Condicional `if (process.env.NODE_ENV !== 'production')`: `app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))`

## Cierre
- [ ] Z1 `cd back && npx tsc --noEmit` — 0 errores
- [ ] Z2 `cd back && npm test` — todos verdes
