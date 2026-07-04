import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../src/lib/retry';

describe('withRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('notifies onRetry before each retry with the upcoming attempt number', async () => {
    const attempts: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    await withRetry(fn, {
      attempts: 3,
      baseDelayMs: 1,
      onRetry: (_err, attempt) => attempts.push(attempt),
    }).catch(() => {});
    expect(attempts).toEqual([2, 3]);
  });

  it('defaults to a single attempt under NODE_ENV=test', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const fn = vi.fn().mockRejectedValue(new Error('x'));
      await expect(withRetry(fn)).rejects.toThrow('x');
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});
