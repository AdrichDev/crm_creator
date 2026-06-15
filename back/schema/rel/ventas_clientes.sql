alter table app.ventas drop constraint if exists fk_ventas_cliente;
alter table app.ventas add constraint fk_ventas_cliente
  foreign key (cliente_id) references app.clientes(id) on delete set null;
