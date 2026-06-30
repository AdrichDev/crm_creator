# Spec — Paginación server-side y filtro en listas CRM

## Criterios de aceptación

---

### Bloque B — Back: respuesta paginada

#### B-S1 — Parámetros estándar

- DADO `GET /api/customers?page=2&limit=10`,
  CUANDO el back procesa la petición,
  ENTONCES devuelve `{ items: [...10 registros...], total: N, page: 2, limit: 10 }`
  donde `total` es el total de filas del negocio que cumplen el filtro (no el de `items`).

- DADO `GET /api/customers` sin parámetros,
  CUANDO el back procesa la petición,
  ENTONCES devuelve `page: 1` y `limit: 20` por defecto.

- DADO `GET /api/customers?limit=150`,
  CUANDO el back procesa la petición,
  ENTONCES el `limit` efectivo aplicado es 100 (tope máximo) y la respuesta incluye
  `limit: 100`; no devuelve error.

- DADO `GET /api/customers?page=-1&limit=abc`,
  CUANDO el back parsea los parámetros,
  ENTONCES `page` se normaliza a 1 y `limit` se normaliza a 20 (defaults defensivos);
  no devuelve error 400.

#### B-S2 — Filtro de texto

- DADO `GET /api/customers?search=ana`,
  CUANDO el back aplica el filtro,
  ENTONCES solo devuelve clientes cuyo `nombre`, `apellido` o `email` contiene "ana"
  (insensible a mayúsculas/minúsculas); el `total` refleja el conteo filtrado, no el total global.

- DADO `GET /api/bookings?search=corte`,
  CUANDO el back aplica el filtro,
  ENTONCES devuelve citas donde el nombre del cliente o el nombre del servicio
  contiene "corte" (búsqueda nested via relación Prisma).

- DADO `GET /api/employees?search=`,
  CUANDO el back procesa search vacío,
  ENTONCES devuelve todos los empleados sin filtro adicional.

#### B-S3 — Mismo contrato en todas las rutas

- Las rutas `GET /api/customers`, `GET /api/bookings`, `GET /api/employees` y
  todas las gestionadas por `crudRouter` (servicios, productos, recursos, tags)
  devuelven el shape `{ items: T[], total: number, page: number, limit: number }`.

---

### Bloque F — Front: componentes y páginas

#### F-S1 — Componente `Pagination`

- DADO `totalPages <= 1`,
  CUANDO se renderiza `<Pagination>`,
  ENTONCES el componente NO se renderiza (retorna null).

- DADO `page = 2` y `totalPages = 5`,
  CUANDO se renderiza `<Pagination>`,
  ENTONCES muestra texto indicativo "Página 2 de 5" (o equivalente) y dos botones:
  "Anterior" habilitado y "Siguiente" habilitado.

- DADO `page = 1`,
  CUANDO se renderiza `<Pagination>`,
  ENTONCES el botón "Anterior" está deshabilitado.

- DADO `page = totalPages`,
  CUANDO se renderiza `<Pagination>`,
  ENTONCES el botón "Siguiente" está deshabilitado.

#### F-S2 — Componente `SearchInput`

- DADO que el usuario escribe "mar" carácter a carácter en el `SearchInput`,
  CUANDO han pasado menos de 300 ms desde el último carácter,
  ENTONCES `onChange` no se ha disparado todavía (debounce activo).

- DADO que el usuario deja de escribir y pasan 300 ms,
  CUANDO el debounce resuelve,
  ENTONCES `onChange("mar")` se llama exactamente una vez.

#### F-S3 — Hook `usePaginatedApi`

- DADO que el hook está en `page = 3` y el usuario cambia `search`,
  CUANDO `setSearch` se llama,
  ENTONCES `page` se resetea automáticamente a 1 antes del siguiente fetch.

- DADO un fetch en curso,
  CUANDO `loading` es `true`,
  ENTONCES la UI puede mostrar un indicador de carga.

#### F-S4 — Integración en páginas (modo API activo)

- DADO que `isApiEnabled()` es `true` y el usuario visita `/clientes`,
  CUANDO la página carga,
  ENTONCES se muestra un `SearchInput` y una `Pagination` debajo de la tabla de clientes.

- DADO que el usuario escribe en el buscador y cambia de página,
  CUANDO navega a otra ruta y vuelve,
  ENTONCES la página vuelve a `page: 1` y `search: ""` (sin persistencia en URL ni localStorage).

#### F-S5 — Modo generador (sin API) intacto

- DADO que `isApiEnabled()` es `false`,
  CUANDO se carga cualquier página de lista,
  ENTONCES el comportamiento es idéntico al actual (usa `useCollection`); no aparece
  paginación server-side ni `usePaginatedApi`.
