alter table app.citas drop constraint if exists fk_citas_cliente;
alter table app.citas add constraint fk_citas_cliente
  foreign key (cliente_id) references app.clientes(id) on delete set null;
