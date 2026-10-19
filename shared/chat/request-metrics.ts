import type { UsageRecord } from '../types/runtime-types';

export interface RequestMetrics {
  /** From the model request start to the first output token. */
  ttftMs?: number;
  /** Output tokens divided by the time from the first token to the last stream event. */
  tps?: number;
  outputTokens?: number;
  generationMs?: number;
}

/**
 * Metrics for one completed model request. Older records have no firstTokenMs; their first visible text is the
 * closest available TTFT. A generation window shorter than 50 ms (a non-streaming response) has no useful TPS.
 */
export function requestMetrics(record: UsageRecord): RequestMetrics {
  const timing = record.timing;
  if (!timing) return {};
  const ttftMs = timing.firstTokenMs ?? timing.firstTextMs,
    start = timing.firstTokenMs ?? timing.firstTextMs ?? timing.firstEventMs,
    end = timing.lastEventMs ?? timing.totalMs,
    outputTokens = record.usage?.outputTokens,
    generationMs = start !== undefined && end !== undefined && end - start >= 50 ? end - start : undefined;
  return {
    ...(ttftMs !== undefined ? { ttftMs } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(generationMs !== undefined ? { generationMs } : {}),
    ...(outputTokens !== undefined && outputTokens > 0 && generationMs !== undefined
      ? { tps: outputTokens / (generationMs / 1000) }
      : {}),
  };
}

const cjk = (code: number) =>
  (code >= 0x3040 && code <= 0x30ff) ||
  (code >= 0x3400 && code <= 0x4dbf) ||
  (code >= 0x4e00 && code <= 0x9fff) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xac00 && code <= 0xd7af);
const emoji = (code: number) => (code >= 0x1f000 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf);

/**
 * A cheap token estimate for the live indicator. It never replaces the provider's usage count: Chinese, Japanese
 * and Korean characters average about 1.5 per token, other text about 4 characters per token.
 */
export function estimateLiveTokens(text: string) {
  return text ? Math.max(1, Math.round(liveTokenWeight(text))) : 0;
}
/** The same estimate unrounded, so stream deltas can be added up. */
export function liveTokenWeight(text: string) {
  let han = 0,
    symbols = 0,
    other = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (cjk(code)) han++;
    else if (emoji(code)) symbols++;
    else other++;
  }
  return han / 1.5 + symbols + other / 4;
}
