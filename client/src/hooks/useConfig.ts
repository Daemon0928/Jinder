import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AppConfig } from '../api/types';

const emptyConfig: AppConfig = {
  cv: '',
  keywords: [],
  excludeKeywords: [],
  cvFilename: null,
  cvSummary: null,
  discordWebhook: '',
  discordWebhookSet: false,
  locations: [],
  companies: [],
  batchSize: 10,
};

/** Editable app configuration backed by GET/POST /api/config. */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig>(emptyConfig);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getConfig();
      setConfig({
        ...emptyConfig,
        ...data,
        keywords: data.keywords || [],
        excludeKeywords: data.excludeKeywords || [],
        locations: data.locations || [],
        companies: data.companies || [],
        batchSize: data.batchSize || 10,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load configuration');
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount; state updates land after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const update = useCallback((partial: Partial<AppConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  /** Persist the current state; throws ApiError on failure. */
  const save = useCallback(async (current: AppConfig) => {
    await api.saveConfig({
      cv: current.cv,
      keywords: current.keywords,
      excludeKeywords: current.excludeKeywords,
      discordWebhook: current.discordWebhook,
      locations: current.locations,
      companies: current.companies,
      batchSize: current.batchSize,
    });
  }, []);

  return { config, update, save, refresh, error };
}
