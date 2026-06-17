'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { type CrmMode, loadMode, saveMode } from '@/lib/theme/crm-theme';

const NEXT: Record<CrmMode, CrmMode> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<CrmMode, string> = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };

export function ThemeToggle() {
  const [mode, setMode] = useState<CrmMode>('system');
  useEffect(() => setMode(loadMode()), []);

  function cycle() {
    const n = NEXT[mode];
    setMode(n);
    saveMode(n);
  }

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  return (
    <button onClick={cycle} className="btn btn-outline btn-sm" title={`Tema: ${LABEL[mode]} (clic para cambiar)`}>
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{LABEL[mode]}</span>
    </button>
  );
}
