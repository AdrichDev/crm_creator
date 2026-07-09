import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import type { MemberRole } from '../lib/generated/prisma/client.js';
import { TENANT_SECRET_CATALOG, findSecretSlot, type SecretSlotName } from '../lib/tenant-secrets/catalog.js';
import { encryptSecret, decryptSecret } from '../lib/tenant-secrets/crypto.js';
import { testProviderConnection } from '../lib/tenant-secrets/provider-test.js';
import { rateLimit } from '../lib/rateLimit.js';

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

const CATALOG_NAMES = TENANT_SECRET_CATALOG.map((s) => s.name);
const ADMIN_ROLES: MemberRole[] = ['ADMIN', 'MANAGER'];

interface SecretMetaRow {
  name: string;
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
      where: { businessId: string; name: { in: SecretSlotName[] } };
      select: { name: true; updatedAt: true };
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
    findMany: (args) => prisma.tenantSecret.findMany({ where: args.where, select: { name: true, updatedAt: true } }),
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
    const rows = await db.tenantSecret.findMany({
      where: { businessId, name: { in: CATALOG_NAMES } },
      select: { name: true, updatedAt: true },
    });
    const byName = new Map(rows.map((r) => [r.name, r.updatedAt]));
    const secrets = TENANT_SECRET_CATALOG.map((slot) => ({
      name: slot.name,
      label: slot.label,
      scope: slot.scope,
      envVarName: slot.envVarName ?? null,
      configured: byName.has(slot.name),
      updatedAt: byName.get(slot.name)?.toISOString() ?? null,
    }));
    res.status(200).json({ secrets });
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
    const slot = findSecretSlot(req.params.name);
    if (!slot) return res.status(404).json({ error: { code: 'unknown_secret', message: 'Secreto no reconocido' } });

    const body = (req.body ?? {}) as { value?: unknown };
    if (typeof body.value !== 'string' || !body.value) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta value' } });
    }
    // Nunca lleva saltos de línea: se hornea literal en .env.local en el export
    // (crm-env-contract-tiers) y una línea rota inyectaría variables no deseadas.
    if (/[\r\n]/.test(body.value)) {
      return res.status(422).json({ error: { code: 'invalid', message: 'value no puede contener saltos de línea' } });
    }

    // scope/envVarName SIEMPRE del catálogo — cualquier valor del body para esos
    // campos se ignora (el tipo del body ni siquiera los declara).
    const enc = encryptSecret(body.value);
    const row = await db.tenantSecret.upsert({
      where: { businessId_name: { businessId, name: slot.name } },
      create: {
        businessId, name: slot.name, scope: slot.scope,
        valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion,
        envVarName: slot.envVarName ?? null,
      },
      update: {
        scope: slot.scope,
        valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion,
        envVarName: slot.envVarName ?? null,
      },
    });

    // El valor NUNCA vuelve — ni cifrado ni en claro.
    res.status(200).json({
      name: slot.name, label: slot.label, scope: slot.scope, envVarName: slot.envVarName ?? null,
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
    const slot = findSecretSlot(req.params.name);
    if (!slot) return res.status(404).json({ error: { code: 'unknown_secret', message: 'Secreto no reconocido' } });

    const existing = await db.tenantSecret.findUnique({ where: { businessId_name: { businessId, name: slot.name } } });
    if (!existing) return res.status(404).json({ error: { code: 'secret_not_found', message: 'Secreto no encontrado' } });

    // Hard delete: sin tombstone (ver design.md §4) — un TenantSecret borrado es
    // indistinguible de uno que nunca existió, y no hay requisito de auditoría histórica.
    await db.tenantSecret.delete({ where: { businessId_name: { businessId, name: slot.name } } });
    res.status(200).json({ name: slot.name, configured: false });
  } catch (e) {
    console.error('[tenant-keys] error borrando secreto:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo borrar el secreto' } });
  }
}

/* ---------- POST /:businessId/secrets/:name/test ---------- */

// Rate limit por businessId:name — acota el "oráculo de validez de clave ajena"
// que representa este endpoint (llama al proveedor real con la clave tecleada).
const testSecretLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  bucket: 'secret-test',
  keyOf: (req) => `${req.params.businessId}:${req.params.name}`,
});

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
    if (!slot) return res.status(404).json({ error: { code: 'unknown_secret', message: 'Secreto no reconocido' } });

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
  router.post('/:businessId/secrets/:name/test', testSecretLimiter, (req, res) => testSecretHandler(db, req as AuthedRequest, res));
  return router;
}

export const tenantKeysRouter = buildTenantKeysRouter(defaultDb);
