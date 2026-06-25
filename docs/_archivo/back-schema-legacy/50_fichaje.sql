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
