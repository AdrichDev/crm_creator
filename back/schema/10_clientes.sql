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
