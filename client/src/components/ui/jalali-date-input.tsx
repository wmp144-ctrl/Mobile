import { useState } from 'react';
import { Input } from './input';
import { parseJalali } from '@/lib/jalali';
import { cn } from '@/lib/utils';

interface JalaliDateInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  ariaLabel?: string;
}

export function JalaliDateInput({
  value,
  onChange,
  placeholder = '۱۴۰۵/۰۷/۳۰',
  id,
  className,
  ariaLabel,
}: JalaliDateInputProps) {
  const [touched, setTouched] = useState(false);
  const invalid = touched && value.trim().length > 0 && !parseJalali(value);

  return (
    <div>
      <Input
        id={id}
        dir="ltr"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn('text-center tracking-widest', invalid && 'border-rose-400', className)}
      />
      {invalid ? (
        <p className="mt-1 text-xs text-rose-600">تاریخ شمسی معتبر نیست (نمونه: ۱۴۰۵/۰۷/۳۰).</p>
      ) : null}
    </div>
  );
}
