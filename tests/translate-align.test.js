// P1 翻译对齐 —— 纯函数单测。运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/text-utils.js';

test('joinForBatch: 折叠段内换行，避免破坏按行对齐', () => {
  const texts = ['hello\nworld', 'foo', 'bar\n\nbaz'];
  const blob = joinForBatch(texts, '\n');
  // 折叠后每段一行，总行数 = 段数
  assert.equal(blob.split('\n').length, texts.length);
  assert.equal(blob, 'hello world\nfoo\nbar baz');
});

test('splitAligned: 行数匹配时返回对齐数组', () => {
  const out = splitAligned('你好\n世界\n再见', 3, '\n');
  assert.deepEqual(out, ['你好', '世界', '再见']);
});

test('splitAligned: 引擎合并了行（行数变少）→ 返回 null 而非错位', () => {
  // 请求 3 段，引擎只回 2 行 —— 旧逻辑会把第 3 段错配为空/串位
  assert.equal(splitAligned('你好世界\n再见', 3, '\n'), null);
});

test('splitAligned: 引擎拆分了行（行数变多）→ 返回 null', () => {
  assert.equal(splitAligned('你好\n世\n界\n再见', 3, '\n'), null);
});

test('splitAligned: 自定义分隔符同样校验数量', () => {
  assert.deepEqual(splitAligned('a\n||||\nb', 2, '\n||||\n'), ['a', 'b']);
  assert.equal(splitAligned('a\n||||\nb', 3, '\n||||\n'), null);
});

test('splitAligned: null/空输入安全返回 null', () => {
  assert.equal(splitAligned(null, 2), null);
});

test('isHardNetworkError: fetch 的 TypeError(CORS/网络) 触发熔断', () => {
  const e = new TypeError('Failed to fetch');
  assert.equal(isHardNetworkError(e), true);
});

test('isHardNetworkError: 超时 AbortError 视为瞬时，不熔断', () => {
  const e = new Error('aborted'); e.name = 'AbortError';
  assert.equal(isHardNetworkError(e), false);
});

test('isHardNetworkError: 业务错误（行数不匹配/HTTP 4xx）不熔断', () => {
  assert.equal(isHardNetworkError(new Error('腾讯翻译行数不匹配')), false);
  assert.equal(isHardNetworkError(new Error('腾讯翻译 403')), false);
});

test('isHardNetworkError: null 安全', () => {
  assert.equal(isHardNetworkError(null), false);
});

test('回归：含内部换行的源文本经 join+split 往返保持对齐', () => {
  const texts = ['line one\nwrapped', 'second'];
  const blob = joinForBatch(texts, '\n');
  // 模拟翻译引擎逐行翻译且不增删行
  const translated = blob.split('\n').map(l => 'ZH:' + l).join('\n');
  const out = splitAligned(translated, texts.length, '\n');
  assert.deepEqual(out, ['ZH:line one wrapped', 'ZH:second']);
});
