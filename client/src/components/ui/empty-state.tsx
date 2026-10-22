import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div>
        <p className="font-medium text-ink-800">{title}</p>
        {description ? <p className="mt-1 text-sm leading-6 text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
