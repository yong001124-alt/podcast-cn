// 安全相关纯函数单测（P14）—— 零依赖，node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/text-utils.js';

test('safeCssUrl: 正常 https 图片包成 url("...")', () => {
  assert.equal(
    safeCssUrl('https://cdn.com/a.jpg'),
    'url("https://cdn.com/a.jpg")'
  );
});

test('safeCssUrl: http 也放行（本机/直连封面）', () => {
  assert.equal(safeCssUrl('http://localhost:8080/x.png'), 'url("http://localhost:8080/x.png")');
});

test('safeCssUrl: 转义引号/反斜杠，防止破坏 CSS 声明', () => {
  assert.equal(
    safeCssUrl('https://cdn.com/a.jpg");background:url(evil'),
    'url("https://cdn.com/a.jpg%22);background:url(evil")'
  );
  assert.ok(!safeCssUrl('https://x/"a').includes('"a'));   // 裸引号不得残留
});

test('safeCssUrl: 非 http(s) 方案一律拒绝 → 空串', () => {
  assert.equal(safeCssUrl('javascript:alert(1)'), '');
  assert.equal(safeCssUrl('data:image/png;base64,AAAA'), '');
  assert.equal(safeCssUrl('//proto-relative/x.jpg'), '');
});

test('safeCssUrl: 空/null/非法输入安全返回空串', () => {
  assert.equal(safeCssUrl(''), '');
  assert.equal(safeCssUrl(null), '');
  assert.equal(safeCssUrl(undefined), '');
});
