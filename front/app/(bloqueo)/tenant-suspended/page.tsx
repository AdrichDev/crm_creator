// Ruta full-screen de bloqueo del tenant (crm-tenant-lifecycle-gate WU4).
// Superficie navegable directa (además del overlay global que dispara el interceptor).
// El grupo (bloqueo) la aísla del layout del panel: aquí no hay chrome operable.
import { BlockedScreen } from '@/components/tenant/blocked-screen';

export const metadata = {
  title: 'Acceso suspendido · OperaOS',
};

export default function TenantSuspendedPage() {
  return <BlockedScreen variant="suspended" />;
}
