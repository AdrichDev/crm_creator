import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import type { MemberRole } from '../lib/generated/prisma/client.js';
import { TENANT_SECRET_CATALOG, findSecretSlot, ENV_KEY_NAME_PATTERN, inferScope } from '../lib/tenant-secrets/catalog.js';
import { encryptSecret, decryptSecret } from '../lib/tenant-secrets/crypto.js';
import { testProviderConnection } from '../lib/tenant-secrets/provider-test.js';
import { consume } from '../lib/rateLimit.js';
import { BASE_ENV_VAR_NAMES } from '../lib/export-builders/public-env-secrets.js';

// ---------------------------------------------------------------------------
// crm-onboarding-tenant-keys — superficie HUMANA (sesión + Membership) sobre el
// catálogo fijo de 5 slots de TenantSecret. Montado bajo `authenticate` en
// routes/index.ts (req.userId ya poblado). `crm-tenant-keys-self-service`
// REUTILIZA este router tal cual: la misma ruta `/tenant-keys/:businessId/secrets`
// sirve onboarding (businessId = editing.id) y autoservicio (businessId = sesión
// propia del ADMIN/MANAGER), porque el gate es SIEMPRE la Membership del
// `:businessId` del path, nunca el negocio activo de la sesión (req.role).
//
// Patrón calcado de `projects.ts:109-136` (PATCH /projects/:id): 404 si no hay
// Membership del usuario para ese businessId — cross-tenant estructuralmente
// cerrado, forjar un :businessId ajeno cae en 404 sin tocar datos.
// ---------------------------------------------------------------------------

const CATALOG_NAMES: string[] = TENANT_SECRET_CATALOG.map((s) => s.name);
const ADMIN_ROLES: MemberRole[] = ['ADMIN', 'MANAGER'];

interface SecretMetaRow {
  name: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  envVarName: string | null;
  updatedAt: Date;
}

interface SecretFullRow {
  name: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  valueCiphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

/** Vista estrecha de BD (patrón DI del repo, ver `TenantKeysOperatorDb`). */
export interface TenantKeysDb {
  membership: {
    findFirst(args: { where: { userId: string; businessId: string } }): Promise<{ role: MemberRole } | null>;
  };
  tenantSecret: {
    findMany(args: {
      where: { businessId: string };
      select: { name: true; scope: true; envVarName: true; updatedAt: true };
    }): Promise<SecretMetaRow[]>;
    findUnique(args: {
      where: { businessId_name: { businessId: string; name: string } };
    }): Promise<SecretFullRow | null>;
    upsert(args: {
      where: { businessId_name: { businessId: string; name: string } };
      create: {
        businessId: string; name: string; scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
        valueCiphertext: string; iv: string; authTag: string; keyVersion: number;
        envVarName: string | null;
      };
      update: {
        scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
        valueCiphertext: string; iv: string; authTag: string; keyVersion: number;
        envVarName: string | null;
      };
    }): Promise<{ name: string; updatedAt: Date }>;
    delete(args: { where: { businessId_name: { businessId: string; name: string } } }): Promise<unknown>;
  };
}

// Dependencias reales: selects explícitos, nunca sobre-fetchean valueCiphertext/iv/
// authTag más allá de lo que cada handler necesita (mismo cuidado que operatorWriteDb).
const defaultDb: TenantKeysDb = {
  membership: {
    findFirst: (args) => prisma.membership.findFirst({ where: args.where, select: { role: true } }),
  },
  tenantSecret: {
    findMany: (args) =>
      prisma.tenantSecret.findMany({ where: args.where, select: { name: true, scope: true, envVarName: true, updatedAt: true } }),
    findUnique: (args) =>
      prisma.tenantSecret.findUnique({
        where: args.where,
        select: { name: true, scope: true, valueCiphertext: true, iv: true, authTag: true, keyVersion: true },
      }),
    upsert: (args) =>
      prisma.tenantSecret.upsert({
        where: args.where,
        create: args.create,
        update: args.update,
        select: { name: true, updatedAt: true },
      }),
    delete: (args) => prisma.tenantSecret.delete({ where: args.where }),
  },
};

/**
 * Membership del `:businessId` del PATH (nunca `req.role`, que depende del
 * `x-business-id` activo de la sesión y puede diferir en onboarding). 404 si el
 * usuario no es miembro; 403 si su rol no es ADMIN/MANAGER. Responde y devuelve
 * `false` en cualquiera de los dos casos — el caller debe cortar ahí.
 */
async function requireMemberAdmin(db: TenantKeysDb, req: AuthedRequest, res: Response): Promise<boolean> {
  const businessId = req.params.businessId;
  const membership = await db.membership.findFirst({ where: { userId: req.userId as string, businessId } });
  if (!membership) {
    res.status(404).json({ error: { code: 'not_found', message: 'Negocio no encontrado' } });
    return false;
  }
  if (!ADMIN_ROLES.includes(membership.role)) {
    res.status(403).json({ error: { code: 'forbidden', message: 'Permisos insuficientes' } });
    return false;
  }
  return true;
}

/* ---------- GET /:businessId/secrets ---------- */

export async function listSecretsHandler(db: TenantKeysDb, req: AuthedRequest, res: Response) {
  try {
    if (!(await requireMemberAdmin(db, req, res))) return;
    const businessId = req.params.businessId;
    // crm-tenant-keys-freeform: sin filtro de nombre — trae TODO lo del tenant, no solo el
    // catálogo. Las filas fuera de los 5 presets se listan también (name === label, sin
    // provider, scope/envVarName tal cual quedaron guardados al crearlas).
    const rows = await db.tenantSecret.findMany({
      where: { businessId },
      select: { name: true, scope: true, envVarName: true, updatedAt: true },
    });
    const byName = new Map(rows.map((r) => [r.name, r]));
    const presetSecrets = TENANT_SECRET_CATALOG.map((slot) => ({
      name: slot.name,
      label: slot.label,
      scope: slot.scope,
      envVarName: slot.envVarName ?? null,
      configured: byName.has(slot.name),
      updatedAt: byName.get(slot.name)?.updatedAt.toISOString() ?? null,
    }));
    const extraSecrets = rows
      .filter((r) => !CATALOG_NAMES.includes(r.name))
      .map((r) => ({
        name: r.name,
        label: r.name,
        scope: r.scope,
        envVarName: r.envVarName,
        configured: true,
        updatedAt: r.updatedAt.toISOString(),
      }));
    res.status(200).json({ secrets: [...presetSecrets, ...extraSecrets] });
  } catch (e) {
    console.error('[tenant-keys] error listando secretos:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar los secretos' } });
  }
}

