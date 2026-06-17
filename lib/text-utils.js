// ═══════════════════════════════════════════════════════════════
// text-utils.js — 纯函数工具（无 DOM / 无全局依赖）
//
// 双用途加载，无需构建步骤：
//   • 浏览器：<script src="lib/text-utils.js"></script>（classic），
//     顶层 function 声明自动成为全局，供 index.html 内联脚本调用。
//   • Node 测试：import 后函数挂到 globalThis，由 node --test 读取。
// 因此每个导出函数都显式挂到 globalThis（浏览器中冗余但无害）。
// ═══════════════════════════════════════════════════════════════

// 把目标 url 拼到一个 CORS 代理基址上。
// 基址含 '?' 时直接 append 编码后的 url，否则补 '?url='。
function buildProxyUrl(base, url) {
  const b = base.replace(/\/?$/, '');
  return b.includes('?') ? b + encodeURIComponent(url) : b + '?url=' + encodeURIComponent(url);
}

// 转写缓存格式版本（P11）。chunk 结构 / 缓存语义不兼容升级时 +1，
// 旧版本键自然不再命中，并由 staleTrKeys + 启动清理回收，避免脏数据喂回 UI。
const TR_CACHE_VERSION = 'v1';

// 由剧集生成稳定的转写缓存键（基于 audio/guid 的 32-bit 哈希），带版本前缀。
function trKey(ep, version = TR_CACHE_VERSION) {
  const s = ep.audio || ep.guid || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return 'pcn_tr_' + version + '_' + Math.abs(h).toString(36);
}

// 从所有 localStorage 键里挑出"旧版本"转写缓存键（pcn_tr_ 前缀但非当前版本），
// 供启动时清理回收。排除索引键 pcn_tr_keys 本身。
function staleTrKeys(allKeys, version = TR_CACHE_VERSION) {
  const cur = 'pcn_tr_' + version + '_';
  return (allKeys || []).filter(k =>
    k !== 'pcn_tr_keys' && k.startsWith('pcn_tr_') && !k.startsWith(cur)
  );
}

// 把多段文本拼成一个可送翻译的 block。
// 关键：先把每段内部的换行折叠成空格，避免按行/分隔符切回时多出行导致整体错位（P1 bug #1）。
function joinForBatch(texts, sep = '\n') {
  return texts.map(t => String(t == null ? '' : t).replace(/\s*\n\s*/g, ' ').trim()).join(sep);
}

// 把翻译结果按 sep 切回数组。
// 仅当切出的段数与请求段数完全一致才认为对齐成功并返回数组；
// 否则返回 null —— 调用方据此降级（逐段翻译），绝不静默错位（P1 bug #2/#3）。
function splitAligned(translated, expectedCount, sep = '\n') {
  if (translated == null) return null;
  const parts = String(translated).split(sep);
  return parts.length === expectedCount ? parts.map(s => s.trim()) : null;
}

// 本地音频代理（serve.ps1 的 /audioproxy）默认地址。
const DEFAULT_AUDIO_PROXY = 'http://localhost:8080/audioproxy';

// 由可配置的代理基址构造音频代理 URL。base 为空时回退到默认地址。
// maxbytes>0 时附带 maxbytes 参数（用于只读取前若干字节）。
function buildAudioProxyUrl(base, url, maxbytes) {
  const b = (base || DEFAULT_AUDIO_PROXY).replace(/\/?$/, '');
  const mb = maxbytes ? `maxbytes=${maxbytes}&` : '';
  return `${b}?${mb}url=${encodeURIComponent(url)}`;
}

// 支持 Range 的音频来源（用于大小探测 + 分段下载）：本机代理 + 直连。
// 不含公共代理——它们多不转发 Range，对 Range 请求会返回整文件，破坏分段（P4）。
function audioRangeSources(audioUrl, settings = {}) {
  return [...new Set([buildAudioProxyUrl(settings.audioProxy, audioUrl), audioUrl])];
}

// 全量下载（不分段）的候选来源，按优先级；只需返回字节流，不要求支持 Range。
// 用于 Range 分段失败后的降级，提升代理韧性（P4）。
function audioFullDownloadSources(audioUrl, settings = {}) {
  const list = [
    buildAudioProxyUrl(settings.audioProxy, audioUrl),                          // ① 本机代理
    audioUrl,                                                                    // ② 直连
    'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(audioUrl),  // ③ codetabs（二进制透传）
  ];
  if (settings.corsProxy) list.push(buildProxyUrl(settings.corsProxy, audioUrl)); // ④ 自定义代理
  return [...new Set(list)];
}

