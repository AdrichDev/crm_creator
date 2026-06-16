// Genera el DDL de UN schema por proyecto (aislamiento por schema, no por tenant_id).
// Reutiliza la definición de columnas por módulo de schemas.ts.
import type { ModuleId } from '@/lib/config/modules';
import { MODULE_TABLES, RELATIONS, type GenTable } from './schemas';

const DATA_ORDER: ModuleId[] = [
  'clientes', 'servicios', 'empleados', 'citas', 'fichaje', 'vacaciones', 'productos', 'ventas', 'facturas', 'marketing',
];

/** Nombre de schema Postgres válido y determinista, en función del sector + id. */
export function schemaName(projectId: string, vertical?: string): string {
  const clean = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const sector = vertical ? clean(vertical) : '';
  const id = clean(projectId) || 'proyecto';
  return (`tenant_${sector ? sector + '_' : ''}${id}`).slice(0, 63);
}

function tableDDL(schema: string, t: GenTable): string {
  const cols = t.cols.map((c) => `  ${c.name} ${c.sql},`).join('\n');
  const tbl = `"${schema}"."${t.table}"`;
  return `create table if not exists ${tbl} (
  id uuid primary key default gen_random_uuid(),
${cols}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_${t.table}_updated on ${tbl};
create trigger trg_${t.table}_updated before update on ${tbl}
  for each row execute function "${schema}".set_updated_at();`;
}

/** SQL idempotente: crea el schema y las tablas de los módulos activos. */
export function buildTenantSchemaSql(schema: string, modules: Partial<Record<ModuleId, boolean>>): string {
  const active = DATA_ORDER.filter((m) => modules[m]);
  const present = new Set(active);
  const parts: string[] = [
    `create schema if not exists "${schema}";`,
    `create or replace function "${schema}".set_updated_at()\n` +
    `returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;`,
  ];
  for (const m of active) for (const t of (MODULE_TABLES[m] ?? [])) parts.push(tableDDL(schema, t));
  for (const r of RELATIONS.filter((r) => present.has(r.module) && present.has(r.needs))) {
    parts.push(
      `alter table "${schema}"."${r.table}" drop constraint if exists ${r.name};\n` +
      `alter table "${schema}"."${r.table}" add constraint ${r.name}\n` +
      `  foreign key (${r.col}) references "${schema}"."${r.ref}"(id) on delete set null;`);
  }
  return parts.join('\n\n') + '\n';
}
