'use client';
import type { ReactNode } from 'react';

export function Modal({ open, title, onClose, children, footer }:
  { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="opera-modal-backdrop" onMouseDown={onClose}>
      <div className="opera-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="opera-modal-header">
          <h3 className="opera-modal-title">{title}</h3>
          <button onClick={onClose} className="opera-modal-close" aria-label="Cerrar">&times;</button>
        </div>
        <div className="opera-modal-body">{children}</div>
        {footer && <div className="opera-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
