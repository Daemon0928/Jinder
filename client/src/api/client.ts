import type {
  Job,
  AppConfig,
  ScrapeProgress,
  SchedulerStatus,
  CvUploadResult,
  JobStatus,
} from './types';

/** Error carrying the server-provided message when one exists. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Network error — is the backend running?');
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body (or empty) — leave as null
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : `Request failed (HTTP ${res.status})`;
    throw new ApiError(res.status, message);
  }

  return body as T;
}

function postJson<T>(url: string, payload: unknown, method = 'POST'): Promise<T> {
  return request<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export const api = {
  getJobs(filters: { status?: string; minScore?: number } = {}): Promise<Job[]> {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.minScore && filters.minScore > 0) params.append('minScore', String(filters.minScore));
    const qs = params.toString();
    return request<Job[]>(`/api/jobs${qs ? `?${qs}` : ''}`);
  },

  updateJobStatus(id: number, status: JobStatus) {
    return postJson<{ success: boolean }>(`/api/jobs/${id}`, { status }, 'PATCH');
  },

  deleteJob(id: number) {
    return request<{ success: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' });
  },

  getConfig(): Promise<AppConfig> {
    return request<AppConfig>('/api/config');
  },

  saveConfig(config: Partial<AppConfig>) {
    return postJson<{ success: boolean }>('/api/config', config);
  },

  uploadCv(file: File): Promise<CvUploadResult> {
    const formData = new FormData();
    formData.append('cv', file);
    return request<CvUploadResult>('/api/config/cv-upload', { method: 'POST', body: formData });
  },

  startScrape() {
    return request<{ status: string }>('/api/scrape', { method: 'POST' });
  },

  getScrapeStatus(): Promise<ScrapeProgress> {
    return request<ScrapeProgress>('/api/scrape/status');
  },

  startReevaluation(batchSize: number) {
    return postJson<{ status: string }>('/api/scrape/reevaluate', { batchSize });
  },

  getSchedulerStatus(): Promise<SchedulerStatus> {
    return request<SchedulerStatus>('/api/scheduler/status');
  },

  setSchedulerEnabled(enabled: boolean) {
    return request<{ success: boolean }>(`/api/scheduler/${enabled ? 'start' : 'stop'}`, {
      method: 'POST',
    });
  },

  updateSchedulerInterval(intervalHours: number) {
    return postJson<{ success: boolean }>('/api/scheduler/config', { intervalHours }, 'PUT');
  },
};
