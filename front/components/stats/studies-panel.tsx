'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Table, Td, Card, CardBody } from '@/components/ui/primitives';
import { StarRating } from '@/components/stats/star-rating';
import { StudyStatusBadge } from '@/components/stats/study-status-badge';
import { Eye } from 'lucide-react';
import { listStudies, type StudySummary } from '@/lib/api/market-studies';

// Lista REAL de estudios de mercado (modelo AA, vía proxy del CRM). Clona la
// StudiesPanel de agents-agency: listar, ver (no borrar — deshabilitado en CRM).

export function StudiesPanel() {
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStudies = useCallback(() => {
    setLoading(true);
    setError(null);
    listStudies()
      .then((data) => { setStudies(data); setLoading(false); })
      .catch((e) => { setError(e?.message ?? 'Error al cargar estudios'); setLoading(false); });
  }, []);

  useEffect(() => { fetchStudies(); }, [fetchStudies]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--panel-muted)]">
        Estudios de mercado generados con IA, anclados a datos reales del negocio.
      </p>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="animate-pulse text-sm text-[var(--panel-muted)]">Cargando estudios…</span>
        </div>
      )}

      {error && (
        <Card><CardBody className="text-sm text-red-400">{error}</CardBody></Card>
      )}

      {!loading && !error && studies.length === 0 && (
        <Card>
          <CardBody className="empty-state">
            <p className="mb-3 text-sm text-[var(--panel-muted)]">No hay estudios de mercado todavía.</p>
            <Link href="/estadisticas/estudios/nuevo" className="btn btn-primary">Crear primer estudio</Link>
          </CardBody>
        </Card>
      )}

      {!loading && studies.length > 0 && (
        <Table head={['Nombre', 'Fecha', 'Éxito', 'Estado', '']}>
          {studies.map((study) => (
            <tr key={study.id}>
              <Td className="max-w-[240px] truncate font-medium text-[var(--panel-text)]">{study.title}</Td>
              <Td>
                {new Date(study.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' })}
              </Td>
              <Td><StarRating value={study.successScore ?? null} /></Td>
              <Td><StudyStatusBadge status={study.status} /></Td>
              <Td>
                <div className="flex justify-end">
                  <Link href={`/estadisticas/estudios/${study.id}`} className="row-action edit" title="Abrir">
                    <Eye className="h-4 w-4" />
                  </Link>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
