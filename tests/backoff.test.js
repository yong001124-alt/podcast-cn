// P5 Groq 退避重试 —— 纯函数单测。运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/text-utils.js';

test('parseRetryAfterMs: 纯秒数 → 毫秒', () => {
  assert.equal(parseRetryAfterMs('3'), 3000);
  assert.equal(parseRetryAfterMs('0'), 0);
});

test('parseRetryAfterMs: HTTP-date → 相对当前的毫秒', () => {
  const now = 1_000_000; // 秒对齐，toUTCString 不丢精度
  const date = new Date(now + 5000).toUTCString(); // 5 秒后
  assert.equal(parseRetryAfterMs(date, now), 5000);
});

test('parseRetryAfterMs: 过去的时间 → 0（不为负）', () => {
  const now = 2_000_000;
  const past = new Date(now - 10000).toUTCString();
  assert.equal(parseRetryAfterMs(past, now), 0);
});

test('parseRetryAfterMs: 缺失/非法 → null', () => {
  assert.equal(parseRetryAfterMs(null), null);
  assert.equal(parseRetryAfterMs('soon'), null);
});

test('backoffDelayMs: 无 Retry-After 时指数退避', () => {
  assert.equal(backoffDelayMs(1, null, { base: 1000 }), 1000);
  assert.equal(backoffDelayMs(2, null, { base: 1000 }), 2000);
  assert.equal(backoffDelayMs(3, null, { base: 1000 }), 4000);
});

test('backoffDelayMs: 封顶 cap', () => {
  assert.equal(backoffDelayMs(10, null, { base: 1000, cap: 30000 }), 30000);
});

test('backoffDelayMs: Retry-After 优先于指数退避', () => {
  assert.equal(backoffDelayMs(3, '2', { base: 1000 }), 2000);
});

test('isRetriableStatus: 429 与 5xx 可重试，4xx(非429)不重试', () => {
  assert.equal(isRetriableStatus(429), true);
  assert.equal(isRetriableStatus(503), true);
  assert.equal(isRetriableStatus(500), true);
  assert.equal(isRetriableStatus(400), false);
  assert.equal(isRetriableStatus(401), false);
  assert.equal(isRetriableStatus(200), false);
});
