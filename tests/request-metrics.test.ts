import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateLiveTokens, requestMetrics } from '../shared/chat/request-metrics';
import type { UsageRecord } from '../shared/types/runtime-types';

const record = (timing: UsageRecord['timing'], usage: UsageRecord['usage'] = { outputTokens: 100 }): UsageRecord => ({
  id: 'usage',
  purpose: 'foreground',
  model: 'fixture',
  time: new Date().toISOString(),
  timing,
  usage,
});

test('TTFT is the first token and TPS uses the first-token to last-event window', () => {
  const metrics = requestMetrics(
    record({ firstEventMs: 20, firstTokenMs: 40, firstTextMs: 60, lastEventMs: 1040, totalMs: 1100 }),
  );
  assert.equal(metrics.ttftMs, 40);
  assert.equal(metrics.generationMs, 1000);
  assert.equal(metrics.tps, 100);
});

test('older records fall back to the first visible text', () => {
  const metrics = requestMetrics(
    record({ firstEventMs: 20, firstTextMs: 40, lastEventMs: 540, totalMs: 600 }, { outputTokens: 50 }),
  );
  assert.equal(metrics.ttftMs, 40);
  assert.equal(metrics.tps, 100);
});

test('missing usage keeps TTFT but has no TPS', () => {
  const metrics = requestMetrics(record({ firstTokenMs: 10, lastEventMs: 510, totalMs: 520 }, {}));
  assert.equal(metrics.ttftMs, 10);
  assert.equal(metrics.tps, undefined);
});

test('a non-streaming window is too short for a meaningful TPS', () => {
  const metrics = requestMetrics(record({ firstTokenMs: 10, lastEventMs: 30, totalMs: 40 }));
  assert.equal(metrics.ttftMs, 10);
  assert.equal(metrics.tps, undefined);
});

test('totalMs is the fallback when lastEventMs is absent', () => {
  const metrics = requestMetrics(record({ firstTokenMs: 100, totalMs: 1100 }));
  assert.equal(metrics.generationMs, 1000);
  assert.equal(metrics.tps, 100);
});

test('a record without timing has no metrics', () => {
  assert.deepEqual(requestMetrics(record(undefined)), {});
});

test('live token estimates mix CJK, emoji and Latin text', () => {
  assert.equal(estimateLiveTokens(''), 0);
  assert.equal(estimateLiveTokens('hello world'), 3);
  assert.equal(estimateLiveTokens('你好世界'), 3);
  assert.equal(estimateLiveTokens('你好 world'), 3);
  assert.equal(estimateLiveTokens('😀'), 1);
  assert.equal(estimateLiveTokens('a'.repeat(40)), 10);
});
