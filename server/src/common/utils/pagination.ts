export interface PageRequest {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function resolvePagination(page?: number, pageSize?: number): PageRequest {
  const safePage = Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : 1;
  const size = Number.isFinite(pageSize) && (pageSize as number) > 0 ? Math.floor(pageSize as number) : 20;
  const safeSize = Math.min(Math.max(size, 1), 100);
  return { page: safePage, pageSize: safeSize, offset: (safePage - 1) * safeSize };
}

export function buildPage<T>(items: T[], total: number, request: PageRequest): PageResult<T> {
  return {
    items,
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / request.pageSize),
  };
}
