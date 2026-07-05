import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

interface UseListQueryOptions<F extends Record<string, string>> {
  /** Filter keys to track in the URL search params (e.g. ['search', 'status', 'from', 'to']). */
  filterKeys: readonly (keyof F)[];
  /** Default filter values when not present in URL. */
  defaultFilters?: Partial<F>;
  /** Page size (items per page). Default 20. */
  pageSize?: number;
}

interface UseListQueryReturn<F extends Record<string, string>> {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetPage: () => void;
  totalPages: (total: number) => number;

  /** All filters (including empty strings for unset ones). */
  filters: F;
  /** Set a single filter. Resets page to 1. */
  setFilter: <K extends keyof F>(key: K, value: F[K]) => void;
  /** Set multiple filters at once. Resets page to 1. */
  setFilters: (filters: Partial<F>) => void;
  /** Clear all filters. Resets page to 1. */
  resetFilters: () => void;
  /** Only non-empty filters, ready for API query params. */
  activeFilters: Partial<F>;
}

/**
 * Unified list query state backed by URL search params.
 *
 * Pagination (`?page=N`) and filters (`?status=ACTIVE&search=foo`) are
 * stored in the URL, so state survives:
 * - Navigation away and back (component remount)
 * - Page refresh
 * - Browser back/forward
 * - URL sharing / bookmarking
 *
 * Setting any filter automatically resets the page to 1.
 */
export function useListQuery<F extends Record<string, string>>({
  filterKeys,
  defaultFilters = {} as Partial<F>,
  pageSize = 20,
}: UseListQueryOptions<F>): UseListQueryReturn<F> {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Pagination ──────────────────────────────────────────────
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') {
            next.delete(key);
          } else {
            next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (p: number) => {
      updateParam('page', p > 1 ? String(p) : null);
    },
    [updateParam],
  );

  const nextPage = useCallback(() => setPage(page + 1), [page, setPage]);
  const prevPage = useCallback(() => setPage(Math.max(1, page - 1)), [page, setPage]);
  const resetPage = useCallback(() => updateParam('page', null), [updateParam]);
  const totalPages = useCallback(
    (total: number) => Math.ceil(total / pageSize),
    [pageSize],
  );

  // ── Filters ─────────────────────────────────────────────────
  const filters = useMemo(() => {
    const result = {} as F;
    for (const key of filterKeys) {
      const urlValue = searchParams.get(key as string);
      result[key] = (urlValue ?? defaultFilters[key] ?? '') as F[keyof F];
    }
    return result;
  }, [searchParams, filterKeys, defaultFilters]);

  const setFilter = useCallback(
    <K extends keyof F>(key: K, value: F[K]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === '' || value == null) {
            next.delete(key as string);
          } else {
            next.set(key as string, value as string);
          }
          // Reset page when a filter changes
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setFilters = useCallback(
    (partial: Partial<F>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(partial)) {
            if (value === '' || value == null) {
              next.delete(key);
            } else {
              next.set(key, value as string);
            }
          }
          // Reset page when filters change
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of filterKeys) {
          next.delete(key as string);
        }
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, filterKeys]);

  const activeFilters = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v != null),
      ) as Partial<F>,
    [filters],
  );

  return {
    page,
    pageSize,
    setPage,
    nextPage,
    prevPage,
    resetPage,
    totalPages,
    filters,
    setFilter,
    setFilters,
    resetFilters,
    activeFilters,
  };
}
