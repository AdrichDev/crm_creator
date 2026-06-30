# Propuesta — Paginación server-side y filtro en listas CRM

> Estado: **pendiente** · Nivel estimado: **2** · Fecha: 2026-06-30

## Intención

El back devuelve todos los registros en cada `findMany` sin `take`/`skip`. A partir
de ~500 filas por negocio los listados se vuelven lentos y el payload de red crece
sin control. Ninguna lista tiene campo de búsqueda de texto, lo que obliga al usuario
a hacer scroll para encontrar registros.

**Éxito**: todas las rutas de lista devuelven `{ items, total, page, limit }` con
paginación server-side; el front muestra un componente de paginación y un buscador
en cada página de lista.

## Alcance

### Back — rutas afectadas

| Archivo | Línea | Cambio |
|---|---|---|
| `back/src/lib/crud.ts` | 41 | Paginación genérica + `searchFields` ILIKE |
| `back/src/routes/customers.ts` | 35 | Paginar `findMany` + buscar por nombre/email |
| `back/src/routes/bookings.ts` | 21 | Paginar + búsqueda nested cliente/servicio |
| `back/src/routes/employees.ts` | 23 | Paginar + buscar por nombre/email |

### Front — archivos nuevos

| Archivo | Tipo |
|---|---|
| `front/components/ui/pagination.tsx` | Componente reutilizable |
| `front/components/ui/search-input.tsx` | Componente reutilizable |
| `front/lib/data/use-paginated-api.ts` | Hook reutilizable |

### Front — páginas actualizadas

- `front/app/(crm)/clientes/page.tsx`
- `front/app/(crm)/empleados/page.tsx`
- `front/app/(crm)/citas/page.tsx`
- `front/app/(crm)/servicios/page.tsx`
- `front/app/(crm)/productos/page.tsx`

## Restricciones

- El modo generador (sin API, `useCollection`) **no se toca**: sigue funcionando igual.
- `limit` máximo aceptado: 100. Default: 20.
- Sin rotura de tests existentes.
- TypeScript sin errores tras los cambios.
