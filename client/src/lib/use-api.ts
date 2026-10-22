import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './errors';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApiQuery<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): QueryState<T> & { reload: () => Promise<void> } {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const data = await loader();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: errorMessage(error) }));
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
