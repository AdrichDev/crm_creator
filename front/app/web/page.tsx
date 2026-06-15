'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// El módulo de web pública se ha retirado: la web/landing se construye en
// agents-agency. Esta ruta queda redirigida a la consola.
export default function WebRetirada() {
  const router = useRouter();
  useEffect(() => { router.replace('/'); }, [router]);
  return null;
}
