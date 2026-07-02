'use client';
// Panel "Mi Cuenta" — agrupa datos de perfil + cambio de contraseña.
// MyAccountForm es la fuente de datos; comunica el email al ChangePasswordForm
// mediante onProfileChange para el flujo "olvidé mi contraseña".
import { useState } from 'react';
import { MyAccountForm } from './my-account-form';
import { ChangePasswordForm } from './change-password-form';
import { CalendarSection } from './calendar-section';
import type { AuthUserProfile } from '@/lib/api/profile';

export function MyAccountPanel() {
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  function handleProfileChange(profile: AuthUserProfile) {
    setUserEmail(profile.email);
  }

  return (
    <div className="space-y-6">
      <MyAccountForm onProfileChange={handleProfileChange} />
      <ChangePasswordForm userEmail={userEmail} />
      <CalendarSection />
    </div>
  );
}
