// P6 近似时间戳 —— 纯函数单测。运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/text-utils.js';

test('splitSentences: 按 .!? 断句', () => {
  assert.deepEqual(splitSentences('Hello world. How are you? Fine!'),
    ['Hello world.', ' How are you?', ' Fine!']);
});

test('splitSentences: 无标点整体作一句', () => {
  assert.deepEqual(splitSentences('no punctuation here'), ['no punctuation here']);
});

test('splitSentences: 空/null → []', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences(null), []);
  assert.deepEqual(splitSentences('   '), []);
});

test('approxChunks: 均匀铺开并全部标记 approx', () => {
  const out = approxChunks(['a', 'b', 'c'], 30, 0);
  assert.equal(out.length, 3);
  assert.ok(out.every(c => c.approx === true));
  assert.deepEqual(out[0].timestamp, [0, 10]);
  assert.deepEqual(out[1].timestamp, [10, 20]);
  assert.deepEqual(out[2].timestamp, [20, 30]);
});

test('approxChunks: 带 timeOffset 偏移', () => {
  const out = approxChunks(['a', 'b'], 20, 100);
  assert.deepEqual(out[0].timestamp, [100, 110]);
  assert.deepEqual(out[1].timestamp, [110, 120]);
});

test('approxChunks: dur 缺失/0 退化为每句 1 秒，仍保序', () => {
  const out = approxChunks(['a', 'b'], 0, 0);
  assert.deepEqual(out[0].timestamp, [0, 1]);
  assert.deepEqual(out[1].timestamp, [1, 2]);
});

test('approxChunks: 空句子数组 → []', () => {
  assert.deepEqual(approxChunks([], 30, 0), []);
});

test('approxChunks: 过滤空白句，zh 初始为空', () => {
  const out = approxChunks(['real', '   '], 10, 0);
  assert.equal(out.length, 1);
  assert.equal(out[0].en, 'real');
  assert.equal(out[0].zh, '');
});
