import { useState } from 'react';

export function useAsyncState() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async <T>(action: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, run };
}
