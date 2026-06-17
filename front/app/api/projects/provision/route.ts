import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { buildTenantSchemaSql, schemaName } from '@/lib/generate/tenant-schema';
import type { ModuleId } from '@/lib/config/modules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  id: string;
  name?: string;
  vertical?: string;
  clienteId?: string | null;
  modules?: Partial<Record<ModuleId, boolean>>;
}

async function ensureRegistry(client: import('pg').PoolClient) {
  await client.query(`create table if not exists public.tenants_registry (
    schema_name text primary key,
    project_id  text,
    name        text,
    vertical    text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );`);
  // Vínculo proyecto CRM ↔ cliente real de agents-agency.
  await client.query(`create table if not exists public.crm_project (
    id_crm      text primary key,
    id_cliente  text,
    nombre      text,
    vertical    text,
    schema_name text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );`);
}

// POST: crea el schema del proyecto (idempotente) con las tablas de sus módulos.
export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }
  if (!body?.id) return NextResponse.json({ ok: false, error: 'Falta el id del proyecto' }, { status: 400 });

  const schema = schemaName(body.id, body.vertical);
  const sql = buildTenantSchemaSql(schema, body.modules ?? {});

  const client = await getPool().connect();
  try {
    // Extensiones best-effort (no abortan la creación del schema si faltan).
    await client.query(`create extension if not exists "pgcrypto"`).catch(() => {});
    await client.query(`create extension if not exists "vector"`).catch(() => {});
    await client.query('begin');
    await client.query(sql);
    await ensureRegistry(client);
    await client.query(
      `insert into public.tenants_registry (schema_name, project_id, name, vertical)
       values ($1, $2, $3, $4)
       on conflict (schema_name) do update set name = excluded.name, vertical = excluded.vertical, updated_at = now()`,
      [schema, body.id, body.name ?? null, body.vertical ?? null],
    );
    await client.query(
      `insert into public.crm_project (id_crm, id_cliente, nombre, vertical, schema_name)
       values ($1, $2, $3, $4, $5)
       on conflict (id_crm) do update set id_cliente = excluded.id_cliente, nombre = excluded.nombre,
         vertical = excluded.vertical, schema_name = excluded.schema_name, updated_at = now()`,
      [body.id, body.clienteId ?? null, body.name ?? null, body.vertical ?? null, schema],
    );
    await client.query('commit');
    return NextResponse.json({ ok: true, schema });
  } catch (e) {
    await client.query('rollback').catch(() => {});
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/projects/provision?id=<projectId> : elimina el schema del proyecto.
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const vertical = url.searchParams.get('vertical') ?? undefined;
  if (!id) return NextResponse.json({ ok: false, error: 'Falta el id' }, { status: 400 });
  const client = await getPool().connect();
  try {
    await ensureRegistry(client);
    // Busca el schema real por project_id (el nombre incluye el sector); si no, lo deriva.
    const found = await client.query<{ schema_name: string }>(
      `select schema_name from public.tenants_registry where project_id = $1 limit 1`, [id],
    );
    const schema = found.rows[0]?.schema_name ?? schemaName(id, vertical);
    await client.query(`drop schema if exists "${schema}" cascade;`);
    await client.query(`delete from public.tenants_registry where schema_name = $1`, [schema]);
    return NextResponse.json({ ok: true, schema });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