// 是否已配置任一可用的转录 Token（Groq 或 HuggingFace）。无则需引导用户（P7）。
function hasAnyToken(settings) {
  return !!(settings && (settings.groqToken || settings.hfToken));
}

// 异步代次（epoch）比较：捕获时的代次与当前代次不同 → 任务已过期，应放弃回写（P13）。
function isStaleEpoch(captured, current) {
  return captured !== current;
}

// 把整段文本切成句子（按 .!? 断句；无标点则整体作为一句）。空文本返回 []。
function splitSentences(text) {
  const s = String(text == null ? '' : text);
  return s.match(/[^.!?]+[.!?]+/g) || (s.trim() ? [s] : []);
}

// 把句子在 [timeOffset, timeOffset+dur] 上均匀铺开成字幕 chunk，并标记 approx=true
// —— 表示时间为"近似估算"（无精确时间戳），供 UI 提示用户手动校正（P6）。
// dur 缺失/为 0 时退化为每句 1 秒，仅保证先后顺序可点击跳转。
function approxChunks(sentences, dur, timeOffset = 0) {
  const n = sentences.length;
  if (!n) return [];
  const seg = (dur > 0 ? dur : n) / n;
  return sentences.map((s, i) => ({
    timestamp: [+(timeOffset + i * seg).toFixed(2), +(timeOffset + (i + 1) * seg).toFixed(2)],
    en: String(s).trim(), zh: '', approx: true,
  })).filter(c => c.en);
}

