'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader } from '@/components/ui/primitives';
import { StudiesPanel } from '@/components/stats/studies-panel';

export default function Page() {
  const term = useTerm('estudios-mercado', 'Estudios de Mercado');

  return (
    <ModuleGuard module="estudios-mercado">
      <PageHeader
        title={term}
        action={
          <Link href="/estudios-mercado/nuevo" className="btn btn-primary">
            <Sparkles className="h-4 w-4" /> Nuevo estudio con IA
          </Link>
        }
      />

      <div className="space-y-6">
        <StudiesPanel />
      </div>
    </ModuleGuard>
  );
}
