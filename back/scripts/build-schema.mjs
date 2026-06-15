#!/usr/bin/env node
/**
 * Generador de esquema por proyecto.
 * Construye un único .sql con el CORE + SOLO los módulos indicados (y sus
 * relaciones cruzadas si ambos módulos están presentes).
 *
 * Uso:
 *   node scripts/build-schema.mjs --modules clientes,citas,servicios [--out out.sql]
 *   node scripts/build-schema.mjs --all                       # todos los módulos
 *   node scripts/build-schema.mjs --from ../front/<config>.json  # lee modules de una config de tenant
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(__dirname, '..', 'schema');
const manifest = JSON.parse(readFileSync(join(SCHEMA, 'manifest.json'), 'utf8'));

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(name);

let modules = [];
if (flag('--all')) {
  modules = manifest.order.slice();
} else if (arg('--from')) {
  const cfg = JSON.parse(readFileSync(resolve(arg('--from')), 'utf8'));
  const map = cfg.modules || {};
  modules = Object.keys(map).filter((k) => map[k] === true);
} else if (arg('--modules')) {
  modules = arg('--modules').split(',').map((s) => s.trim()).filter(Boolean);
} else {
  console.error('Indica --all, --modules a,b,c o --from config.json');
  process.exit(1);
}

// Ignora módulos "core" siempre presentes y desconocidos
const known = new Set(manifest.order);
modules = modules.filter((m) => known.has(m));
const present = new Set(modules);
// Ordena según manifest.order
modules.sort((a, b) => manifest.order.indexOf(a) - manifest.order.indexOf(b));

const read = (rel) => readFileSync(join(SCHEMA, rel), 'utf8').trimEnd();
const parts = [];
parts.push(`-- ====================================================================`);
parts.push(`-- Esquema generado automáticamente`);
parts.push(`-- Módulos incluidos: ${modules.join(', ') || '(ninguno)'}`);
parts.push(`-- Generado: ${new Date().toISOString()}`);
parts.push(`-- ====================================================================\n`);

// CORE (siempre)
for (const f of manifest.core) parts.push(read(f));

// Semilla en tenant_modules: marca qué módulos quedan activos
parts.push(`\n-- Módulos activos de este proyecto (referencia)\n-- (insertar por tenant al crear el negocio)`);

// TABLAS por módulo
for (const m of modules) {
  const def = manifest.modules[m];
  if (!def) continue;
  parts.push(`\n-- === Módulo: ${m} ===`);
  for (const f of def.tables) parts.push(read(f));
}

// RELACIONES (solo si ambos módulos presentes)
const rels = [];
for (const m of modules) {
  const def = manifest.modules[m];
  for (const r of def.relations || []) {
    if ((r.needs || []).every((n) => present.has(n))) rels.push(r.file);
  }
}
if (rels.length) {
  parts.push(`\n-- === Relaciones entre módulos ===`);
  for (const f of rels) parts.push(read(f));
}

const sql = parts.join('\n') + '\n';
const out = arg('--out');
if (out) { writeFileSync(resolve(out), sql); console.error(`Escrito: ${out} (${modules.length} módulos, ${rels.length} relaciones)`); }
else process.stdout.write(sql);
