# Diseño técnico — crm-comercial-campo

## 1. Modelo de datos (Prisma, aditivo)

Convención del repo: nombre de modelo en inglés, columnas físicas castellano snake_case vía
`@map`, multi-tenant `businessId @map("negocio_id")`, soft-delete `eliminadoEn @map("eliminado_en")`
salvo entidades inmutables.

### 1.1 Enums nuevos
```prisma
enum GeoStatus   { PENDING OK FAILED }      // geo_estado del cliente
enum AbcCategory { A B C }                   // categoria_abc
enum RegistroType { CLIENTE PROSPECTO }      // tipo_registro
enum NoteOrigin  { MANUAL AUDIO IMPORT }     // origen de la nota
enum ReminderStatus { PENDING DONE CANCELLED }
```

### 1.2 Customer — campos añadidos (todos nullable/defaulted)
```prisma
latitud        Float?      @map("latitud")
longitud       Float?      @map("longitud")
geoEstado      GeoStatus   @default(PENDING) @map("geo_estado")
categoriaAbc   AbcCategory? @map("categoria_abc")
estadoVisitaId String?     @map("estado_visita_id")
estadoVisita   VisitState? @relation(fields: [estadoVisitaId], references: [id])
tipoRegistro   RegistroType @default(CLIENTE) @map("tipo_registro")
ultimaVisitaEn DateTime?   @map("ultima_visita_en")
proximaAccionEn DateTime?  @map("proxima_accion_en")
localidad      String?     @map("localidad")
provincia      String?     @map("provincia")
codigoPostal   String?     @map("codigo_postal")
historialNotas CustomerNote[]
visitas        Visit[]
recordatorios  Reminder[]
@@index([businessId, estadoVisitaId])
@@index([businessId, tipoRegistro])
```
> Se añaden `localidad/provincia/codigoPostal` del modelo de datos §9.1 del doc (hoy solo hay
> `direccion`). `estado` (CustomerStatus) se mantiene = activo/inactivo (RF-02); NO se reutiliza
> para estado de visita (separación explícita).

### 1.3 VisitState (`estado_visita`) — configurable por negocio (RF-19)
```prisma
model VisitState {
  id          String   @id @default(cuid())
  businessId  String   @map("negocio_id")
  business    Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  nombre      String   @map("nombre")
  color       String   @default("#9ca3af") @map("color")
  icono       String   @default("MapPin") @map("icono")   // lucide-react
  orden       Int      @default(0) @map("orden")
  esPendiente Boolean  @default(true) @map("es_pendiente") // cuenta como pendiente vs cerrado
  esSistema   Boolean  @default(false) @map("es_sistema")  // seed base, no borrable
  customers   Customer[]
  eliminadoEn DateTime? @map("eliminado_en")
  createdAt   DateTime @default(now()) @map("creado_en")
  @@index([businessId])
  @@map("estado_visita")
}
```
Seed por negocio (orden, esPendiente): Pendiente de visitar (`#ef4444`, true), Visitado
(`#22c55e`, false), Seguimiento pendiente (`#f59e0b`, true), Revisitar (`#3b82f6`, true),
Inactivo (`#9ca3af`, false). Todos `esSistema=true`.

### 1.4 Visit (`visita`) — RF-12
```prisma
model Visit {
  id           String   @id @default(cuid())
  businessId   String   @map("negocio_id")
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  customerId   String   @map("cliente_id")
  customer     Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  employeeId   String?  @map("empleado_id")
  fecha        DateTime @default(now()) @map("fecha")
  resultado    String?  @map("resultado")
  nota         String?  @map("nota")
  proximaAccion String? @map("proxima_accion")
  estadoPosteriorId String? @map("estado_posterior_id")   // VisitState resultante
  eliminadoEn  DateTime? @map("eliminado_en")
  createdAt    DateTime @default(now()) @map("creado_en")
  @@index([businessId, customerId])
  @@map("visita")
}
```
Registrar visita actualiza `Customer.ultimaVisitaEn = fecha` y, si `estadoPosteriorId`, el
`estadoVisitaId` del cliente (transacción).

### 1.5 CustomerNote (`nota_cliente`) — RF-11, INMUTABLE (regla 6)
```prisma
model CustomerNote {
  id         String   @id @default(cuid())
  businessId String   @map("negocio_id")
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  customerId String   @map("cliente_id")
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  autorId    String?  @db.Uuid @map("autor_id")   // auth.users
  texto      String   @map("texto")
  origen     NoteOrigin @default(MANUAL) @map("origen")
  createdAt  DateTime @default(now()) @map("creado_en")
  @@index([businessId, customerId])
  @@map("nota_cliente")
}
```
Sin `updatedAt` ni `eliminadoEn`: no se edita ni se borra (histórico). El back expone solo
POST (crear) y GET (listar cronológico desc). No hay PATCH/DELETE.

