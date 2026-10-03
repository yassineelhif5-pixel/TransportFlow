import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/apiClient';

/** Valeur différée (recherche à la frappe). */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  setData: (d: T | null) => void;
}

/**
 * Charge une ressource via l'API avec gestion loading / erreur / annulation.
 * `deps` déclenche un rechargement ; `fetcher` reçoit un AbortSignal.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcherRef.current(controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setData(d);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Une erreur est survenue.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}

/** État d'une liste paginée/triée/filtrée, synchronisable avec la barre de filtres. */
export function useListState<F extends object>(initial: F & { page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }) {
  const [state, setState] = useState(initial);
  const update = useCallback((patch: Partial<typeof initial>, resetPage = true) => {
    setState((s) => ({ ...s, ...patch, ...(resetPage && !('page' in patch) ? { page: 1 } : {}) }));
  }, []);
  const toggleSort = useCallback((key: string) => {
    setState((s) => ({
      ...s,
      sortBy: key,
      sortDir: s.sortBy === key && s.sortDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  }, []);
  return { state, update, toggleSort, setState };
}

/** Exécute une action asynchrone (soumission, suppression…) avec indicateur de chargement. */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await action(...args);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Une erreur est survenue.');
      setError(err);
      throw err;
    } finally {
      setPending(false);
    }
  }, [action]);
  return { run, pending, error, setError };
}
