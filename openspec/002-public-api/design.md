# Diseño Técnico

## Arquitectura
- **Rutas Públicas:** Se montará un publicRouter en /public usando express.Router().
- **Validación:** Se usará zod para validar los cuerpos de las peticiones.
- **Base de datos:** Se utilizará Prisma Client (deps.db) sin filtrado de RLS a nivel de eq.user, pasando explícitamente el usinessId en cada petición.

## Cambios en Archivos
- \src/routes/index.ts\: Montar /public.
- \src/routes/public/index.ts\: Entrypoint para rutas públicas.
- \src/routes/public/leads.ts\: Lógica de creación de leads.
- \src/routes/public/availability.ts\: Reutilización de funciones del calendario para obtener huecos libres.
- \src/routes/public/bookings.ts\: Upsert de cliente y creación de reserva.
- \src/middlewares/rate-limit.ts\: Configuración de rate-limiters.

## Estrategia de Testing
- Tests de integración en src/routes/__tests__/public-api.test.ts con fastify/express inyectando peticiones a /public/*.

