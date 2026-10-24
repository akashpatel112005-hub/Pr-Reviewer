import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Loads data from the API. Refreshes quietly in the background when refreshMs is set.
export function useFetch(path, { refreshMs = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    api(path)
      .then((data) => {
        if (!cancelled) setState({ data, error: '', loading: false });
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, error: err.message, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const id = setInterval(reload, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, reload]);

  return { ...state, reload };
}