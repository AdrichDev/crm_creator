# Validación — crm-deuda-buenas-practicas

Historia: como equipo quiero que las abstracciones existentes (crudRouter, validación, modales,
hooks de datos) se adopten de forma consistente para que el CRM escale sin duplicación.

## Criterios de aceptación
- AC1: un solo shape de error 422 en toda la API (con details), producido por un middleware común.
- AC2: cero validación con casts manuales donde exista patrón Zod.
- AC3: helpers puros fuera de los routers y con test unit propio.
- AC4: convención de naming escrita en ARQUITECTURA.md.
- AC5: suites back+front verdes tras cada lote.

## Por tarea (Given-When-Then + test)
- A.1/A.2 → Given body inválido en cualquier ruta migrada, When POST/PATCH, Then 422 con el
  shape unificado; test back por router migrado.
- A.3 → Given payload sin nombre, When POST /categories/*, Then 422 Zod (no cast). Test.
- B.1 → Given helpers extraídos, When suite unit, Then tests puros de segmentoDe/buildData verdes
  y customers e2e intactos.
- B.2 → Given panel partido, When suite front, Then tests de users-panel siguen verdes.
- C.2 → Given fallo del proveedor, When forgot-password, Then respuesta 200 igual + error logueado.

## Verificado
Sin verificación registrada — change sin iniciar (2026-07-02).
