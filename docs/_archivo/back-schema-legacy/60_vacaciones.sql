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
