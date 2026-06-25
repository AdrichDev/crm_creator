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
