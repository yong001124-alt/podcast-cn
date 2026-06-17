// 诊断日志纯函数单测（P9）—— 零依赖，node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/text-utils.js';

test('redactSecrets: 抹掉 Groq / HF token 与邮箱', () => {
  const out = redactSecrets('token gsk_ABC123def 和 hf_xyz789 给 a.b@mail.com');
  assert.ok(out.includes('gsk_***'));
  assert.ok(out.includes('hf_***'));
  assert.ok(out.includes('***@***'));
  assert.ok(!out.includes('ABC123def'));
  assert.ok(!out.includes('xyz789'));
  assert.ok(!out.includes('a.b@mail.com'));
});

test('redactSecrets: 无敏感信息时原样返回；null 安全', () => {
  assert.equal(redactSecrets('普通错误信息'), '普通错误信息');
  assert.equal(redactSecrets(null), '');
});

test('pushErrLog: 追加并保留最新 max 条（挤出最旧）', () => {
  let buf = [];
  for (let i = 1; i <= 5; i++) buf = pushErrLog(buf, { n: i }, 3);
  assert.deepEqual(buf, [{ n: 3 }, { n: 4 }, { n: 5 }]);
});

test('pushErrLog: 不修改原数组（返回新数组）', () => {
  const orig = [{ n: 1 }];
  const next = pushErrLog(orig, { n: 2 }, 50);
  assert.equal(orig.length, 1);
  assert.equal(next.length, 2);
});

test('pushErrLog: buf 非数组时安全从空开始', () => {
  assert.deepEqual(pushErrLog(null, { n: 1 }, 50), [{ n: 1 }]);
});

test('formatDiagnostics: 配置只暴露有无、不含密钥值', () => {
  const report = formatDiagnostics({
    settings: { groqToken: 'gsk_secret', mmEmail: 'me@x.com' },
    ua: 'TestUA', version: '0.1.0', now: 0,
  });
  assert.ok(report.includes('groqToken=yes'));
  assert.ok(report.includes('hfToken=no'));
  assert.ok(report.includes('mmEmail=yes'));
  assert.ok(!report.includes('gsk_secret'));      // 原值绝不出现
  assert.ok(!report.includes('me@x.com'));
});

test('formatDiagnostics: 错误日志逐条输出并整体脱敏', () => {
  const report = formatDiagnostics({
    errlog: [{ t: '2026-01-01T00:00:00Z', scope: 'ui', msg: '失败 gsk_leaked123' }],
    now: 0,
  });
  assert.ok(report.includes('错误日志(1 条'));
  assert.ok(report.includes('ui:'));
  assert.ok(report.includes('gsk_***'));          // 即使漏进 msg 也会被兜底脱敏
  assert.ok(!report.includes('gsk_leaked123'));
});

test('formatDiagnostics: 空输入也能生成报告', () => {
  const report = formatDiagnostics();
  assert.ok(report.includes('=== 播客中文 诊断报告 ==='));
  assert.ok(report.includes('错误日志(0 条'));
});
