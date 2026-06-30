# Tasks — Paginación server-side y filtro en listas CRM

> Change: `crm-pagination` · Nivel 2
> Estado: COMPLETADO — todos los bloques B, F, P aplicados.

---

## Bloque B — Back

### B1. Helper de parseo

- [x] B1.1 Crear `back/src/lib/pagination.ts` con `parsePagination(query)`:
       normaliza `page` (≥ 1), `limit` (1–100, default 20), `search` (trim).
- [x] B1.2 Escribir tests unitarios en `back/src/lib/__tests__/pagination.test.ts`:
       valores negativos, strings, > 100, vacío — todos producen defaults correctos.

### B2. `crud.ts` — router genérico

- [x] B2.1 Añadir `searchFields?: string[]` a `CrudOptions`.
- [x] B2.2 En `GET /`, llamar a `parsePagination(req.query)`.
- [x] B2.3 Construir `searchWhere` con OR Prisma `mode:'insensitive'` solo si
       `search` no es vacío y `searchFields` está definido.
- [x] B2.4 Ejecutar `Promise.all([findMany(...), count(...)])` con mismo `where`.
- [x] B2.5 Devolver `res.json({ items, total, page, limit })`.
- [x] B2.6 Actualizar llamadas existentes a `crudRouter(...)` en `routes/index.ts`
       para pasar `searchFields` pertinentes (servicios: `['nombre','categoria']`,
       productos: `['nombre','categoria']`, recursos: `['nombre']`, tags: `['nombre']`).

### B3. `customers.ts`

- [x] B3.1 Llamar a `parsePagination(req.query)`.
- [x] B3.2 Añadir cláusula ILIKE sobre `nombre`, `apellido`, `email`.
- [x] B3.3 Añadir `skip: (page-1)*limit`, `take: limit` al `findMany`.
- [x] B3.4 Ejecutar `prisma.customer.count({ where })` en paralelo.
- [x] B3.5 Los `groupBy` de bookings/sales usan los `ids` de la página actual.
- [x] B3.6 Devolver `{ items, total, page, limit }`.

### B4. `bookings.ts`

- [x] B4.1 Llamar a `parsePagination(req.query)`.
- [x] B4.2 Añadir búsqueda nested:
       `OR: [{ customer: { nombre: contains } }, { customer: { apellido: contains } }, { service: { nombre: contains } }]`.
- [x] B4.3 Añadir `skip`/`take` al `findMany`.
- [x] B4.4 Ejecutar `prisma.booking.count({ where })` en paralelo.
- [x] B4.5 Devolver `{ items, total, page, limit }`.

### B5. `employees.ts`

- [x] B5.1 Llamar a `parsePagination(req.query)`.
- [x] B5.2 Añadir ILIKE sobre `nombre`, `apellido`, `email`.
- [x] B5.3 Añadir `skip`/`take` al `findMany`.
- [x] B5.4 Ejecutar `prisma.employee.count({ where })` en paralelo.
- [x] B5.5 Devolver `{ items, total, page, limit }`.

---

## Bloque F — Front: componentes y hook

### F1. Componente `Pagination`

- [x] F1.1 Crear `front/components/ui/pagination.tsx`.
- [x] F1.2 Props: `{ page, totalPages, total, limit, onChange }`.
- [x] F1.3 Retornar null si `totalPages <= 1`.
- [x] F1.4 Botón "Anterior" deshabilitado si `page === 1`.
- [x] F1.5 Botón "Siguiente" deshabilitado si `page === totalPages`.
- [x] F1.6 Texto "Página X de Y · N resultados" con clases CSS del panel CRM.
- [x] F1.7 Tests: oculto si totalPages ≤ 1, botones disabled en extremos.

### F2. Componente `SearchInput`

- [x] F2.1 Crear `front/components/ui/search-input.tsx`.
- [x] F2.2 Props: `{ value, onChange, placeholder? }`.
- [x] F2.3 Debounce de 300 ms interno con `useEffect` + `clearTimeout`.
- [x] F2.4 `onChange` se llama con el valor debounceado, no en cada keystroke.
- [x] F2.5 Tests: debounce 300 ms con fake timers; onChange count.

### F3. Hook `usePaginatedApi`

- [x] F3.1 Crear `front/lib/data/use-paginated-api.ts`.
- [x] F3.2 Estado interno: `page` (number, default 1), `search` (string, default "").
- [x] F3.3 Llamar a `apiFetch` con `?page=X&limit=Y&search=Z` (omitir search si vacío).
- [x] F3.4 Al cambiar `search`, resetear `page` a 1 antes del fetch.
- [x] F3.5 Calcular `totalPages = Math.ceil(total / limit)`.
- [x] F3.6 Exponer `refresh()` que fuerza re-fetch sin cambiar estado.
- [x] F3.7 Tests: reset page al cambiar search; loading true durante fetch.

---

## Bloque P — Páginas

### P1. `/clientes`

- [x] P1.1 Añadir `usePaginatedApi<ClienteRow>('/customers', 20)` en modo API.
- [x] P1.2 Renderizar `<SearchInput>` encima de la tabla.
- [x] P1.3 Renderizar `<Pagination>` debajo de la tabla.
- [x] P1.4 Verificar que modo generador (`!isApiEnabled()`) no cambia.

### P2. `/empleados`

- [x] P2.1 Ídem con `usePaginatedApi<EmpleadoRow>('/employees', 20)`.
- [x] P2.2 SearchInput + Pagination.

### P3. `/citas`

- [x] P3.1 Ídem con `usePaginatedApi<CitaRow>('/bookings', 20)`.
- [x] P3.2 SearchInput + Pagination.

### P4. `/servicios`

- [x] P4.1 Ídem con `usePaginatedApi<ServicioRow>('/services', 20)`.
- [x] P4.2 SearchInput + Pagination.

### P5. `/productos`

- [x] P5.1 Ídem con `usePaginatedApi<ProductoRow>('/products', 20)`.
- [x] P5.2 SearchInput + Pagination.

---

## Cierre

- [x] Z1 `cd back && npm test` — todos los tests verdes incluyendo nuevos de B1–B5.
- [x] Z2 `cd front && npm test -- --run` — todos los tests verdes incluyendo F1–F3.
- [x] Z3 `cd front && npx tsc --noEmit` — 0 errores (errores pre-existentes en projects.ts no son de este change).
- [ ] Z4 Smoke manual: página `/clientes` en modo API muestra buscador, navegar a
       página 2, buscar un término, verificar que página vuelve a 1.
- [ ] Z5 Smoke manual: modo generador (sin NEXT_PUBLIC_API_URL) — listas sin cambios.