### 1.6 Reminder (`recordatorio`) — RF-16
```prisma
model Reminder {
  id           String   @id @default(cuid())
  businessId   String   @map("negocio_id")
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  customerId   String   @map("cliente_id")
  customer     Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  titulo       String   @map("titulo")
  descripcion  String?  @map("descripcion")
  fechaPrevista DateTime? @map("fecha_prevista")
  estado       ReminderStatus @default(PENDING) @map("estado")
  responsableId String? @db.Uuid @map("responsable_id")
  origen       String   @default("manual") @map("origen")
  eliminadoEn  DateTime? @map("eliminado_en")
  createdAt    DateTime @default(now()) @map("creado_en")
  updatedAt    DateTime @updatedAt @map("actualizado_en")
  @@index([businessId, customerId])
  @@index([businessId, estado, fechaPrevista])
  @@map("recordatorio")
}
```
> Distinto de `Notification` (cola de envío email). `Reminder` es tarea de usuario ligada a
> cliente, con estado pendiente/completado/cancelado. "Vencido" = estado PENDING con
> `fechaPrevista < now` (se calcula en front/consulta, no columna).

## 2. Geocodificación — puerto/adaptador (RNF-10)
```
back/src/lib/geo/geocoder.ts        → interface GeocoderPort { geocode(addr): {lat,lng} | null }
back/src/lib/geo/nominatim.ts       → impl. por defecto (fetch OSM, User-Agent, throttle 1/s)
back/src/lib/geo/index.ts           → resolveGeocoder() (Nominatim; futuro Google si env key)
```
- Al crear/actualizar cliente con `direccion` y sin lat/lng manuales → geocodifica; éxito
  `geoEstado=OK`, fallo `geoEstado=FAILED` (regla 8, caso error "Dirección no encontrada").
- Coordenadas manuales tienen prioridad → `geoEstado=OK` sin llamar al geocoder.
- Haversine en SQL/JS para `?near=lat,lng&radiusKm=`: orden por distancia aproximada (RF-18).

## 3. Back — rutas (Express, patrón `crud.ts` + routers custom)
| Ruta | Métodos | Notas |
|---|---|---|
| `/visit-states` | GET, POST, PATCH, DELETE(soft) | `esSistema` no borrable; scope businessId |
| `/visits` | GET(por customerId), POST | POST actualiza ultimaVisitaEn + estado (tx) |
| `/customer-notes` | GET(por customerId, desc), POST | sin PATCH/DELETE (inmutable) |
| `/reminders` | GET(filtros estado/vencidos), POST, PATCH(estado), DELETE(soft) | |
| `/customers` | (extender) GET filtros `estado_visita_id/categoria_abc/tipo/zona/near`, POST/PATCH con geocode | |
| `/customers/import` | POST (CSV/XLSX) | dedupe por nombre+telefono / direccion; devuelve conflictos |
| `/customers/:id/convert` | POST | prospecto→cliente conservando historial (RF-17) |
Registro en `back/src/routes/index.ts` bajo `staffOrClient`/`staffOnly` según patrón. Todo scoped
por `req.businessId`.

## 4. Front — módulo `comercial`
```
front/app/(crm)/comercial/page.tsx        → layout: tabs Mapa | Pendientes | Config estados
front/components/comercial/mapa-clientes.tsx   → Leaflet dynamic import (ssr:false), markers+legend
front/components/comercial/ficha-cliente-panel.tsx → ficha + notas + visitas + recordatorios + "Ir"
front/components/comercial/estado-visita-badge.tsx / abc-badge.tsx
front/components/comercial/registrar-visita-modal.tsx / nota-form.tsx / recordatorio-form.tsx
front/components/comercial/pendientes-view.tsx      → pendientes de visita + de geolocalizar
front/components/comercial/config-estados.tsx       → CRUD estados (admin, RF-19)
front/components/comercial/import-clientes-modal.tsx → CSV/XLSX + dedupe (RF-03)
front/lib/comercial/api.ts / types.ts / maps-link.ts (deep-link "Ir")
```
- `ModuleGuard module="comercial"`. Marcador color = `estadoVisita.color`; ABC = badge.
- "Ir": si cliente sin lat/lng → bloquea y avisa (§10.6 caso negativo); si ok → abre deep-link.
- Leyenda visible siempre (regla 9).
- Mapa: solo clientes con `geoEstado=OK`. Pendientes-de-geolocalizar en su lista (regla 8).

## 5. Activación
- `modules.ts`: `ModuleId` += `'comercial'`; `MODULES` += `{ id:'comercial', termKey:'comercial',
  defaultLabel:'Comercial de campo', category:'operativa', icon:'MapPinned', href:'/comercial',
  recommends:['clientes'] }`.
- `verticals.ts`: vertical `comerciales.defaultModules` += `'comercial'`; terminología opcional
  (`comercial: 'Ruta comercial'`).
- `tenant-config.ts`: `emptyModules()`/`deserialize()` ya hacen merge → configs viejas obtienen el
  módulo en `false` (no regresión).

## 6. Tests
- Back node:test: geocoder (mock fetch), dedupe import, inmutabilidad notas (no PATCH), tx visita
  actualiza estado+ultimaVisita, proximity orden, convert conserva historial, scope businessId.
- Front: unit de `maps-link` (bloqueo sin coords), badge estado≠ABC, y e2e Playwright de mapa +
  registro de visita si el entorno lo permite.

## 7. Migración
`back/prisma/migrations/YYYYMMDDHHMMSS_comercial_campo/migration.sql`: CREATE TYPE enums,
ALTER TABLE cliente ADD COLUMN (nullable), CREATE TABLE estado_visita/visita/nota_cliente/
recordatorio + índices + FKs. **Sin DROP.** Aplica el usuario (gotcha EPERM `prisma generate`
en Windows: usar `--no-engine` si falla). Seed de estados por negocio en `seed.ts` + backfill
para negocios existentes.
