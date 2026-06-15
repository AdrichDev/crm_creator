alter table app.venta_lineas drop constraint if exists fk_lineas_servicio;
alter table app.venta_lineas add constraint fk_lineas_servicio
  foreign key (servicio_id) references app.servicios(id) on delete set null;
