import { useCallback, useEffect, useRef, useState } from 'react';

/** Carrega dados e expõe recarregar. Ignora respostas que chegam fora de ordem. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const run = useCallback(
    async (mode: 'load' | 'refresh') => {
      const id = ++seq.current;
      mode === 'refresh' ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const r = await fn();
        if (id === seq.current) setData(r);
      } catch (e) {
        if (id === seq.current) setError((e as Error).message || 'Verifique sua conexão.');
      } finally {
        if (id === seq.current) (setLoading(false), setRefreshing(false));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    run('load');
  }, [run]);

  return { data, error, loading, refreshing, reload: () => run('load'), refresh: () => run('refresh'), setData };
}
