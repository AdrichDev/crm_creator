import { redirect } from 'next/navigation';
import { resolveHomeRedirectPath } from '@/lib/config/home-redirect';

// La consola/dashboard vive en /dashboard. La raíz redirige allí.
// App exportada con tenant horneado (BAKED_TENANT_CONFIG): la consola/creador
// NO se expone — la raíz va directa a /panel (la superficie del tenant).
export default function Home() {
  redirect(resolveHomeRedirectPath());
}
