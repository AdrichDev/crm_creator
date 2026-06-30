# Design — Paginación server-side y filtro en listas CRM

## Enfoque técnico

Cambio aditivo sobre el stack Express + Prisma + Next existente. No modifica el
esquema de BD ni añade migraciones. El back extiende los routers existentes con
parámetros opcionales; el front añade tres artefactos nuevos (componente Pagination,
componente SearchInput, hook usePaginatedApi) sin romper el modo generador (useCollection).

---

## Decisiones de arquitectura

### D1 — Helper de parseo compartido en el back

| Decisión | Función `parsePagination(query)` en `back/src/lib/pagination.ts` |
|----------|------------------------------------------------------------------|
| Rechazado | Parseo inline en cada router |
| Rationale | Cuatro routers necesitan la misma lógica de normalización (page ≥ 1, 1 ≤ limit ≤ 100, search trim). Extraerla a un helper permite testearla de forma aislada con valores límite sin levantar servidor. |

```ts
// back/src/lib/pagination.ts
export interface PaginationParams {
  page: number;   // ≥ 1
  limit: number;  // 1–100
  search: string; // trimmed, puede ser ""
}
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const page  = Math.max(1, parseInt(String(query.page  ?? '1'),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '20'), 10) || 20));
  const search = String(query.search ?? '').trim();
  return { page, limit, search };
}
```

### D2 — `searchFields` en `CrudOptions`, OR dinámico con Prisma

| Decisión | Campo `searchFields?: string[]` en `CrudOptions`; OR Prisma con `mode:'insensitive'` |
|----------|---------------------------------------------------------------------------------------|
| Rechazado | SQL raw con `ILIKE` |
| Rationale | Prisma genera ILIKE nativamente con `{ contains: search, mode: 'insensitive' }`. Usar SQL raw rompería el tipado y requeriría sanitización manual. El OR dinámico se construye solo si `searchFields` está definido y `search` no es vacío, sin impacto en queries sin búsqueda. |

```ts
const searchWhere = (search && opts.searchFields?.length)
  ? { OR: opts.searchFields.map(f => ({ [f]: { contains: search, mode: 'insensitive' as const } })) }
  : {};
```

### D3 — Dos queries paralelas: `findMany` + `count`

| Decisión | `Promise.all([findMany(...), count(...)])` con el mismo `where` |
|----------|-----------------------------------------------------------------|
| Rechazado | Calcular total desde el array de resultados |
| Rationale | El total debe reflejar el total filtrado (no solo la página actual). Dos queries paralelas minimiza latencia respecto a serial. El `count` usa exactamente el mismo `where` que el `findMany` (sin `take`/`skip`) para garantizar coherencia. |

### D4 — `usePaginatedApi` hook genérico en el front

Hook único tipado con genérico `<T>` que gestiona `page`, `search`, `loading`, `items`,
`total`. Reset automático de `page` a 1 al cambiar `search`. Llama a `apiFetch` con
`?page=X&limit=Y&search=Z` (omite `search` si vacío). No persiste estado en URL.

```ts
function usePaginatedApi<T>(path: string, limit = 20): PaginatedResult<T>
```

### D5 — Componente `Pagination` visual basado en tokens CRM

Visualmente igual al de AA front (botones Anterior/Siguiente, texto "Página X de Y · N resultados")
pero usando las clases CSS del panel CRM (`btn-outline`, `text-sm`, tokens de `primitives.tsx`).
Se oculta si `totalPages <= 1` (retorna null).

### D6 — `SearchInput` con debounce interno

Debounce de 300 ms implementado con `useEffect` + `setTimeout` interno. El componente
acepta `value` y `onChange` externos (controlled); el debounce solo afecta al momento
en que `onChange` se dispara hacia el padre, no al valor visible en el input.

### D7 — Modo generador (useCollection) sin cambios

Las páginas verifican `isApiEnabled()`. Si es `false`, continúan con `useCollection`
y paginación client-side. Si es `true`, usan `usePaginatedApi`. No hay migración
de datos ni cambio de contrato en el modo generador.

---

## Estructura de archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `back/src/lib/pagination.ts` | Nuevo | `parsePagination()` — helper de parseo y normalización |
| `back/src/lib/crud.ts` | Modificado | Añadir `searchFields` a `CrudOptions`; `GET /` devuelve `{ items, total, page, limit }` |
| `back/src/routes/customers.ts` | Modificado | Paginar `findMany`, ILIKE `nombre`/`apellido`/`email`, `count()` paralelo |
| `back/src/routes/bookings.ts` | Modificado | Paginar, búsqueda nested `customer.nombre`/`service.nombre`, `count()` |
| `back/src/routes/employees.ts` | Modificado | Paginar, ILIKE `nombre`/`apellido`/`email`, `count()` |
| `front/components/ui/pagination.tsx` | Nuevo | Botones Anterior/Siguiente, texto Página X de Y, oculto si totalPages ≤ 1 |
| `front/components/ui/search-input.tsx` | Nuevo | `<input type="search">` con debounce 300 ms |
| `front/lib/data/use-paginated-api.ts` | Nuevo | Hook genérico `usePaginatedApi<T>` |
| `front/app/(crm)/clientes/page.tsx` | Modificado | Integrar hook + SearchInput + Pagination en modo API |
| `front/app/(crm)/empleados/page.tsx` | Modificado | Ídem |
| `front/app/(crm)/citas/page.tsx` | Modificado | Ídem |
| `front/app/(crm)/servicios/page.tsx` | Modificado | Ídem |
| `front/app/(crm)/productos/page.tsx` | Modificado | Ídem |

---

## Contrato de interfaces

```ts
// back — respuesta paginada estándar
interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// back — parámetros query
// ?page=1&limit=20&search=texto

// front — hook
interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  setPage: (p: number) => void;
  refresh: () => void;
}

// front — Pagination
interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

// front — SearchInput
interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}
```

---

## Estrategia de tests

| Capa | Qué | Enfoque |
|------|-----|---------|
| Unit (back) | `parsePagination` — valores límite: negativos, string, > 100, vacío | node:test, sin BD |
| Unit (back) | `crudRouter GET /` con `searchFields` definidos y `search` vacío | mock delegate |
| Unit (front) | `usePaginatedApi` — reset page al cambiar search | Vitest + msw mock |
| Unit (front) | `SearchInput` — debounce 300 ms; onChange no se dispara antes | Vitest + fake timers |
| Unit (front) | `Pagination` — oculto si totalPages ≤ 1; botones disabled en extremos | Vitest + Testing Library |

---

## Preguntas abiertas

- [ ] ¿Las rutas de `crudRouter` (`/servicios`, `/productos`, etc.) necesitan `searchFields`
      definidos o es suficiente con el campo `nombre` por defecto? (Asumido: `nombre` siempre
      presente; otros campos según modelo concreto.)
- [ ] ¿El buscador en `/citas` filtra también por fecha o solo por texto? (Asumido: solo texto
      en esta iteración; filtro por fecha es una feature separada.)
