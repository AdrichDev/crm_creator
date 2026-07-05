'use client';
import { usePathname } from 'next/navigation';
import { useRole } from '@/lib/tenant-config-context';
import { TelegramWidget } from '@/components/crm/telegram-widget';

// Montaje global del widget Minion: el bot es de OperaOS / 3A Estudio (no de un
// proyecto concreto), así que vive en el root layout y aparece ya en /dashboard,
// antes de abrir ningún proyecto, y persiste dentro de cualquiera de ellos.
// Se oculta en pantallas donde no tiene sentido:
//  - Flujos de autenticación (login, registro, recuperación/seteo de contraseña).
//  - Portal del cliente final (/me) y rol 'cliente': el back protege /telegram con
//    staffOnly (403 para cliente) — renderizar el chip ahí sería un control que
//    siempre falla.
const EXCLUDED_PREFIXES = [
  '/login',
  '/registro',
  '/forgot-password',
  '/reset-password',
  '/set-password',
  '/verify-email',
  '/me',
];

export function MinionWidgetGlobal() {
  const pathname = usePathname() ?? '';
  const { role } = useRole();
  const excluded = EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (excluded || role === 'cliente') return null;
  return <TelegramWidget />;
}
