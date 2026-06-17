// 纯函数单测 —— 零依赖，用 Node 内置 test runner 运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 导入即把工具挂到 globalThis（见 lib/text-utils.js 的双用途约定）
import '../lib/text-utils.js';

test('buildProxyUrl: 无 ? 的基址补 ?url=', () => {
  assert.equal(
    buildProxyUrl('https://proxy.test/', 'https://feed.com/rss?a=1&b=2'),
    'https://proxy.test?url=https%3A%2F%2Ffeed.com%2Frss%3Fa%3D1%26b%3D2'
  );
});

test('buildProxyUrl: 含 ? 的基址直接 append', () => {
  assert.equal(
    buildProxyUrl('https://proxy.test/v2/?url=', 'https://feed.com/rss'),
    'https://proxy.test/v2/?url=https%3A%2F%2Ffeed.com%2Frss'
  );
});

test('buildProxyUrl: 去掉基址尾部斜杠', () => {
  assert.ok(!buildProxyUrl('https://proxy.test///', 'https://x.com').includes('test///'));
});

test('trKey: 同一 audio 产生稳定且带前缀的键', () => {
  const ep = { audio: 'https://cdn.com/ep1.mp3' };
  const k1 = trKey(ep);
  const k2 = trKey({ audio: 'https://cdn.com/ep1.mp3' });
  assert.equal(k1, k2);
  assert.match(k1, /^pcn_tr_/);
});

test('trKey: 不同剧集产生不同键', () => {
  assert.notEqual(
    trKey({ audio: 'https://cdn.com/ep1.mp3' }),
    trKey({ audio: 'https://cdn.com/ep2.mp3' })
  );
});

test('trKey: 无 audio 时回退到 guid', () => {
  assert.equal(trKey({ guid: 'g-123' }), trKey({ guid: 'g-123' }));
  assert.match(trKey({ guid: 'g-123' }), /^pcn_tr_/);
});

test('trKey: 键含当前版本前缀，且不同版本互不命中（P11）', () => {
  const ep = { audio: 'https://cdn.com/ep1.mp3' };
  assert.match(trKey(ep), new RegExp('^pcn_tr_' + TR_CACHE_VERSION + '_'));
  assert.notEqual(trKey(ep, 'v1'), trKey(ep, 'v2'));
});

test('staleTrKeys: 仅挑出非当前版本的转写键，保留当前版本（P11）', () => {
  const all = [
    'pcn_tr_v1_abc', 'pcn_tr_v1_def',   // 旧版本 → 应清理
    'pcn_tr_v2_abc',                      // 当前版本 → 保留
    'pcn_tr_keys',                        // 索引键 → 保留
    'pcn_settings', 'pcn_vocab',          // 其它键 → 保留
  ];
  assert.deepEqual(staleTrKeys(all, 'v2'), ['pcn_tr_v1_abc', 'pcn_tr_v1_def']);
});

test('staleTrKeys: 不误删索引键 pcn_tr_keys', () => {
  assert.deepEqual(staleTrKeys(['pcn_tr_keys'], 'v1'), []);
});

test('staleTrKeys: 空/缺省输入安全', () => {
  assert.deepEqual(staleTrKeys(null, 'v1'), []);
  assert.deepEqual(staleTrKeys([], 'v1'), []);
});

test('buildAudioProxyUrl: 空 base 回退到默认地址', () => {
  assert.equal(
    buildAudioProxyUrl('', 'https://cdn.com/ep.mp3'),
    'http://localhost:8080/audioproxy?url=https%3A%2F%2Fcdn.com%2Fep.mp3'
  );
});

test('buildAudioProxyUrl: 自定义 base + maxbytes', () => {
  assert.equal(
    buildAudioProxyUrl('https://my.host/proxy/', 'https://cdn.com/ep.mp3', 60000),
    'https://my.host/proxy?maxbytes=60000&url=https%3A%2F%2Fcdn.com%2Fep.mp3'
  );
});

test('buildAudioProxyUrl: maxbytes 省略时不带该参数', () => {
  assert.ok(!buildAudioProxyUrl('', 'https://x.com').includes('maxbytes'));
});

test('hasAnyToken: 有 Groq 或 HF token → true', () => {
  assert.equal(hasAnyToken({ groqToken: 'gsk_x' }), true);
  assert.equal(hasAnyToken({ hfToken: 'hf_x' }), true);
});

test('hasAnyToken: 无 token / 空对象 / null → false', () => {
  assert.equal(hasAnyToken({}), false);
  assert.equal(hasAnyToken({ groqToken: '', hfToken: '' }), false);
  assert.equal(hasAnyToken(null), false);
});

test('audioRangeSources: 仅本机代理 + 直连两项', () => {
  const out = audioRangeSources('https://cdn.com/ep.mp3', {});
  assert.deepEqual(out, [
    'http://localhost:8080/audioproxy?url=https%3A%2F%2Fcdn.com%2Fep.mp3',
    'https://cdn.com/ep.mp3',
  ]);
});

test('audioRangeSources: 不含公共代理（避免 Range 被忽略导致分段错乱）', () => {
  const out = audioRangeSources('https://cdn.com/ep.mp3', { corsProxy: 'https://p/?url=' });
  assert.equal(out.length, 2);
  assert.ok(!out.some(u => u.includes('codetabs') || u.startsWith('https://p/')));
});

test('audioFullDownloadSources: 默认含 本机代理/直连/codetabs', () => {
  const out = audioFullDownloadSources('https://cdn.com/ep.mp3', {});
  assert.equal(out.length, 3);
  assert.ok(out[2].includes('api.codetabs.com'));
});

test('audioFullDownloadSources: 设了 corsProxy 时追加自定义代理（保序）', () => {
  const out = audioFullDownloadSources('https://cdn.com/ep.mp3', { corsProxy: 'https://my/?url=' });
  assert.equal(out.length, 4);
  assert.equal(out[3], 'https://my/?url=https%3A%2F%2Fcdn.com%2Fep.mp3');
});

test('audioFullDownloadSources: 空 audioProxy 回退默认地址', () => {
  const out = audioFullDownloadSources('https://cdn.com/ep.mp3', {});
  assert.ok(out[0].startsWith('http://localhost:8080/audioproxy?'));
});
