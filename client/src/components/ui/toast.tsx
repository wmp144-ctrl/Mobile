import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      counter += 1;
      const id = `toast-${counter}`;
      setItems((previous) => [...previous, { id, kind, message }]);
      window.setTimeout(() => remove(id), 5000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed bottom-4 left-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
        role="region"
        aria-label="پیام‌های سامانه"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg shadow-ink-900/10 animate-fade-up',
              item.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              item.kind === 'error' && 'border-rose-200 bg-rose-50 text-rose-800',
              item.kind === 'info' && 'border-brand-200 bg-brand-50 text-brand-800',
            )}
          >
            {item.kind === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : null}
            {item.kind === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0" /> : null}
            {item.kind === 'info' ? <Info className="mt-0.5 size-4 shrink-0" /> : null}
            <span className="flex-1 leading-6">{item.message}</span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded p-0.5 opacity-60 transition hover:opacity-100"
              aria-label="بستن پیام"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
