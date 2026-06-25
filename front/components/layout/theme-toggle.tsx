'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { type CrmMode, loadMode, saveMode } from '@/lib/theme/crm-theme';

const NEXT: Record<CrmMode, CrmMode> = { light: 'dark', dark: 'light' };
const LABEL: Record<CrmMode, string> = { light: 'Claro', dark: 'Oscuro' };

export function ThemeToggle() {
  const [mode, setMode] = useState<CrmMode>('dark');
  useEffect(() => setMode(loadMode()), []);

  function toggle() {
    const n = NEXT[mode];
    setMode(n);
    saveMode(n);
  }

  const Icon = mode === 'light' ? Sun : Moon;
  return (
    <button onClick={toggle} className="btn btn-outline btn-sm" title={`Tema: ${LABEL[mode]} (clic para cambiar)`}>
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{LABEL[mode]}</span>
    </button>
  );
}
