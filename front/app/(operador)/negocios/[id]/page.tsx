'use client';
// Detalle de negocio en operaOS — carril de OPERADOR (crm-tenant-lifecycle-gate WU5).
//
// Client component (useParams) igual que el resto de páginas `[id]` del repo. Es
// una vista interna de operador: en el export nativo de tenant (exe/apk/ipa) el
// directorio dinámico `[id]` se elimina por export-compat.ts, así que NO necesita
// generateStaticParams y nunca viaja al artefacto del tenant.
import { useParams } from 'next/navigation';
import { LifecycleControl } from './lifecycle-control';

export default function OperatorBusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const businessId = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!businessId) return null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-xl font-bold text-neutral-900">Negocio</h1>
      <LifecycleControl businessId={businessId} />
    </main>
  );
}
