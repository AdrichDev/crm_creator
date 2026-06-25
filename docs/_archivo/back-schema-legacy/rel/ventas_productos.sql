alter table app.venta_lineas drop constraint if exists fk_lineas_producto;
alter table app.venta_lineas add constraint fk_lineas_producto
  foreign key (producto_id) references app.productos(id) on delete set null;
