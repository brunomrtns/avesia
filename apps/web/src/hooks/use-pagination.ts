import { useCallback, useState } from 'react';

interface UsePaginationOptions {
  initialPage?: number;
  pageSize?: number;
}

interface UsePaginationReturn {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetPage: () => void;
  totalPages: (total: number) => number;
}

/**
 * Shared pagination state for list pages.
 * Eliminates the duplicated page/pageSize/totalPages boilerplate
 * that was copy-pasted across SessionsPage and PatientsPage.
 */
export function usePagination({
  initialPage = 1,
  pageSize = 20,
}: UsePaginationOptions = {}): UsePaginationReturn {
  const [page, setPage] = useState(initialPage);

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const resetPage = useCallback(() => setPage(1), []);
  const totalPages = useCallback(
    (total: number) => Math.ceil(total / pageSize),
    [pageSize],
  );

  return { page, pageSize, setPage, nextPage, prevPage, resetPage, totalPages };
}
