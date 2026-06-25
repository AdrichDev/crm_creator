import { redirect } from 'next/navigation';

// La consola/dashboard vive en /dashboard. La raíz redirige allí.
// El flujo por tenant generado (→ /panel o /login) lo resuelve la propia
// página de dashboard una vez montada.
export default function Home() {
  redirect('/dashboard');
}