/* ---------- PUT /:businessId/secrets/:name ---------- */

export async function upsertSecretHandler(db: TenantKeysDb, req: AuthedRequest, res: Response) {
  try {
    if (!(await requireMemberAdmin(db, req, res))) return;
    const businessId = req.params.businessId;
    const name = req.params.name;
    const slot = findSecretSlot(name);

    // crm-tenant-keys-freeform: fuera del catálogo de 5 presets, se acepta cualquier
    // nombre con formato válido — scope/envVarName se infieren por prefijo NEXT_PUBLIC_,
    // nunca del body (mismo principio que el catálogo: el cliente no elige su propio scope).
    let scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
    let envVarName: string | null;
    let label: string;
    if (slot) {
      scope = slot.scope;
      envVarName = slot.envVarName ?? null;
      label = slot.label;
    } else {
      if (!ENV_KEY_NAME_PATTERN.test(name)) {
        return res.status(422).json({ error: { code: 'invalid_name', message: 'Nombre inválido: usa MAYÚSCULAS_CON_GUION_BAJO empezando por letra' } });
      }
      if (BASE_ENV_VAR_NAMES.includes(name)) {
        return res.status(422).json({ error: { code: 'reserved_name', message: 'Ese nombre está reservado por el export' } });
      }
      scope = inferScope(name);
      envVarName = scope === 'FRONTEND_PUBLIC' ? name : null;
      label = name;
    }

    const body = (req.body ?? {}) as { value?: unknown };
    if (typeof body.value !== 'string' || !body.value) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta value' } });
    }
    // Nunca lleva saltos de línea: se hornea literal en .env.local en el export
    // (crm-env-contract-tiers) y una línea rota inyectaría variables no deseadas.
    if (/[\r\n]/.test(body.value)) {
      return res.status(422).json({ error: { code: 'invalid', message: 'value no puede contener saltos de línea' } });
    }

    const enc = encryptSecret(body.value);
    const row = await db.tenantSecret.upsert({
      where: { businessId_name: { businessId, name } },
      create: {
        businessId, name, scope,
        valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion,
        envVarName,
      },
      update: {
        scope,
        valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion,
        envVarName,
      },
    });

    // El valor NUNCA vuelve — ni cifrado ni en claro.
    res.status(200).json({
      name, label, scope, envVarName,
      configured: true, updatedAt: row.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error('[tenant-keys] error guardando secreto:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo guardar el secreto' } });
  }
}

/* ---------- DELETE /:businessId/secrets/:name ---------- */

