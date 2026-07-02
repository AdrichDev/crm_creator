# Validación — crm-sidebar-comercial-naming

Historia: como **comercial de campo** quiero que el menú hable mi idioma (mapa, cartera, agenda)
y que lo esencial esté arriba, para encontrar cada cosa sin adivinar qué significa "pipeline" o
"partidas".

## Criterios de aceptación (AC)
- **AC1:** en el vertical `comerciales`, el sidebar muestra los grupos en orden
  Esencial → Operativa → Personas → Retail / Caja → Marketing y Web (los vacíos no aparecen).
- **AC2:** `comercial` aparece bajo "Esencial" en el vertical `comerciales`; en cualquier otro
  vertical sigue bajo "Operativa".
- **AC3:** labels del vertical `comerciales`: "Mapa comercial", "Cartera de clientes", "Agenda",
  "Pedidos", "Informes"; el resto conserva su default.
- **AC4:** un tenant ya generado con terminología personalizada NO ve pisados sus overrides al
  deserializar (default < guardado).
- **AC5 (no regresión):** verticales distintos de `comerciales` renderizan idéntico a hoy; front
  tests + tsc limpios.

## Por tarea (Given-When-Then + test)
- **WU1.1** Override tipo → Given `VerticalDef` con `moduleCategories`, When tsc, Then compila y
  el campo es opcional. Test: tsc + unit de tipos.
- **WU1.2** Categoría efectiva → Given vertical `comerciales`, When se resuelve la categoría de
  `comercial`, Then devuelve `core`; Given vertical `barberia`, Then devuelve `operativa`.
  Test: unit `module-category.test.ts`.
- **WU2.1** Terminología → Given config nueva del vertical `comerciales`, When deserialize, Then
  `terminology.comercial === 'Mapa comercial'` (y resto de labels nuevos). Test: unit
  `tenant-config` extendido.
- **WU2.2** No pisar overrides → Given config guardada con `terminology.clientes = 'Mis tiendas'`,
  When deserialize, Then se conserva 'Mis tiendas'. Test: unit.
- **WU3.1** Sidebar orden/grupos → Given módulos activos del vertical `comerciales`, When se
  agrupa, Then orden AC1 y `comercial` en Esencial. Test: unit sobre la lógica de agrupado
  (extraída a helper puro para testear sin render).
- **WU3.2** defaultModules → Given alta de proyecto vertical `comerciales`, When config inicial,
  Then retail/marketing en false y esenciales en true. Test: unit.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.