// 解析 Retry-After 头 → 毫秒。支持纯秒数与 HTTP-date 两种形式；非法/缺失返回 null。
function parseRetryAfterMs(h, now = Date.now()) {
  if (h == null) return null;
  const s = String(h).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

// 第 attempt 次重试前的等待毫秒（attempt 从 1 起，确定性、无抖动便于测试）。
// 有 Retry-After 时优先采用；否则指数退避 base*2^(attempt-1)，封顶 cap。
function backoffDelayMs(attempt, retryAfter, { base = 1000, cap = 30000, now } = {}) {
  const ra = parseRetryAfterMs(retryAfter, now);
  const ms = ra != null ? ra : base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(Math.max(0, ms), cap);
}

// 该 HTTP 状态是否值得重试：限流 429 或服务端临时错误 5xx。
function isRetriableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

// 判断一个 fetch 错误是否为"硬性网络/跨域失败"（持续不可达），
// 用于翻译时的会话级熔断：腾讯内部接口被 CORS 挡掉后不再每批重试。
// 超时(AbortError)视为可能瞬时，不触发熔断。
function isHardNetworkError(err) {
  if (!err) return false;
  if (err.name === 'TypeError') return true; // 浏览器 fetch 的 CORS/网络错误
  return /failed to fetch|networkerror|err_|cors|load failed/i.test(String(err.message || err));
}

// 抹掉文本里的敏感信息（Token / 邮箱），用于错误日志与诊断导出（P9 / P14：token 不入日志）。
function redactSecrets(text) {
  return String(text == null ? '' : text)
    .replace(/\bgsk_[A-Za-z0-9]+/g, 'gsk_***')
    .replace(/\bhf_[A-Za-z0-9]+/g, 'hf_***')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***@***');
}

// 把一条记录压入环形缓冲，保留最新 max 条（最旧的被挤出）。返回新数组，不改原数组。
function pushErrLog(buf, entry, max = 50) {
  const arr = Array.isArray(buf) ? buf.slice() : [];
  arr.push(entry);
  return arr.length > max ? arr.slice(arr.length - max) : arr;
}

// 组装可安全分享的诊断报告（纯文本）。配置只暴露"有无"不暴露值，整体再过一遍脱敏。
function formatDiagnostics({ errlog = [], settings = {}, ua = '', version = '', now = Date.now() } = {}) {
  const has = k => (settings && settings[k]) ? 'yes' : 'no';
  const lines = [
    '=== 播客中文 诊断报告 ===',
    '时间: ' + new Date(now).toISOString(),
    '版本: ' + (version || 'unknown'),
    'UA: ' + ua,
    '配置(仅有无，不含密钥): '
      + `groqToken=${has('groqToken')} hfToken=${has('hfToken')} `
      + `mmEmail=${has('mmEmail')} corsProxy=${has('corsProxy')} audioProxy=${has('audioProxy')}`,
    `错误日志(${errlog.length} 条，最新在后):`,
  ];
  for (const e of errlog) {
    lines.push(`  [${(e && e.t) || ''}] ${(e && e.scope) || '-'}: ${(e && e.msg) || ''}`);
  }
  return redactSecrets(lines.join('\n'));
}

// 中文 TTS 音色优选（P8）。给一个音色打分：优先 Edge/系统的神经网络音色
// （Natural/Online，如「Microsoft 晓晓 Online (Natural)」，免费且音质接近云端），
// 贬低老式机械音色（慧慧/瑶瑶/Kangkang），偏好普通话 zh-CN 与云端音色。
// 入参为普通对象 { name, lang, localService }，纯函数可单测。
const _ZH_PREMIUM = /natural|online|晓晓|晓伊|云希|云扬|云健|xiaoxiao|xiaoyi|yunxi|yunyang|yunjian/i;
const _ZH_GOOGLE  = /google.*(普通话|中文|chinese|mandarin)/i;
const _ZH_ROBOTIC = /huihui|yaoyao|kangkang|慧慧|瑶瑶/i;
function scoreZhVoice(v) {
  if (!v) return -Infinity;
  const lang = String(v.lang || '');
  if (!/^zh|^cmn/i.test(lang)) return -Infinity;       // 非中文不参与
  const name = String(v.name || '');
  let s = 0;
  if (_ZH_PREMIUM.test(name)) s += 1000;               // 神经网络音色
  if (_ZH_GOOGLE.test(name))  s += 300;                // Google 普通话(Chrome/Android)
  if (_ZH_ROBOTIC.test(name)) s -= 500;                // 老式 SAPI 机械音色
  if (v.localService === false) s += 100;              // 云端音色通常更自然
  if (/^zh-CN/i.test(lang) || /^cmn/i.test(lang)) s += 50; // 普通话优先于粤语/台湾腔
  return s;
}
// 从音色数组里自动挑出最佳中文音色名（P8）；无中文音色返回 ''。
function pickBestZhVoice(voices) {
  let best = null, bestScore = -Infinity;
  for (const v of (voices || [])) {
    const sc = scoreZhVoice(v);
    if (sc > bestScore) { bestScore = sc; best = v; }
  }
  return (best && bestScore > -Infinity) ? (best.name || '') : '';
}
// 是否值得在 UI 标「★ 高品质」（P8）：神经网络音色或 Google 普通话级别。
function isHighQualityZhVoice(v) {
  return scoreZhVoice(v) >= 300;
}

// 把图片 URL 安全地包成 CSS url("...")（P14）。仅允许 http(s)，转义可能破坏样式声明的
// 反斜杠/引号；非法或空 URL 返回 ''（调用方据此清空背景，不把不可信串塞进 CSS）。
function safeCssUrl(url) {
  const s = String(url == null ? '' : url);
  if (!/^https?:\/\//i.test(s)) return '';
  return 'url("' + s.replace(/\\/g, '%5C').replace(/"/g, '%22') + '")';
}

// 浏览器 classic 脚本中顶层声明已是全局；此处显式挂载是为了 Node ESM 导入。
globalThis.scoreZhVoice = scoreZhVoice;
globalThis.pickBestZhVoice = pickBestZhVoice;
globalThis.isHighQualityZhVoice = isHighQualityZhVoice;
globalThis.safeCssUrl = safeCssUrl;
globalThis.redactSecrets = redactSecrets;
globalThis.pushErrLog = pushErrLog;
globalThis.formatDiagnostics = formatDiagnostics;
globalThis.buildProxyUrl = buildProxyUrl;
globalThis.trKey = trKey;
globalThis.TR_CACHE_VERSION = TR_CACHE_VERSION;
globalThis.staleTrKeys = staleTrKeys;
globalThis.joinForBatch = joinForBatch;
globalThis.splitAligned = splitAligned;
globalThis.buildAudioProxyUrl = buildAudioProxyUrl;
globalThis.DEFAULT_AUDIO_PROXY = DEFAULT_AUDIO_PROXY;
globalThis.isHardNetworkError = isHardNetworkError;
globalThis.audioRangeSources = audioRangeSources;
globalThis.audioFullDownloadSources = audioFullDownloadSources;
globalThis.hasAnyToken = hasAnyToken;
globalThis.isStaleEpoch = isStaleEpoch;
globalThis.splitSentences = splitSentences;
globalThis.approxChunks = approxChunks;
globalThis.parseRetryAfterMs = parseRetryAfterMs;
globalThis.backoffDelayMs = backoffDelayMs;
globalThis.isRetriableStatus = isRetriableStatus;
