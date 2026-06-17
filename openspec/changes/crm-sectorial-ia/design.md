# Diseño técnico — crm-sectorial-ia

## Arquitectura de integración

```
creador_CRM/front (Next, :3002)
   │  UI + lógica de configuración por vertical
   │
   ├── /api/projects/provision  ── pg ──▶  crm_production (db-crm, pgvector :5434)
   │        crea schema tenant_<vertical>_<id> + tablas de módulos
   │        registra fila en public.crm_project (id_crm, id_cliente, …)
   │
   └── lib/ai/usage-client  ── HTTP ──▶  agents-agency backend (:4000, NEXT_PUBLIC_API_URL)
            POST /api/ai/marketing-plan | /api/ai/market-study  { clientId, model, effort, ... }
            agents-agency: checkClientBalance → genera → deductTokens + tokenUsage
            (mismo ledger de tokens por cliente que el resto de agents-agency)
```

Clientes reales y su cupo de tokens son **propiedad de agents-agency** (Prisma/Postgres :5433).
El CRM nunca duplica el ledger: delega la generación IA en agents-agency para que el metering sea único.

## Modelo de datos

### BD del CRM (`crm_production`)
- `public.crm_project (id_crm text pk, id_cliente text, nombre text, vertical text, schema_name text,
  created_at timestamptz)` — vínculo proyecto↔cliente de agents-agency.
- `tenant_<vertical>_<id>.*` — tablas de negocio por proyecto (clientes, servicios, citas, facturas,
  documentos, …) según módulos activos.

### Campos extendidos de cliente por sector (`sector-data.ts`)
- veterinario: `especie, raza, nombreMascota`
- clinica / fisioterapia: `numHistoria, alergias`
- abogados: `numExpediente`
- (base) `cif, direccion, contacto`

### Servicios/Tarifas por sector
- abogados: term `servicios`→**"Tarifas"**, `categoria` ∈ {Divorcio, Penal, Violencia de género,
  Hurto, Civil, Laboral}, `duracion` (min sesión), `precio` (sesión).
- veterinario, clínica, taller, peluquería, estética, gym: catálogos propios.

### Documentos por sector
- veterinario: Informe veterinario, Cartilla, Analítica.
- clínica/fisio: Informe médico, Consentimiento, Prueba diagnóstica.
- abogados: Escrito, Contrato, Sentencia, Poder.
- genérico: Factura, Presupuesto, Documento.

## IA: modelo + effort + tokens
- Reutiliza el **selector de modelo/effort de agents-agency** (misma lista).
- `usage-client.ts` hace `apiFetch` a agents-agency; la respuesta incluye `{ content, usage: { tokens, model } }`.
- agents-agency aplica `deductTokens(clientId, …)` → `tokensUsed += tokens` y fila en `tokenUsage`.
- 402 → "Límite de uso excedido"; el CRM lo muestra sin romper.

## Tema claro/oscuro
- CRM: `lib/theme/crm-theme.ts` con modos `'system' | 'light' | 'dark'`.
  - `resolveMode(stored, systemPrefersDark)` → 'light'|'dark'. `'system'` sigue `prefers-color-scheme`.
  - Aplica `documentElement.dataset.theme`. `globals.css` define variables para `[data-theme="light"]`
    (superficies claras, texto oscuro) y `[data-theme="dark"]` (premium actual). Listener de
    `matchMedia('(prefers-color-scheme: dark)')` cuando el modo es 'system'.
- agents-agency: revisar `theme.ts`/CSS para que `[data-theme="light"]` defina tokens claros completos
  (el bug actual: faltan overrides claros y queda texto claro sobre fondo claro).

## Estrategia de test
- **Vitest** (jsdom) para lógica pura: sector-data, tenant-schema (string SQL), client-picker (orden/
  paginación/filtro), usage-client (fetch mock), crm-theme (resolución de modo).
- **Playwright** para e2e: onboarding con selector de cliente, estadísticas, toggle de tema.
- Sin red real en unit: `globalThis.fetch` mockeado.
