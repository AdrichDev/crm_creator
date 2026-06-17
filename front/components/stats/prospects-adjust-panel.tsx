'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import {
  WEBSITE_STATUS_LABELS,
  type Prospect, type WebsiteStatus,
} from '@/lib/stats/study-types';

// Panel de ajuste de prospección. Sin backend de Google Places, en el CRM la
// prospección se gestiona a mano: el usuario añade negocios de la zona. El
// alta se persiste vía onAdd en el padre (store mock/localStorage).

function newId() {
  return `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function ProspectsAdjustPanel({ onAdd }: { onAdd: (p: Prospect) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [address, setAddress] = useState('');
  const [websiteStatus, setWebsiteStatus] = useState<WebsiteStatus>('no_web');
  const [error, setError] = useState('');

  function submit() {
    if (!name.trim()) { setError('El nombre del negocio es obligatorio.'); return; }
    onAdd({
      id: newId(),
      name: name.trim(),
      sector: sector.trim() || undefined,
      address: address.trim() || undefined,
      websiteStatus,
      opportunityScore: null,
      status: 'new',
    });
    setName(''); setSector(''); setAddress(''); setWebsiteStatus('no_web');
    setError(''); setOpen(false);
  }

  return (
    <div className="mt-4 border-t border-[var(--line,rgba(255,255,255,0.06))] pt-4">
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>Añadir prospecto</Button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--panel-muted)]">
            Añade un negocio de la zona como prospecto. Luego podrás valorar su
            oportunidad y gestionar su estado en la tabla.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="opera-field">
              <label className="opera-label">Nombre del negocio *</label>
              <input className="opera-control" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="p. ej. Clínica Dental Sonrisa" />
            </div>
            <div className="opera-field">
              <label className="opera-label">Sector</label>
              <input className="opera-control" value={sector} onChange={(e) => setSector(e.target.value)}
                placeholder="p. ej. Salud" />
            </div>
            <div className="opera-field">
              <label className="opera-label">Dirección</label>
              <input className="opera-control" value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="p. ej. Calle Mayor 12" />
            </div>
            <div className="opera-field">
              <label className="opera-label">Estado web</label>
              <select className="opera-control" value={websiteStatus}
                onChange={(e) => setWebsiteStatus(e.target.value as WebsiteStatus)}>
                {(Object.entries(WEBSITE_STATUS_LABELS) as [WebsiteStatus, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={submit}>Añadir</Button>
            <Button variant="outline" onClick={() => { setOpen(false); setError(''); }}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
