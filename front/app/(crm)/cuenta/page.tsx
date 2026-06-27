'use client';
// Página "Mi Cuenta" — accesible a todos los roles desde la ruta /cuenta.
// Permite editar nombre/apellido/teléfono y cambiar la contraseña.
// No requiere gating por rol; cualquier usuario autenticado puede acceder.
import { MyAccountPanel } from '@/components/config/my-account-panel';
import { PageHeader } from '@/components/ui/primitives';

export default function CuentaPage() {
  return (
    <>
      <PageHeader
        title="Mi Cuenta"
        subtitle="Edita tus datos personales y tu contraseña."
      />
      <MyAccountPanel />
    </>
  );
}
