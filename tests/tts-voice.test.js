// 中文 TTS 音色优选纯函数单测（P8）—— 零依赖，node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../lib/text-utils.js';

const natural  = { name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', lang: 'zh-CN', localService: false };
const google   = { name: 'Google 普通话（中国大陆）', lang: 'zh-CN', localService: false };
const huihui   = { name: 'Microsoft Huihui - Chinese (Simplified, PRC)', lang: 'zh-CN', localService: true };
const twLocal  = { name: 'Microsoft Hanhan - Chinese (Traditional)', lang: 'zh-TW', localService: true };
const english  = { name: 'Microsoft David - English (US)', lang: 'en-US', localService: true };

test('scoreZhVoice: 神经网络音色 > Google > 机械音色', () => {
  assert.ok(scoreZhVoice(natural) > scoreZhVoice(google));
  assert.ok(scoreZhVoice(google) > scoreZhVoice(huihui));
});

test('scoreZhVoice: 机械音色被贬到负分', () => {
  assert.ok(scoreZhVoice(huihui) < 0);
});

test('scoreZhVoice: 非中文音色 → -Infinity（不参与）', () => {
  assert.equal(scoreZhVoice(english), -Infinity);
});

test('scoreZhVoice: 普通话 zh-CN 优先于繁体 zh-TW（同等其它条件）', () => {
  const cnLocal = { name: 'X', lang: 'zh-CN', localService: true };
  assert.ok(scoreZhVoice(cnLocal) > scoreZhVoice(twLocal));
});

test('scoreZhVoice: null 安全', () => {
  assert.equal(scoreZhVoice(null), -Infinity);
});

test('pickBestZhVoice: 在混合列表里选神经网络音色', () => {
  assert.equal(pickBestZhVoice([english, huihui, natural, google]), natural.name);
});

test('pickBestZhVoice: 只有机械音色时仍返回它（而非空）', () => {
  assert.equal(pickBestZhVoice([english, huihui]), huihui.name);
});

test('pickBestZhVoice: 无中文音色 → ""', () => {
  assert.equal(pickBestZhVoice([english]), '');
  assert.equal(pickBestZhVoice([]), '');
  assert.equal(pickBestZhVoice(null), '');
});

test('isHighQualityZhVoice: 神经网络/Google 为高品质，机械音色不是', () => {
  assert.equal(isHighQualityZhVoice(natural), true);
  assert.equal(isHighQualityZhVoice(google), true);
  assert.equal(isHighQualityZhVoice(huihui), false);
  assert.equal(isHighQualityZhVoice(english), false);
});
