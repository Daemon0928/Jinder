export interface RetryOptions {
  /** Total attempts including the first one. */
  attempts?: number;
  /** Base delay before the first retry; doubles each attempt. */
  baseDelayMs?: number;
  /** Called before each retry with the error and the upcoming attempt number. */
  onRetry?: (err: unknown, attempt: number) => void;
}

/**
 * Run `fn`, retrying on failure with exponential backoff + jitter.
 * Throws the last error once attempts are exhausted.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts) break;
      opts.onRetry?.(err, attempt + 1);
      const delay = baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
