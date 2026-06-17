// P13 异步代次（epoch）守卫 —— 纯函数单测。运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/text-utils.js';

test('isStaleEpoch: 代次一致 → 未过期', () => {
  assert.equal(isStaleEpoch(3, 3), false);
});

test('isStaleEpoch: 代次变化（剧集已切换）→ 过期', () => {
  assert.equal(isStaleEpoch(3, 4), true);
  assert.equal(isStaleEpoch(0, 1), true);
});

test('isStaleEpoch: 典型用法 —— 捕获后被 ++ 即过期', () => {
  let epoch = 0;
  const captured = epoch; // 任务启动时捕获
  epoch++;                // loadEp 切换剧集
  assert.equal(isStaleEpoch(captured, epoch), true);
});
