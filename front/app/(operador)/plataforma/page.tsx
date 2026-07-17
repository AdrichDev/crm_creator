'use client';
// Vista admin-PLATAFORMA en operaOS — carril de OPERADOR (crm-central-oauth-admin-config).
//
// Client component (igual que el resto del carril (operador)). La autorización real la
// impone el proxy server-side (`/api/platform/oauth-config`, isAuthedOperator): aunque
// la página renderice, las llamadas de datos devuelven 401 a quien no sea operador. En
// el export nativo de tenant (exe/apk/ipa) `app/api` y este carril se eliminan.
import { PlatformOAuthPanel } from '@/components/config/platform-oauth-panel';

export default function PlatformAdminPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-xl font-bold text-[var(--panel-text)]">Plataforma</h1>
      <PlatformOAuthPanel />
    </main>
  );
}
