alter table app.fichajes drop constraint if exists fk_fichajes_empleado;
alter table app.fichajes add constraint fk_fichajes_empleado
  foreign key (empleado_id) references app.empleados(id) on delete set null;
