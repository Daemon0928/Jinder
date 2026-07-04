import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Job } from '../api/types';

/**
 * Jobs list with server-side status/score filters.
 * `loading` is true only until the first successful load so background
 * refreshes don't flash the UI; `error` carries the last failure message.
 */
export function useJobs(statusFilter: string, minScore: number) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getJobs({ status: statusFilter, minScore });
      setJobs(data);
      setError(null);
      loadedOnce.current = true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load jobs');
    } finally {
      // Loading is only shown until the first load completes; later filter
      // changes refresh in the background without flashing the UI.
      setLoading(false);
    }
  }, [statusFilter, minScore]);

  useEffect(() => {
    // Fetch-on-mount/filter-change; state updates land after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return { jobs, loading, error, refresh };
}
