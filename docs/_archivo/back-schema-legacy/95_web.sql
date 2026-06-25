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
