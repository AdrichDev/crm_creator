-- ====================================================================
-- Esquema generado automáticamente
-- Módulos incluidos: clientes, servicios, empleados, citas, fichaje, vacaciones, productos, ventas, marketing, web
-- Generado: 2026-06-15T15:10:11.563Z
-- ====================================================================

-- ============================================================================
-- 00_core.sql — Núcleo multi-tenant (Supabase / PostgreSQL)
-- Siempre se incluye. Define tenants, perfiles, registro de módulos, branding,
-- helpers de RLS y triggers comunes. No contiene credenciales.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Esquema de aplicación
-- ---------------------------------------------------------------------------
create schema if not exists app;

-- updated_at automático
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catálogo de verticales y módulos (enums)
-- ---------------------------------------------------------------------------
do $$ begin
  create type app.vertical_id as enum (
    'peluqueria','estetica','hosteleria','fitness','escalada',
    'clinica','taller','veterinario','custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.module_id as enum (
    'dashboard','clientes','citas','servicios','empleados','fichaje',
    'vacaciones','productos','ventas','web','marketing','configuracion'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tenants (cada negocio)
-- ---------------------------------------------------------------------------
create table if not exists app.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique,
  vertical      app.vertical_id not null default 'custom',
  phone         text,
  email         text,
  address       text,
  -- branding
  brand_primary    text not null default '#1b431c',
  brand_secondary  text not null default '#8cc63f',
  brand_logo_text  text,
  setup_complete   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_tenants_updated on app.tenants;
create trigger trg_tenants_updated before update on app.tenants
  for each row execute function app.set_updated_at();

-- Módulos activos por tenant (qué "toma" cada negocio)
create table if not exists app.tenant_modules (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  module     app.module_id not null,
  enabled    boolean not null default true,
  primary key (tenant_id, module)
);

-- Overrides de terminología por tenant (clave -> etiqueta visible)
create table if not exists app.tenant_terms (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  term_key   text not null,
  label      text not null,
  primary key (tenant_id, term_key)
);

-- Ajustes libres por categoría (equivalente a settings de ExceliaTrack)
create table if not exists app.tenant_settings (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  category   text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, category)
);

-- ---------------------------------------------------------------------------
-- Perfiles de usuario (vinculados a auth.users de Supabase) y pertenencia
-- ---------------------------------------------------------------------------
do $$ begin
  create type app.user_role as enum ('owner','admin','manager','empleado');
exception when duplicate_object then null; end $$;

