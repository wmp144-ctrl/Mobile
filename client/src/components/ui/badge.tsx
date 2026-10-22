import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-ink-100 text-ink-700',
        success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
        warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60',
        danger: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/60',
        brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200/60',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
