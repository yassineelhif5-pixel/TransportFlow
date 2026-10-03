import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string; detail?: string }

interface ToastApi {
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback((kind: ToastKind, message: string, detail?: string) => {
    const id = ++seq;
    setItems((all) => [...all.slice(-3), { id, kind, message, detail }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4200);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (m, d) => push('success', m, d),
    error: (m, d) => push('error', m, d),
    info: (m, d) => push('info', m, d),
  }), [push]);

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-go-400" />,
    error: <AlertCircle className="h-5 w-5 text-stop" />,
    info: <Info className="h-5 w-5 text-cyan" />,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" role="status">
          {items.map((t) => (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border bg-surface px-4 py-3 shadow-lift',
                t.kind === 'error' ? 'border-stop/40' : t.kind === 'success' ? 'border-go/40' : 'border-cyan/40',
              )}
            >
              <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.message}</p>
                {t.detail && <p className="mt-0.5 text-xs text-muted">{t.detail}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Fermer la notification" className="-mr-1 text-subtle hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>.');
  return ctx;
}
