'use client';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Card, CardBody, Button } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import { fichajes as seed, type Fichaje } from '@/lib/mock/data';
import { Play, Square } from 'lucide-react';

const ME = 'Tú';
const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

export default function Page() {
  const term = useTerm('fichaje', 'Fichaje');
  const { items, create, update } = useCollection<Fichaje>('fichaje', seed);
  const open = items.find((f) => f.empleado === ME && (!f.salida || f.salida === ''));

  function ficharEntrada() {
    create({ empleado: ME, fecha: new Date().toISOString().slice(0, 10), entrada: hhmm(new Date()), salida: '', horas: 0 } as Omit<Fichaje, 'id'>);
  }
  function ficharSalida() {
    if (!open) return;
    const [eh, em] = open.entrada.split(':').map(Number);
    const now = new Date();
    const mins = (now.getHours() * 60 + now.getMinutes()) - (eh * 60 + em);
    update(open.id, { salida: hhmm(now), horas: Math.max(0, Math.round((mins / 60) * 10) / 10) });
  }

  const total = items.reduce((a, f) => a + Number(f.horas), 0);

  return (
    <ModuleGuard module="fichaje">
      <PageHeader title={term} subtitle="Control de jornada e imputación de horas (heredado de ExceliaTrack)." />
      <Card className="mb-6"><CardBody className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Tu jornada de hoy</p>
          <p className="text-xl font-semibold">{open ? `En curso · entrada ${open.entrada}` : 'No iniciada'}</p>
        </div>
        {open
          ? <Button onClick={ficharSalida}><Square className="h-4 w-4" /> Fichar salida</Button>
          : <Button onClick={ficharEntrada}><Play className="h-4 w-4" /> Fichar entrada</Button>}
      </CardBody></Card>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Registros" value={items.length} />
        <Stat label="Horas totales" value={total.toFixed(1) + ' h'} />
        <Stat label="Media" value={(items.length ? total / items.length : 0).toFixed(1) + ' h'} />
      </div>
      <Table head={['Empleado', 'Fecha', 'Entrada', 'Salida', 'Horas']}>
        {items.map((f) => (
          <tr key={f.id} className="hover:bg-gray-50">
            <Td className="font-medium text-gray-900">{f.empleado}</Td>
            <Td>{f.fecha}</Td><Td>{f.entrada}</Td><Td>{f.salida || '—'}</Td><Td>{f.horas ? f.horas + ' h' : '—'}</Td>
          </tr>
        ))}
      </Table>
    </ModuleGuard>
  );
}
