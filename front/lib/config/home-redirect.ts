// front/lib/config/home-redirect.ts
//
// Resuelve a dónde debe redirigir la raíz `/` de la app.
//
// - App exportada (BAKED_TENANT_CONFIG != null): la consola/creador NO se
//   expone; la raíz va directa a la superficie del tenant (/panel).
// - Consola normal (dev/prod multi-proyecto): comportamiento intacto → /dashboard.
import { BAKED_TENANT_CONFIG } from './tenant-config';

export function resolveHomeRedirectPath(): '/panel' | '/dashboard' {
  return BAKED_TENANT_CONFIG ? '/panel' : '/dashboard';
}
