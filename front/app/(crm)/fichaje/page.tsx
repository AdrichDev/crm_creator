'use client';
// crm-operaos WU6 (AC6): fichaje con selector de jornada (intensiva/partida) y máquina
// de estados — solo se puede fichar el SIGUIENTE paso válido; no se admite saltar pasos,
// repetirlos, ni fichar de más una vez completada la jornada del día. El modo se recuerda
// en localStorage y queda bloqueado en cuanto se ficha el primer paso del día.
import { useEffect, useState } from 'react';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm } from '@/lib/tenant-config-context';
import { PageHeader, Stat, Table, Td, Card, CardBody, Button } from '@/components/ui/primitives';
import { useCollection } from '@/lib/data/use-collection';
import { fichajes as seed, type Fichaje } from '@/lib/mock/data';
import { isApiEnabled } from '@/lib/api/client';
import { getFichajeHoy, ficharPaso, type WorkdayMode, type WorkdayStep } from '@/lib/api/fichaje';
import {
  nextAllowedStep, isJornadaCompleta, STEP_LABEL, MODE_LABEL,
  readLocalHoy, writeLocalHoy, readModoPref, writeModoPref, type FichajeHoyLocal,
} from '@/lib/fichaje-machine';
import { Play } from 'lucide-react';

interface HoyState {
  pasos: WorkdayStep[];
  siguientePaso: WorkdayStep | null;
  jornadaCompleta: boolean;
  bloqueada: boolean; // true en cuanto hay al menos un paso fichado hoy: ya no se cambia de modo.
}

export default function Page() {
  const term = useTerm('fichaje', 'Fichaje');
  const { items } = useCollection<Fichaje>('fichaje', seed); // histórico legacy — solo lectura, sin tocar
  const remote = isApiEnabled();

  const [modo, setModo] = useState<WorkdayMode>('intensiva');
  const [hoy, setHoy] = useState<HoyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (remote) {
        try {
          const r = await getFichajeHoy();
          if (!mounted) return;
          // El back solo devuelve siguientePaso/jornadaCompleta cuando ya hay modo en curso
          // (>=1 evento hoy); en jornada sin iniciar devuelve null. Derivamos el primer paso
          // del modo seleccionado para que "Fichar Entrada" aparezca al empezar el día.
          const pasos = r.eventos.map((e) => e.paso);
          const modoEfectivo = r.modo ?? readModoPref();
          setModo(modoEfectivo);
          setHoy({
            pasos,
            siguientePaso: nextAllowedStep(modoEfectivo, pasos),
            jornadaCompleta: isJornadaCompleta(modoEfectivo, pasos),
            bloqueada: r.modo !== null,
          });
        } catch (e) {
          if (mounted) setError(e instanceof Error ? e.message : 'No se pudo cargar el fichaje de hoy');
        }
      } else {
        const local = readLocalHoy();
        const m = local?.modo ?? readModoPref();
        const pasos = local?.pasos ?? [];
        if (mounted) {
          setModo(m);
          setHoy({ pasos, siguientePaso: nextAllowedStep(m, pasos), jornadaCompleta: isJornadaCompleta(m, pasos), bloqueada: !!local });
        }
      }
      if (mounted) setLoading(false);
    }
    void load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  function selectModo(m: WorkdayMode) {
    if (hoy?.bloqueada) return; // no se puede cambiar de modo a mitad de la jornada
    setModo(m);
    writeModoPref(m);
  }

  async function fichar() {
    if (!hoy || hoy.siguientePaso === null) return;
    setError(null);
    if (remote) {
      try {
        await ficharPaso(modo);
        const r = await getFichajeHoy();
        const pasos = r.eventos.map((e) => e.paso);
        setHoy({ pasos, siguientePaso: nextAllowedStep(modo, pasos), jornadaCompleta: isJornadaCompleta(modo, pasos), bloqueada: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al fichar');
      }
    } else {
      const pasos = [...hoy.pasos, hoy.siguientePaso];
      const state: FichajeHoyLocal = { fecha: new Date().toISOString().slice(0, 10), modo, pasos };
      writeLocalHoy(state);
      setHoy({ pasos, siguientePaso: nextAllowedStep(modo, pasos), jornadaCompleta: isJornadaCompleta(modo, pasos), bloqueada: true });
    }
  }

  const total = items.reduce((a, f) => a + Number(f.horas), 0);

  return (
    <ModuleGuard module="fichaje">
      <PageHeader title={term} subtitle="Jornada intensiva (entrada/salida) o partida (con comida): solo se permite el siguiente paso válido." />

      <Card className="mb-6"><CardBody>
        <p className="mb-3 text-sm text-gray-500">Tipo de jornada</p>
        <div className="mb-4 flex gap-6" role="radiogroup" aria-label="Tipo de jornada">
          {(['intensiva', 'partida'] as WorkdayMode[]).map((m) => (
            <label key={m} className={`flex items-center gap-2 text-sm ${hoy?.bloqueada && modo !== m ? 'opacity-40' : ''}`}>
              <input
                type="radio"
                name="jornada-modo"
                value={m}
                checked={modo === m}
                disabled={!!hoy?.bloqueada}
                onChange={() => selectModo(m)}
              />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Estado de hoy</p>
              <p className="text-xl font-semibold">
                {hoy?.jornadaCompleta
                  ? 'Jornada completa'
                  : hoy?.pasos.length
                    ? `Último: ${STEP_LABEL[hoy.pasos[hoy.pasos.length - 1]]}`
                    : 'No iniciada'}
              </p>
              {!!hoy?.pasos.length && (
                <p className="mt-1 text-xs text-gray-500">Hoy: {hoy.pasos.map((p) => STEP_LABEL[p]).join(' → ')}</p>
              )}
            </div>
            {hoy && !hoy.jornadaCompleta && hoy.siguientePaso && (
              <Button onClick={fichar}><Play className="h-4 w-4" /> Fichar {STEP_LABEL[hoy.siguientePaso]}</Button>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </CardBody></Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Registros históricos" value={items.length} />
        <Stat label="Horas totales" value={total.toFixed(1) + ' h'} />
        <Stat label="Media" value={(items.length ? total / items.length : 0).toFixed(1) + ' h'} />
      </div>
      <Table head={['Empleado', 'Fecha', 'Entrada', 'Salida', 'Horas']}>
        {items.map((f) => (
          <tr key={f.id}>
            <Td className="font-medium text-[var(--panel-text)]">{f.empleado}</Td>
            <Td>{f.fecha}</Td><Td>{f.entrada}</Td><Td>{f.salida || '—'}</Td><Td>{f.horas ? f.horas + ' h' : '—'}</Td>
          </tr>
        ))}
      </Table>
    </ModuleGuard>
  );
}
