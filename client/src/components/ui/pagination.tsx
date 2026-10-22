import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { formatNumber } from '@/lib/format';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, totalPages, onPageChange }: PaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 text-sm text-ink-500">
      <span>
        نمایش {formatNumber(from)} تا {formatNumber(to)} از {formatNumber(total)} مورد
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="صفحه قبل"
        >
          <ChevronRight className="size-4" />
          قبلی
        </Button>
        <span className="px-2 text-xs text-ink-500">
          صفحه {formatNumber(page)} از {formatNumber(Math.max(totalPages, 1))}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="صفحه بعد"
        >
          بعدی
          <ChevronLeft className="size-4" />
        </Button>
      </div>
    </div>
  );
}
