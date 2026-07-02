import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { DialogProvider, useDialog } from '@/components/ui/dialog-provider';

afterEach(() => cleanup());
async function flush() { await act(async () => { await Promise.resolve(); }); }

function ConfirmHarness() {
  const dialog = useDialog();
  return (
    <button type="button" onClick={() => void dialog.confirm({ message: '¿Eliminar?', danger: true })}>
      Abrir confirm
    </button>
  );
}

// crm-modales-hover-unificados WU4 (AC5): dialog-provider renderiza su panel
// con las clases opera-modal-* (mismo chasis visual que el resto de modales).
describe('DialogProvider — chasis opera (WU4)', () => {
  it('el confirm renderiza con clases opera-modal-*', async () => {
    render(<DialogProvider><ConfirmHarness /></DialogProvider>);
    fireEvent.click(screen.getByText('Abrir confirm'));
    await flush();

    expect(document.querySelector('.opera-modal-backdrop')).toBeInTheDocument();
    expect(document.querySelector('.opera-modal')).toBeInTheDocument();
    expect(document.querySelector('.opera-modal-header')).toBeInTheDocument();
    expect(document.querySelector('.opera-modal-title')).toBeInTheDocument();
    expect(document.querySelector('.opera-modal-body')).toBeInTheDocument();
    expect(document.querySelector('.opera-modal-foot')).toBeInTheDocument();
    expect(screen.getByText('¿Eliminar?')).toBeInTheDocument();
  });

  it('confirmar resuelve true y cierra el diálogo', async () => {
    let resolved: boolean | undefined;
    function Harness() {
      const dialog = useDialog();
      return (
        <button type="button" onClick={() => { void dialog.confirm('¿Seguro?').then((v) => { resolved = v; }); }}>
          Abrir
        </button>
      );
    }
    render(<DialogProvider><Harness /></DialogProvider>);
    fireEvent.click(screen.getByText('Abrir'));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await flush();

    expect(resolved).toBe(true);
    expect(document.querySelector('.opera-modal')).toBeNull();
  });
});
