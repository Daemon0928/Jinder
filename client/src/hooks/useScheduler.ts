import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { SchedulerStatus } from '../api/types';

/** Scheduler status, polled every 10s while `active` (i.e. the tab is open). */
export function useScheduler(active: boolean) {
  const [status, setStatus] = useState<SchedulerStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getSchedulerStatus());
    } catch {
      // transient poll failure — keep last known state
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount; state updates land after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [active, refresh]);

  return { status, refresh };
}