export async function deleteSecretHandler(db: TenantKeysDb, req: AuthedRequest, res: Response) {
  try {
    if (!(await requireMemberAdmin(db, req, res))) return;
    const businessId = req.params.businessId;
    const name = req.params.name;

    // crm-tenant-keys-freeform: opera sobre cualquier name existente, no solo catálogo —
    // el 404 de abajo ya cubre un nombre inventado sin fila.
    const existing = await db.tenantSecret.findUnique({ where: { businessId_name: { businessId, name } } });
    if (!existing) return res.status(404).json({ error: { code: 'secret_not_found', message: 'Secreto no encontrado' } });

    // Hard delete: sin tombstone (ver design.md §4) — un TenantSecret borrado es
    // indistinguible de uno que nunca existió, y no hay requisito de auditoría histórica.
    await db.tenantSecret.delete({ where: { businessId_name: { businessId, name } } });
    res.status(200).json({ name, configured: false });
  } catch (e) {
    console.error('[tenant-keys] error borrando secreto:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo borrar el secreto' } });
  }
}

/* ---------- POST /:businessId/secrets/:name/test ---------- */

// Rate limit por businessId:name — acota el "oráculo de validez de clave ajena"
// que representa este endpoint (llama al proveedor real con la clave tecleada).
// Se aplica DENTRO del handler, DESPUÉS de requireMemberAdmin: así un autenticado
// que NO es miembro del negocio no puede gastar el cupo del "Probar" de un tercero
// (cae en 404 antes de tocar el contador). Ver N3 de la revisión de seguridad.
const TEST_RATE_BUCKET = 'secret-test';
const TEST_RATE_WINDOW_MS = 60_000;
const TEST_RATE_MAX = 5;

export async function testSecretHandler(
  db: TenantKeysDb,
  req: AuthedRequest,
  res: Response,
  // DI opcional (mismo patrón que ProviderTestDeps en provider-test.ts): el call-site real
  // (router de abajo) usa el default real; los tests inyectan un doble para no llamar a un
  // proveedor externo de verdad (node:test en este repo no soporta mock.module sin flag).
  connTest: typeof testProviderConnection = testProviderConnection,
) {
  try {
    if (!(await requireMemberAdmin(db, req, res))) return;
    const businessId = req.params.businessId;
    const slot = findSecretSlot(req.params.name);
    // crm-tenant-keys-freeform: "Probar conexión" solo existe para los 5 presets con
    // provider conocido — una key libre no tiene con qué probarse. 400 ANTES del
    // rate-limit: no consume cupo por algo que nunca se va a poder ejecutar.
    if (!slot) return res.status(400).json({ error: { code: 'not_testable', message: 'Esta variable no tiene prueba de conexión disponible' } });

    // Rate limit DESPUÉS del gate (N3): solo un miembro ADMIN/MANAGER del negocio puede
    // consumir el contador; un no-miembro ya salió por 404 arriba. Antes de resolver el
    // value / llamar al proveedor, para acotar el coste del "oráculo de validez".
    if (!consume(TEST_RATE_BUCKET, `${businessId}:${slot.name}`, TEST_RATE_WINDOW_MS, TEST_RATE_MAX)) {
      return res.status(429).json({ error: { code: 'rate_limited', message: 'Demasiados intentos, espera unos minutos' } });
    }

    const body = (req.body ?? {}) as { value?: unknown };
    let value: string | null = null;
    if (typeof body.value === 'string' && body.value) {
      // Probar un value del body NUNCA lo persiste — no se llama a upsert aquí.
      value = body.value;
    } else {
      const row = await db.tenantSecret.findUnique({ where: { businessId_name: { businessId, name: slot.name } } });
      if (row) {
        value = decryptSecret({ ciphertext: row.valueCiphertext, iv: row.iv, authTag: row.authTag, keyVersion: row.keyVersion });
      }
    }
    if (!value) return res.status(404).json({ error: { code: 'no_value', message: 'No hay valor que probar' } });

    // Un rechazo del proveedor es `ok: false`, NUNCA un error HTTP — el 200 siempre
    // se devuelve si se pudo ejercitar la prueba; `detail` nunca lleva el value crudo.
    const result = await connTest(slot.provider, value);
    res.status(200).json({ name: slot.name, provider: slot.provider, ok: result.ok, ...(result.detail ? { detail: result.detail } : {}) });
  } catch (e) {
    console.error('[tenant-keys] error probando secreto:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo probar el secreto' } });
  }
}

/* ---------- Router ---------- */

export function buildTenantKeysRouter(db: TenantKeysDb): Router {
  const router = Router();
  router.get('/:businessId/secrets', (req, res) => listSecretsHandler(db, req as AuthedRequest, res));
  router.put('/:businessId/secrets/:name', (req, res) => upsertSecretHandler(db, req as AuthedRequest, res));
  router.delete('/:businessId/secrets/:name', (req, res) => deleteSecretHandler(db, req as AuthedRequest, res));
  router.post('/:businessId/secrets/:name/test', (req, res) => testSecretHandler(db, req as AuthedRequest, res));
  return router;
}

export const tenantKeysRouter = buildTenantKeysRouter(defaultDb);
