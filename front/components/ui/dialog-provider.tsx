'use client';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Button } from './primitives';

interface DialogOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Resolve = (v: boolean) => void;

interface State {
  opts: DialogOpts;
  resolve: Resolve;
  mode: 'confirm' | 'alert';
}

interface DialogCtx {
  confirm: (opts: DialogOpts | string) => Promise<boolean>;
  alert: (message: string, title?: string) => Promise<void>;
}

const Ctx = createContext<DialogCtx | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback((opts: DialogOpts | string): Promise<boolean> => {
    const normalized = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>((resolve) =>
      setState({ opts: normalized, resolve, mode: 'confirm' }),
    );
  }, []);

  const alert = useCallback((message: string, title?: string): Promise<void> => {
    return new Promise<void>((resolve) =>
      setState({
        opts: { message, title },
        resolve: (_v: boolean) => resolve(),
        mode: 'alert',
      }),
    );
  }, []);

  function close(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <Ctx.Provider value={{ confirm, alert }}>
      {children}
      {state && (
        <div className="opera-modal-backdrop">
          <div className="opera-modal w-full max-w-sm">
            <div className="opera-modal-header">
              <h3 className="opera-modal-title">
                {state.opts.title ?? (state.mode === 'alert' ? 'Aviso' : 'Confirmar')}
              </h3>
            </div>
            <div className="opera-modal-body">
              <p className="text-[var(--panel-muted)] text-sm leading-relaxed">
                {state.opts.message}
              </p>
            </div>
            <div className="opera-modal-foot">
              {state.mode === 'confirm' && (
                <Button variant="ghost" onClick={() => close(false)}>
                  {state.opts.cancelLabel ?? 'Cancelar'}
                </Button>
              )}
              <Button
                variant={state.opts.danger ? 'outline' : 'primary'}
                onClick={() => close(true)}
                className={state.opts.danger ? 'border-red-500 text-red-400 hover:bg-red-500/10' : undefined}
              >
                {state.opts.confirmLabel ?? (state.mode === 'alert' ? 'Aceptar' : 'Confirmar')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useDialog(): DialogCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDialog debe usarse dentro de DialogProvider');
  return ctx;
}
