import { useCallback, useState } from 'react';

interface UseListFiltersOptions<T extends Record<string, string>> {
  initialFilters?: T;
}

interface UseListFiltersReturn<T extends Record<string, string>> {
  filters: T;
  setFilter: <K extends keyof T>(key: K, value: T[K]) => void;
  setFilters: (filters: Partial<T>) => void;
  resetFilters: () => void;
  /** Returns only non-empty filters for API query params. */
  activeFilters: Partial<T>;
}

/**
 * Shared filter state for list pages.
 * Centralizes the statusFilter/search/date patterns duplicated
 * across SessionsPage and PatientsPage.
 *
 * When any filter changes, the caller is responsible for resetting
 * the pagination page (via usePagination's resetPage).
 */
export function useListFilters<T extends Record<string, string>>({
  initialFilters = {} as T,
}: UseListFiltersOptions<T> = {}): UseListFiltersReturn<T> {
  const [filters, setFiltersState] = useState<T>(initialFilters);

  const setFilter = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setFiltersState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setFilters = useCallback((partial: Partial<T>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(initialFilters);
  }, [initialFilters]);

  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== '' && v != null),
  ) as Partial<T>;

  return { filters, setFilter, setFilters, resetFilters, activeFilters };
}
