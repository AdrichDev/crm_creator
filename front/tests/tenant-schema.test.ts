import { describe, it, expect } from 'vitest';
import { schemaName, buildTenantSchemaSql } from '@/lib/generate/tenant-schema';

describe('UC-4 · schema por sector', () => {
  it('AC-4.2 nombre determinista: tenant_<vertical>_<id>', () => {
    expect(schemaName('p_abc', 'abogados')).toBe('tenant_abogados_p_abc');
    expect(schemaName('p_ABC-99', 'veterinario')).toBe('tenant_veterinario_p_abc_99');
    expect(schemaName('p_x')).toBe('tenant_p_x'); // sin vertical
  });

  it('AC-4.3 abogados: crea servicios (tarifas) y NO productos si no está activo', () => {
    const schema = schemaName('p_lex', 'abogados');
    const sql = buildTenantSchemaSql(schema, { clientes: true, servicios: true, citas: true });
    expect(sql).toContain(`create schema if not exists "${schema}"`);
    expect(sql).toContain(`"${schema}"."servicios"`);
    expect(sql).toContain(`"${schema}"."clientes"`);
    expect(sql).not.toContain(`"${schema}"."productos"`);
  });

  it('crea facturas + documentos cuando el módulo facturas está activo', () => {
    const schema = schemaName('p_fac', 'clinica');
    const sql = buildTenantSchemaSql(schema, { clientes: true, facturas: true });
    expect(sql).toContain(`"${schema}"."facturas"`);
    expect(sql).toContain(`"${schema}"."documentos"`);
    // FK documentos → facturas
    expect(sql).toContain('fk_documentos_factura');
  });

  it('es idempotente (usa IF NOT EXISTS)', () => {
    const sql = buildTenantSchemaSql(schemaName('p_1', 'taller'), { clientes: true });
    expect(sql).toContain('create table if not exists');
  });
});
