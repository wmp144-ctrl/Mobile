import { Loader2, Wrench } from 'lucide-react';

export function FullScreenLoader({ label = 'در حال بارگذاری سامانه...' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/20">
          <Wrench className="size-6" />
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </div>
      </div>
    </div>
  );
}
