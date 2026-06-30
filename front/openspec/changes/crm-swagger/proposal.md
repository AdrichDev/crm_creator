# Proposal — crm-swagger

**Change:** `crm-swagger` · Nivel 1 · Back-only

## Intent
Añadir documentación interactiva OpenAPI 3.0 (Swagger UI) al back de CRM.  
Accesible en `GET /api/docs` (sin autenticación, solo en dev/staging).

## Scope
| Área | Acción |
|------|--------|
| `back/src/lib/swagger.ts` | Nuevo — definición OpenAPI 3.0 (info, servers, components/schemas, paths) |
| `back/src/app.ts` (o `index.ts`) | Montar `swagger-ui-express` en `/api/docs` |
| `back/package.json` | Añadir `swagger-ui-express`, `@types/swagger-ui-express` |

## Constraints
- No se usan decoradores JSDoc en rutas (la spec se escribe inline en `swagger.ts` — más mantenible).
- La spec cubre los endpoints más usados: auth, clientes, empleados, citas, servicios, productos, proyectos, usuarios.
- `swagger-ui-express` solo se monta si `NODE_ENV !== 'production'` para no exponer en prod.
- Sin cambios en la lógica de negocio.
