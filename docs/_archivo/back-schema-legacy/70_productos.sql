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
