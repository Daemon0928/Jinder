import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { defaultProgress } from '../api/types';
import type { ScrapeProgress } from '../api/types';

/**
 * Scrape progress with 2s polling while a run is active.
 * `onTick` fires on every poll so callers can refresh dependent data.
 */
export function useScrapeStatus(onTick?: () => void) {
  const [progress, setProgress] = useState<ScrapeProgress>(defaultProgress);
  const isScraping = progress.isScraping;

  const check = useCallback(async () => {
    try {
      setProgress(await api.getScrapeStatus());
    } catch {
      // transient poll failure — keep last known state
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount; state updates land after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
  }, [check]);

  useEffect(() => {
    if (!isScraping) return;
    const interval = setInterval(() => {
      check();
      onTick?.();
    }, 2000);
    return () => clearInterval(interval);
  }, [isScraping, check, onTick]);

  return { progress, setProgress, isScraping, check };
}
