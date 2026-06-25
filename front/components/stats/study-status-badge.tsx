'use client';
import { Badge } from '@/components/ui/primitives';

// Estado del estudio de mercado (modelo AA). Reusa el primitive Badge del CRM
// para respetar el tema claro/oscuro.

const TONE: Record<string, 'gray' | 'amber' | 'green' | 'red'> = {
  draft: 'gray',
  generating: 'amber',
  ready: 'green',
  error: 'red',
};

const LABEL: Record<string, string> = {
  draft: 'Borrador',
  generating: 'Generando…',
  ready: 'Listo',
  error: 'Error',
};

export function StudyStatusBadge({ status }: { status: string }) {
  return <Badge tone={TONE[status] ?? 'gray'}>{LABEL[status] ?? status}</Badge>;
}
