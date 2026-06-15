alter table app.ausencias drop constraint if exists fk_ausencias_empleado;
alter table app.ausencias add constraint fk_ausencias_empleado
  foreign key (empleado_id) references app.empleados(id) on delete set null;
