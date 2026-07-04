import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the matcher so the pipeline can be tested without a database or API.
vi.mock('../../src/matcher/gemini', () => ({
  matchJobsBatchWithGemini: vi.fn(),
  matchJobWithGemini: vi.fn(),
  getCVText: vi.fn(() => 'mock cv text'),
}));

import { matchJobsInBatches } from '../../src/matching/pipeline';
import { matchJobsBatchWithGemini, matchJobWithGemini } from '../../src/matcher/gemini';

const batchMock = vi.mocked(matchJobsBatchWithGemini);
const singleMock = vi.mocked(matchJobWithGemini);

function result(index: number, score = 50) {
  return {
    index,
    matchScore: score,
    pros: [],
    cons: [],
    justification: 'j',
    parsedJob: { title: 't', company: 'c', location: 'l', description: 'd', techStack: [], salary: '' },
  };
}

const items = [
  { id: 'a', title: 'A', company: 'CoA', description: 'da' },
  { id: 'b', title: 'B', company: 'CoB', description: 'db' },
  { id: 'c', title: 'C', company: 'CoC', description: 'dc' },
];
const toInput = (i: (typeof items)[number]) => ({ title: i.title, company: i.company, description: i.description });

describe('matchJobsInBatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers results matched to the right items', async () => {
    batchMock.mockResolvedValue([result(2), result(0), result(1)]);
    const seen: string[] = [];
    await matchJobsInBatches(items, toInput, 10, {
      onResult: (item) => {
        seen.push(item.id);
      },
    });
    expect(seen).toEqual(['c', 'a', 'b']);
  });

  it('skips out-of-range, duplicate and non-integer indexes from the LLM', async () => {
    batchMock.mockResolvedValue([
      result(0),
      result(0), // duplicate
      result(7), // out of range
      result(-1), // negative
      result(1.5 as unknown as number), // non-integer
    ] as any);
    // length mismatch triggers fallback — so pad to exactly items.length
    batchMock.mockResolvedValue([result(0), result(0), result(7)] as any);

    const seen: string[] = [];
    const invalid: unknown[] = [];
    await matchJobsInBatches(items, toInput, 10, {
      onResult: (item) => {
        seen.push(item.id);
      },
      onInvalidIndex: (idx) => invalid.push(idx),
    });
    expect(seen).toEqual(['a']);
    expect(invalid).toEqual([0, 7]);
  });

  it('falls back to individual matching when the batch call fails', async () => {
    batchMock.mockRejectedValue(new Error('rate limited'));
    singleMock.mockImplementation(async (title) => (title === 'B' ? null : result(0, 60)));

    const seen: string[] = [];
    const batchErrors: string[] = [];
    await matchJobsInBatches(items, toInput, 10, {
      onResult: (item) => {
        seen.push(item.id);
      },
      onBatchError: (msg) => batchErrors.push(msg),
    });

    expect(batchErrors).toEqual(['rate limited']);
    expect(singleMock).toHaveBeenCalledTimes(3);
    // B returned null so only A and C are delivered
    expect(seen).toEqual(['a', 'c']);
  });

  it('falls back when the batch returns an incomplete result set', async () => {
    batchMock.mockResolvedValue([result(0)] as any); // 1 result for 3 items
    singleMock.mockResolvedValue(result(0, 70));

    const seen: string[] = [];
    await matchJobsInBatches(items, toInput, 10, {
      onResult: (item) => {
        seen.push(item.id);
      },
    });
    expect(singleMock).toHaveBeenCalledTimes(3);
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('splits items into batches of the requested size', async () => {
    batchMock.mockImplementation(async (batch) => batch.map((_, idx) => result(idx)));
    const offsets: number[] = [];
    await matchJobsInBatches(items, toInput, 2, {
      onBatchStart: (offset) => offsets.push(offset),
      onResult: () => {},
    });
    expect(offsets).toEqual([0, 2]);
    expect(batchMock).toHaveBeenCalledTimes(2);
    expect(batchMock.mock.calls[0][0]).toHaveLength(2);
    expect(batchMock.mock.calls[1][0]).toHaveLength(1);
  });
});
