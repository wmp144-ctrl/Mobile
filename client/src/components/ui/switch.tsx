import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
  description?: string;
}

export function Switch({ checked, onCheckedChange, disabled, id, label, description }: SwitchProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      {label ? (
        <label htmlFor={id} className="cursor-pointer select-none">
          <span className="block text-sm font-medium text-ink-700">{label}</span>
          {description ? <span className="mt-0.5 block text-xs text-ink-500">{description}</span> : null}
        </label>
      ) : null}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-ink-300',
        )}
      >
        <span
          className={cn(
            'absolute h-5 w-5 rounded-full bg-surface shadow transition-all',
            checked ? 'start-0.5' : 'start-[22px]',
          )}
        />
      </button>
    </div>
  );
}