create table if not exists app.profiles (
  id          uuid primary key,           -- = auth.users.id
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Un usuario puede pertenecer a uno o varios tenants con un rol
create table if not exists app.memberships (
  tenant_id  uuid not null references app.tenants(id) on delete cascade,
  user_id    uuid not null references app.profiles(id) on delete cascade,
  role       app.user_role not null default 'empleado',
  primary key (tenant_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Helpers de Row Level Security
-- ---------------------------------------------------------------------------
-- Tenants a los que pertenece el usuario autenticado
create or replace function app.user_tenant_ids()
returns setof uuid language sql stable security definer set search_path = app as $$
  select tenant_id from app.memberships where user_id = auth.uid();
$$;

-- Comodín para activar RLS estándar "solo mi tenant" en una tabla con tenant_id
create or replace function app.enable_tenant_rls(p_table regclass)
returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', p_table);
  execute format($f$
    drop policy if exists tenant_isolation on %1$s;
    create policy tenant_isolation on %1$s
      using (tenant_id in (select app.user_tenant_ids()))
      with check (tenant_id in (select app.user_tenant_ids()));
  $f$, p_table);
end;
$$;

-- RLS de las tablas core
alter table app.tenants          enable row level security;
alter table app.tenant_modules   enable row level security;
alter table app.tenant_terms     enable row level security;
alter table app.tenant_settings  enable row level security;
alter table app.memberships      enable row level security;

drop policy if exists tenants_self on app.tenants;
create policy tenants_self on app.tenants
  using (id in (select app.user_tenant_ids()))
  with check (id in (select app.user_tenant_ids()));

drop policy if exists tmod_self on app.tenant_modules;
create policy tmod_self on app.tenant_modules
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists tterm_self on app.tenant_terms;
create policy tterm_self on app.tenant_terms
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists tset_self on app.tenant_settings;
create policy tset_self on app.tenant_settings
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists memb_self on app.memberships;
create policy memb_self on app.memberships
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

-- Módulos activos de este proyecto (referencia)
-- (insertar por tenant al crear el negocio)

-- === Módulo: clientes ===
-- 10_clientes.sql — Módulo CRM / Clientes
create table if not exists app.clientes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  nombre      text not null,
  email       text,
  telefono    text,
  segmento    text default 'Nuevo',           -- Nuevo | Recurrente | VIP
  visitas     integer not null default 0,
  gasto_total numeric(12,2) not null default 0,
  ultima_visita date,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_clientes_tenant on app.clientes(tenant_id);
drop trigger if exists trg_clientes_updated on app.clientes;
create trigger trg_clientes_updated before update on app.clientes
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.clientes');

-- === Módulo: servicios ===
-- 20_servicios.sql — Módulo Servicios / Tratamientos / Tarifas
create table if not exists app.servicios (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  nombre      text not null,
  categoria   text,
  duracion_min integer not null default 30,
  precio      numeric(12,2) not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_servicios_tenant on app.servicios(tenant_id);
drop trigger if exists trg_servicios_updated on app.servicios;
create trigger trg_servicios_updated before update on app.servicios
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.servicios');

-- === Módulo: empleados ===
-- 30_empleados.sql — Módulo Empleados / Profesionales
create table if not exists app.empleados (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references app.tenants(id) on delete cascade,
  user_id      uuid references app.profiles(id) on delete set null, -- opcional: cuenta
  nombre       text not null,
  rol          text,
  especialidad text,
  email        text,
  estado       text not null default 'Activo',  -- Activo | Vacaciones | Baja
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_empleados_tenant on app.empleados(tenant_id);
drop trigger if exists trg_empleados_updated on app.empleados;
create trigger trg_empleados_updated before update on app.empleados
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.empleados');

-- === Módulo: citas ===
-- 40_citas.sql — Módulo Citas / Reservas / Clases / Órdenes de trabajo
create table if not exists app.citas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references app.tenants(id) on delete cascade,
  cliente_id   uuid,    -- FK a clientes (se añade en rel/ si el módulo está)
  servicio_id  uuid,    -- FK a servicios
  empleado_id  uuid,    -- FK a empleados
  cliente_nombre  text, -- denormalizado para cuando no hay módulo clientes
  servicio_nombre text,
  empleado_nombre text,
  fecha        date not null,
  hora         time,
  estado       text not null default 'Pendiente', -- Pendiente|Confirmada|Cancelada|Completada
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_citas_tenant on app.citas(tenant_id);
create index if not exists idx_citas_fecha on app.citas(tenant_id, fecha);
drop trigger if exists trg_citas_updated on app.citas;
create trigger trg_citas_updated before update on app.citas
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.citas');

-- === Módulo: fichaje ===
-- 50_fichaje.sql — Módulo Fichaje / Control de jornada (ExceliaTrack)
create table if not exists app.fichajes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants(id) on delete cascade,
  empleado_id   uuid,            -- FK a empleados (rel/)
  empleado_nombre text,
  fecha         date not null default current_date,
  entrada       timestamptz,
  salida        timestamptz,
  horas         numeric(5,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_fichajes_tenant on app.fichajes(tenant_id);
drop trigger if exists trg_fichajes_updated on app.fichajes;
create trigger trg_fichajes_updated before update on app.fichajes
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.fichajes');

-- === Módulo: vacaciones ===
-- 60_vacaciones.sql — Módulo Vacaciones / Ausencias
create table if not exists app.ausencias (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants(id) on delete cascade,
  empleado_id   uuid,            -- FK a empleados (rel/)
  empleado_nombre text,
  tipo          text not null default 'Vacaciones', -- Vacaciones|Asuntos propios|Baja
  fecha_inicio  date not null,
  fecha_fin     date not null,
  dias          integer,
  estado        text not null default 'Pendiente',  -- Pendiente|Aprobada|Rechazada
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_ausencias_tenant on app.ausencias(tenant_id);
drop trigger if exists trg_ausencias_updated on app.ausencias;
create trigger trg_ausencias_updated before update on app.ausencias
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.ausencias');

-- === Módulo: productos ===
-- 70_productos.sql — Módulo Productos / Inventario
create table if not exists app.productos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references app.tenants(id) on delete cascade,
  nombre       text not null,
  categoria    text,
  stock        integer not null default 0,
  stock_minimo integer not null default 0,
  precio       numeric(12,2) not null default 0,
  proveedor    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_productos_tenant on app.productos(tenant_id);
drop trigger if exists trg_productos_updated on app.productos;
create trigger trg_productos_updated before update on app.productos
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.productos');

-- === Módulo: ventas ===
-- 80_ventas.sql — Módulo Ventas / TPV (transacciones + líneas)
create table if not exists app.ventas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants(id) on delete cascade,
  numero        bigint generated by default as identity,
  cliente_id    uuid,           -- FK a clientes (rel/)
  cliente_nombre text default 'Contado',
  fecha         date not null default current_date,
  metodo_pago   text not null default 'Tarjeta', -- Tarjeta|Efectivo|Bizum
  total         numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_ventas_tenant on app.ventas(tenant_id);
drop trigger if exists trg_ventas_updated on app.ventas;
create trigger trg_ventas_updated before update on app.ventas
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.ventas');

create table if not exists app.venta_lineas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references app.tenants(id) on delete cascade,
  venta_id     uuid not null references app.ventas(id) on delete cascade,
  producto_id  uuid,            -- FK a productos (rel/)
  servicio_id  uuid,            -- FK a servicios (rel/)
  concepto     text not null,
  cantidad     integer not null default 1,
  precio_unit  numeric(12,2) not null default 0,
  subtotal     numeric(12,2) not null default 0
);
create index if not exists idx_venta_lineas_venta on app.venta_lineas(venta_id);
select app.enable_tenant_rls('app.venta_lineas');

-- === Módulo: marketing ===
-- 90_marketing.sql — Módulo Marketing / Campañas / Fidelización
create table if not exists app.campanas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references app.tenants(id) on delete cascade,
  nombre       text not null,
  canal        text not null default 'Email',  -- Email|SMS|WhatsApp
  estado       text not null default 'Borrador', -- Borrador|Activa|Automática|Finalizada
  enviados     integer not null default 0,
  aperturas    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_campanas_tenant on app.campanas(tenant_id);
drop trigger if exists trg_campanas_updated on app.campanas;
create trigger trg_campanas_updated before update on app.campanas
  for each row execute function app.set_updated_at();
select app.enable_tenant_rls('app.campanas');

-- === Módulo: web ===
-- 95_web.sql — Módulo Web pública (reseñas + galería)
create table if not exists app.resenas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  autor       text not null,
  estrellas   integer not null default 5 check (estrellas between 1 and 5),
  texto       text,
  fecha       date not null default current_date,
  publicada   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_resenas_tenant on app.resenas(tenant_id);
select app.enable_tenant_rls('app.resenas');

create table if not exists app.galeria (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  titulo      text,
  url         text not null,
  orden       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_galeria_tenant on app.galeria(tenant_id);
select app.enable_tenant_rls('app.galeria');

-- === Relaciones entre módulos ===
alter table app.citas drop constraint if exists fk_citas_cliente;
alter table app.citas add constraint fk_citas_cliente
  foreign key (cliente_id) references app.clientes(id) on delete set null;
alter table app.citas drop constraint if exists fk_citas_servicio;
alter table app.citas add constraint fk_citas_servicio
  foreign key (servicio_id) references app.servicios(id) on delete set null;
alter table app.citas drop constraint if exists fk_citas_empleado;
alter table app.citas add constraint fk_citas_empleado
  foreign key (empleado_id) references app.empleados(id) on delete set null;
alter table app.fichajes drop constraint if exists fk_fichajes_empleado;
alter table app.fichajes add constraint fk_fichajes_empleado
  foreign key (empleado_id) references app.empleados(id) on delete set null;
alter table app.ausencias drop constraint if exists fk_ausencias_empleado;
alter table app.ausencias add constraint fk_ausencias_empleado
  foreign key (empleado_id) references app.empleados(id) on delete set null;
alter table app.ventas drop constraint if exists fk_ventas_cliente;
alter table app.ventas add constraint fk_ventas_cliente
  foreign key (cliente_id) references app.clientes(id) on delete set null;
alter table app.venta_lineas drop constraint if exists fk_lineas_producto;
alter table app.venta_lineas add constraint fk_lineas_producto
  foreign key (producto_id) references app.productos(id) on delete set null;
alter table app.venta_lineas drop constraint if exists fk_lineas_servicio;
alter table app.venta_lineas add constraint fk_lineas_servicio
  foreign key (servicio_id) references app.servicios(id) on delete set null;
