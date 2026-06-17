'use client';
import { useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useTenantConfig } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Badge, Button, RowActions } from '@/components/ui/primitives';
import { EntityModal, type Field } from '@/components/ui/entity-modal';
import { Modal } from '@/components/ui/modal';
import { ModelEffortPicker } from '@/components/ai/model-effort-picker';
import { generateWithAI, AiBlockedError } from '@/lib/ai/usage-client';
import { useCollection } from '@/lib/data/use-collection';
import { campanas as seed, type Campana } from '@/lib/mock/data';
import { StructuredContent } from '@/components/stats/structured-content';
import { Send, Sparkles } from 'lucide-react';

const FIELDS: Field[] = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'canal', label: 'Canal', type: 'select', options: ['Email', 'SMS', 'WhatsApp'] },
  { name: 'estado', label: 'Estado', type: 'select', options: ['Borrador', 'Activa', 'Automática', 'Finalizada'] },
  { name: 'enviados', label: 'Enviados', type: 'number' },
  { name: 'aperturas', label: 'Aperturas' },
];

export default function Page() {
  const term = useTerm('marketing', 'Marketing');
  const { config } = useTenantConfig();
  const clienteId = config.business.clienteId ?? null;
  const { items, create, update, remove } = useCollection<Campana>('marketing', seed);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campana | null>(null);
  const tone = (s: string) => s === 'Activa' ? 'green' : s === 'Automática' ? 'blue' : 'gray';

  // Generación de plan de marketing con IA (tokens compartidos con agents-agency).
  const [aiOpen, setAiOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-5.4');
  const [effort, setEffort] = useState('medium');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState('');

  function onSubmit(v: Record<string, string | number>) {
    if (editing) update(editing.id, v as Partial<Campana>); else create({ aperturas: '—', ...v } as unknown as Omit<Campana, 'id'>);
    setOpen(false);
  }

  async function generarPlan() {
    setAiLoading(true); setAiError(''); setAiResult('');
    try {
      const out = await generateWithAI({ kind: 'marketing-plan', clientId: clienteId, model, effort, prompt });
      setAiResult(out.content);
      create({ nombre: prompt.trim() || 'Plan de marketing (IA)', canal: 'Email', estado: 'Borrador', enviados: 0, aperturas: '—' } as unknown as Omit<Campana, 'id'>);
    } catch (e) {
      setAiError(e instanceof AiBlockedError ? e.message : (e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <ModuleGuard module="marketing">
      <PageHeader title={term} subtitle="Campañas, fidelización y notificaciones a clientes."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setAiError(''); setAiResult(''); setAiOpen(true); }}><Sparkles className="h-4 w-4" /> Plan con IA</Button>
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Send className="h-4 w-4" /> Nueva campaña</Button>
          </div>
        } />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Campañas" value={items.length} />
        <Stat label="Activas" value={items.filter(c => c.estado === 'Activa').length} />
        <Stat label="Envíos" value={items.reduce((a, c) => a + Number(c.enviados), 0)} />
      </div>
      <Table head={['Campaña', 'Canal', 'Estado', 'Enviados', 'Aperturas', '']}>
        {items.map((c) => (
          <tr key={c.id}>
            <Td className="font-medium text-[var(--panel-text)]">{c.nombre}</Td>
            <Td><Badge>{c.canal}</Badge></Td>
            <Td><Badge tone={tone(c.estado)}>{c.estado}</Badge></Td>
            <Td>{c.enviados}</Td><Td>{c.aperturas}</Td>
            <Td><RowActions onEdit={() => { setEditing(c); setOpen(true); }} onDelete={() => { if (confirm('¿Eliminar?')) remove(c.id); }} /></Td>
          </tr>
        ))}
      </Table>
      <EntityModal open={open} title={editing ? 'Editar campaña' : 'Nueva campaña'} fields={FIELDS}
        initial={editing as unknown as Record<string, string | number> | null} onSubmit={onSubmit} onClose={() => setOpen(false)} />

      {/* Generar plan de marketing con IA */}
      <Modal open={aiOpen} title="Generar plan de marketing con IA" onClose={() => { if (!aiLoading) setAiOpen(false); }}
        footer={<>
          <Button variant="outline" onClick={() => setAiOpen(false)}>Cerrar</Button>
          <Button onClick={generarPlan} disabled={aiLoading}>{aiLoading ? 'Generando…' : 'Generar'}</Button>
        </>}>
        <div className="space-y-4">
          <div className="opera-field">
            <label className="opera-label">Objetivo de la campaña</label>
            <textarea className="opera-control" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="p. ej. Captar clientes nuevos con una promoción de bienvenida este mes." />
          </div>
          <ModelEffortPicker model={model} effort={effort} onModel={setModel} onEffort={setEffort} />
          {aiError && <p className="text-sm text-red-400">{aiError}</p>}
          {aiResult && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <StructuredContent content={aiResult} />
            </div>
          )}
        </div>
      </Modal>
    </ModuleGuard>
  );
}
