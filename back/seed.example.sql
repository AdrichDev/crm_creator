-- seed.example.sql — Datos de ejemplo para UN tenant (ejecutar tras el esquema).
-- Reemplaza el uuid por el del tenant real. Sin credenciales: solo de referencia.
begin;
with t as (
  insert into app.tenants (name, slug, vertical, brand_primary, brand_secondary, brand_logo_text, setup_complete)
  values ('Estudio Lúa', 'estudio-lua', 'peluqueria', '#1b431c', '#8cc63f', 'EL', true)
  returning id
)
insert into app.tenant_modules (tenant_id, module, enabled)
select t.id, m, true from t, unnest(array[
  'dashboard','clientes','citas','servicios','empleados','vacaciones',
  'productos','ventas','web','marketing','configuracion'
]::app.module_id[]) as m;
commit;
