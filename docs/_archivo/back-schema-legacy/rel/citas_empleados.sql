alter table app.citas drop constraint if exists fk_citas_empleado;
alter table app.citas add constraint fk_citas_empleado
  foreign key (empleado_id) references app.empleados(id) on delete set null;
