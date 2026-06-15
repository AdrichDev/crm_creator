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
