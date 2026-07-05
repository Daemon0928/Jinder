import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DigestStatus } from '../api/types';

/** Digest status, fetched when `active` (the settings tab is open). */
export function useDigest(active: boolean) {
  const [status, setStatus] = useState<DigestStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getDigestStatus());
    } catch {
      // transient failure — keep last known state
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [active, refresh]);

  return { status, refresh };
}
