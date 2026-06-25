alter table app.citas drop constraint if exists fk_citas_servicio;
alter table app.citas add constraint fk_citas_servicio
  foreign key (servicio_id) references app.servicios(id) on delete set null;
