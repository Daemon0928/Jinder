import {
  matchJobsBatchWithGemini,
  matchJobWithGemini,
  getCVText,
} from '../matcher/gemini';
import { BatchMatchInput, BatchMatchResult } from '../types';

export interface MatchPipelineHooks<T> {
  /** Called before each batch is sent to Gemini. */
  onBatchStart?: (offset: number, batch: T[]) => void;
  /** Called when a whole-batch call fails and the individual fallback kicks in. */
  onBatchError?: (message: string) => void;
  /** Called when an individual fallback match fails for one item. */
  onItemError?: (item: T, message: string) => void;
  /** Called when the LLM returns an out-of-range or duplicate index. */
  onInvalidIndex?: (index: unknown) => void;
  /** Called (and awaited) for every successfully matched item, in order. */
  onResult: (item: T, result: BatchMatchResult) => Promise<void> | void;
}

/**
 * The shared matching pipeline: batch-match items against the CV with a
 * per-item fallback when the batch call fails, validating the LLM-returned
 * indexes before they are used. Used by both the scrape flow (insert) and
 * the reevaluation flow (update) — only the onResult persistence differs.
 */
export async function matchJobsInBatches<T>(
  items: T[],
  toInput: (item: T) => BatchMatchInput,
  batchSize: number,
  hooks: MatchPipelineHooks<T>,
): Promise<void> {
  // Read the CV once per run instead of once per Gemini call.
  const cvText = getCVText();

  for (let b = 0; b < items.length; b += batchSize) {
    const batch = items.slice(b, b + batchSize);
    hooks.onBatchStart?.(b, batch);

    const batchInput = batch.map(toInput);

    let matchResults: BatchMatchResult[] | null = null;
    try {
      matchResults = await matchJobsBatchWithGemini(batchInput, cvText);
      if (!matchResults || matchResults.length !== batch.length) {
        throw new Error('Batch matching failed or returned incomplete results');
      }
    } catch (batchErr: any) {
      hooks.onBatchError?.(batchErr.message);

      // Fallback to individual matching for this batch
      matchResults = [];
      for (let idx = 0; idx < batch.length; idx++) {
        const input = batchInput[idx];
        try {
          const result = await matchJobWithGemini(
            input.title,
            input.company,
            input.description,
            cvText,
          );
          if (result) {
            matchResults.push({ ...result, index: idx });
          }
        } catch (indivErr: any) {
          hooks.onItemError?.(batch[idx], indivErr.message);
        }
      }
    }

    // The index comes back from the LLM, so validate it before using it —
    // an out-of-range or duplicate index would attach scores to the wrong job.
    const consumedIndexes = new Set<number>();
    for (const res of matchResults) {
      if (
        !res ||
        !Number.isInteger(res.index) ||
        res.index < 0 ||
        res.index >= batch.length ||
        consumedIndexes.has(res.index)
      ) {
        hooks.onInvalidIndex?.(res?.index);
        continue;
      }
      consumedIndexes.add(res.index);
      await hooks.onResult(batch[res.index], res);
    }
  }
}
