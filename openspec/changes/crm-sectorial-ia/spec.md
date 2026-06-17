# Especificación — CRM sectorial con IA

Formato: cada caso de uso (UC) tiene criterios de aceptación (AC) en Gherkin (Dado/Cuando/Entonces)
y los tests que lo cubren. **Todos los AC deben tener test en verde.**

---

## UC-1 — Mocks de clientes acordes al sector

Al generar/sembrar un negocio, los clientes de ejemplo incluyen campos extendidos propios del sector.

**AC-1.1** Dado un negocio `veterinario`, Cuando se generan los clientes mock, Entonces cada cliente
tiene `especie`, `raza` y `nombreMascota` no vacíos, y al menos un documento de tipo *Informe veterinario*.
**AC-1.2** Dado un negocio `clinica`, Entonces los clientes tienen `numHistoria` y documentos de tipo
*Informe médico*.
**AC-1.3** Dado un negocio `abogados`, Entonces los clientes tienen `numExpediente` y documentos de tipo
*Escrito/Contrato/Sentencia*.
**AC-1.4** Dado cualquier sector sin extensión definida, Entonces se usan los campos base sin romper.

_Tests:_ `lib/config/__tests__/sector-data.test.ts` → `clientesMock(vertical)`.

## UC-2 — Servicios/Tarifas acordes al sector

**AC-2.1** Dado `abogados`, Entonces el módulo de servicios se titula **"Tarifas"** y sus ítems tienen
`categoria` ∈ {Divorcio, Penal, Violencia de género, Hurto, Civil, Laboral}, `duracion` (min) y `precio` (sesión).
**AC-2.2** Dado `veterinario`, Entonces los servicios son veterinarios (Consulta, Vacunación, Cirugía…)
y NO contienen "corte de pelo".
**AC-2.3** Dado `peluqueria`, Entonces los servicios siguen siendo de peluquería (Corte, Color…).
**AC-2.4** La terminología del módulo `servicios` en `abogados` es `"Tarifas"`.

_Tests:_ `sector-data.test.ts` → `serviciosMock(vertical)`; `verticals.test.ts` (terminología abogados).

## UC-3 — Documentos por sector

**AC-3.1** `documentosMock(vertical)` devuelve tipos de documento propios del sector
(veterinario→informes del animal; clínica/fisio→informes médicos; abogados→escritos/sentencias).
**AC-3.2** Cada documento tiene `nombre`, `tipo`, `tam` (>0) y `fecha` (YYYY-MM-DD).

_Tests:_ `sector-data.test.ts` → `documentosMock(vertical)`.

## UC-4 — `crm_project` + vínculo con cliente real

**AC-4.1** Al provisionar un proyecto con `clienteId`, Entonces existe una fila en `public.crm_project`
con `id_crm`, `id_cliente`, `vertical`, `schema_name`.
**AC-4.2** El nombre de schema es determinista y depende del sector: `tenant_<vertical>_<id>`.
**AC-4.3** El SQL generado para `abogados` crea la tabla `servicios` (tarifas) y NO obliga `productos`
si el módulo no está activo.

_Tests:_ `lib/generate/__tests__/tenant-schema.test.ts` (SQL builder, idempotencia, nombres).
_E2E:_ creación de proyecto → fila en `crm_project` (cuando hay BD).

## UC-5 — Selector de cliente en la configuración

**AC-5.1** El paso "Tipo de negocio/Datos" muestra un select de clientes **ordenado alfabéticamente**.
**AC-5.2** Muestra **máx. 20** y, con más, aparece **scroll**.
**AC-5.3** Se puede **filtrar por nombre** (case-insensitive, por substring).
**AC-5.4** Al elegir cliente, el paso **Datos** se rellena con los datos del cliente (nombre, CIF,
email, teléfono, dirección) obtenidos del endpoint.

_Tests:_ `lib/clients/__tests__/client-picker.test.ts` (orden/paginación/filtro puro);
_E2E:_ `e2e/onboarding-cliente.spec.ts`.

## UC-6 — Generar Plan de Marketing con IA (modelo + effort, tokens compartidos)

**AC-6.1** El usuario elige **modelo** y **effort** (la misma lista que `agents-agency`).
**AC-6.2** Al generar, la petición va al backend de `agents-agency` con `clientId`.
**AC-6.3** Tras la respuesta, `tokensUsed` del cliente se incrementa y se crea una fila en `tokenUsage`
(mismo ledger global). Si el cliente está sin cupo, devuelve 402 y el CRM lo muestra.

_Tests:_ `lib/ai/__tests__/usage-client.test.ts` (fetch mockeado: payload, manejo 402, parseo de uso).

## UC-7 — Estudio de Mercado (Estadísticas) con IA

**AC-7.1** El módulo `estadisticas` es seleccionable y replica el panel de `agents-agency`.
**AC-7.2** Generar un estudio usa el mismo flujo IA/tokens de UC-6.

_Tests:_ `usage-client.test.ts` (endpoint estudios); _E2E:_ `e2e/estadisticas.spec.ts`.

## UC-8 — Tema claro/oscuro del CRM siguiendo el SO

**AC-8.1** Sin preferencia guardada, el CRM usa el tema del sistema (`prefers-color-scheme`).
**AC-8.2** Existe un toggle (claro/oscuro/sistema) que persiste la elección.
**AC-8.3** En claro, el panel es legible (contraste AA en texto principal); en oscuro mantiene el premium.

_Tests:_ `lib/theme/__tests__/crm-theme.test.ts` (resolución de modo: sistema vs override);
_E2E:_ `e2e/tema.spec.ts` (toggle aplica `data-theme`).

## UC-9 — Arreglo del modo claro de agents-agency

**AC-9.1** Al cambiar a claro en `agents-agency`, los textos y superficies usan tokens claros (sin texto
claro sobre fondo claro).
**AC-9.2** El toggle persiste y se aplica en recarga.

_Tests:_ `agents-agency` `theme.test.ts` (resolución de tokens por modo); _E2E_ si aplica.

---

## Matriz UC → test (resumen)

| UC | Unit (Vitest) | E2E (Playwright) |
|----|---------------|------------------|
| 1,2,3 | sector-data.test.ts | — |
| 4 | tenant-schema.test.ts | provision (con BD) |
| 5 | client-picker.test.ts | onboarding-cliente.spec.ts |
| 6,7 | usage-client.test.ts | estadisticas.spec.ts |
| 8 | crm-theme.test.ts | tema.spec.ts |
| 9 | theme.test.ts (aa) | — |
