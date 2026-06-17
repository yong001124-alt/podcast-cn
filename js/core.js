// ── 播客中文 · core （状态 / 导航 / 设置 / 工具 / 缓存 / init） ──────────────────────────────────
// 由 index.html 内联脚本拆分而来（P10）。classic <script>，与其它 js/*.js 共享同一全局
// 词法作用域；按 index.html 中 <script src> 顺序加载，init() 在全部加载后于末尾调用。

// ═══════════════════════════════════════════════════════════════
// Curated Podcast Catalog
// ═══════════════════════════════════════════════════════════════
const COLORS = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#4f46e5','#be185d','#065f46','#92400e'];
function podColor(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}
function initials(name) { return name.split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase(); }

// itunes id → artwork url (populated by loadArtwork on init)
const podImages = {};

const CATALOG = {
  all: [
    {title:'The Daily',author:'The New York Times',genre:'新闻',feedUrl:'https://feeds.simplecast.com/54nAGcIl',itid:1200361736},
    {title:'Huberman Lab',author:'Scicomm Media',genre:'科学',feedUrl:'https://feeds.megaphone.fm/hubermanlab',itid:1545953110},
    {title:'How I Built This',author:'NPR',genre:'商业',feedUrl:'https://feeds.npr.org/510313/podcast.xml',itid:1150510297},
    {title:'Lex Fridman Podcast',author:'Lex Fridman',genre:'科技',feedUrl:'https://lexfridman.com/feed/podcast/',itid:1434243584},
    {title:'Crime Junkie',author:'audiochuck',genre:'犯罪',feedUrl:'https://feeds.simplecast.com/qm_9xx0g',itid:1322200189},
    {title:'Conan O\'Brien Needs a Friend',author:'Team Coco',genre:'喜剧',feedUrl:'https://feeds.simplecast.com/dHoohVNH',itid:1438054347},
    {title:'This American Life',author:'This American Life',genre:'社会',feedUrl:'https://www.thisamericanlife.org/podcast/rss.xml',itid:201671138},
    {title:'NPR News Now',author:'NPR',genre:'新闻',feedUrl:'https://feeds.npr.org/500005/podcast.xml',itid:300290981},
    {title:'Planet Money',author:'NPR',genre:'商业',feedUrl:'https://feeds.npr.org/510289/podcast.xml',itid:290783428},
    {title:'SmartLess',author:'Jason Bateman & Sean Hayes & Will Arnett',genre:'喜剧',feedUrl:'https://feeds.simplecast.com/fT3xUzHC',itid:1505576417},
    {title:'Hidden Brain',author:'NPR',genre:'社会',feedUrl:'https://feeds.npr.org/510308/podcast.xml',itid:1028908750},
    {title:'Radiolab',author:'WNYC Studios',genre:'科学',feedUrl:'https://feeds.wnyc.org/radiolab',itid:152249110},
  ],
  news: [
    {title:'NPR News Now',author:'NPR',genre:'新闻',feedUrl:'https://feeds.npr.org/500005/podcast.xml',itid:300290981},
    {title:'The Daily',author:'The New York Times',genre:'新闻',feedUrl:'https://feeds.simplecast.com/54nAGcIl',itid:1200361736},
    {title:'Up First',author:'NPR',genre:'新闻',feedUrl:'https://feeds.npr.org/510318/podcast.xml',itid:1222114325},
    {title:'BBC Global News',author:'BBC',genre:'新闻',feedUrl:'https://podcasts.files.bbci.co.uk/p02nq0gn.rss',itid:135067274},
    {title:'Post Reports',author:'Washington Post',genre:'新闻',feedUrl:'https://feeds.washingtonpost.com/rss/entertainment/podcasts/post-reports',itid:1436072799},
    {title:'Global News Podcast',author:'BBC World Service',genre:'新闻',feedUrl:'https://podcasts.files.bbci.co.uk/p02nq0gn.rss',itid:135067274},
  ],
  tech: [
    {title:'Lex Fridman Podcast',author:'Lex Fridman',genre:'科技',feedUrl:'https://lexfridman.com/feed/podcast/',itid:1434243584},
    {title:'Hard Fork',author:'The New York Times',genre:'科技',feedUrl:'https://feeds.simplecast.com/H7ItCmWK',itid:1528594034},
    {title:'Darknet Diaries',author:'Jack Rhysider',genre:'科技',feedUrl:'https://feeds.megaphone.fm/darknetdiaries',itid:1296350485},
    {title:'Acquired',author:'Ben Gilbert & David Rosenthal',genre:'科技/商业',feedUrl:'https://feeds.simplecast.com/BMqxbzXr',itid:1419227547},
    {title:'Syntax',author:'Wes Bos & Scott Tolinski',genre:'科技',feedUrl:'https://feed.syntax.fm/rss',itid:1253186678},
    {title:'a16z Podcast',author:'Andreessen Horowitz',genre:'科技',feedUrl:'https://feeds.simplecast.com/IHlIgBEl',itid:842818711},
  ],
  science: [
    {title:'Huberman Lab',author:'Scicomm Media',genre:'科学',feedUrl:'https://feeds.megaphone.fm/hubermanlab',itid:1545953110},
    {title:'Radiolab',author:'WNYC Studios',genre:'科学',feedUrl:'https://feeds.wnyc.org/radiolab',itid:152249110},
    {title:'Science Vs',author:'Wondery',genre:'科学',feedUrl:'https://feeds.megaphone.fm/sciencevs',itid:1051557000},
    {title:'Ologies with Alie Ward',author:'Alie Ward',genre:'科学',feedUrl:'https://feeds.megaphone.fm/ologies',itid:1278815517},
    {title:'StarTalk Radio',author:'Neil deGrasse Tyson',genre:'科学',feedUrl:'https://feeds.megaphone.fm/startalk',itid:326303999},
    {title:'Freakonomics Radio',author:'Freakonomics Radio',genre:'社会/科学',feedUrl:'https://feeds.simplecast.com/OExC4_KP',itid:354668519},
  ],
  business: [
    {title:'How I Built This',author:'NPR',genre:'商业',feedUrl:'https://feeds.npr.org/510313/podcast.xml',itid:1150510297},
    {title:'Planet Money',author:'NPR',genre:'商业',feedUrl:'https://feeds.npr.org/510289/podcast.xml',itid:290783428},
    {title:'My First Million',author:'The Hustle & Shaan Puri',genre:'商业',feedUrl:'https://feeds.megaphone.fm/mfmpod',itid:1469759170},
    {title:'Masters of Scale',author:'WaitWhat',genre:'商业',feedUrl:'https://feeds.simplecast.com/yGXCBl2M',itid:1227971746},
    {title:'WorkLife with Adam Grant',author:'TED',genre:'商业',feedUrl:'https://feeds.ted.com/TED_worklife',itid:1346314086},
    {title:'The Tim Ferriss Show',author:'Tim Ferriss',genre:'商业',feedUrl:'https://feeds.megaphone.fm/timferriss',itid:863897795},
  ],
  health: [
    {title:'Huberman Lab',author:'Scicomm Media',genre:'健康',feedUrl:'https://feeds.megaphone.fm/hubermanlab',itid:1545953110},
    {title:'On Purpose with Jay Shetty',author:'iHeartPodcasts',genre:'健康',feedUrl:'https://feeds.simplecast.com/h4mJPZiP',itid:1450994021},
    {title:'Ten Percent Happier',author:'Dan Harris',genre:'健康',feedUrl:'https://feeds.simplecast.com/qE7D0gED',itid:1087147821},
    {title:'Feel Better Live More',author:'Dr Rangan Chatterjee',genre:'健康',feedUrl:'https://feeds.megaphone.fm/feelbetterlivemore',itid:1360128506},
    {title:'ZOE Science & Nutrition',author:'ZOE',genre:'健康',feedUrl:'https://feeds.megaphone.fm/nutrition',itid:1268882494},
  ],
  comedy: [
    {title:'Conan O\'Brien Needs a Friend',author:'Team Coco',genre:'喜剧',feedUrl:'https://feeds.simplecast.com/dHoohVNH',itid:1438054347},
    {title:'SmartLess',author:'Jason Bateman & Sean Hayes & Will Arnett',genre:'喜剧',feedUrl:'https://feeds.simplecast.com/fT3xUzHC',itid:1505576417},
    {title:'Armchair Expert with Dax Shepard',author:'Armchair Umbrella',genre:'喜剧',feedUrl:'https://feeds.simplecast.com/6FLqFl3V',itid:1345682353},
    {title:'Office Ladies',author:'Earwolf',genre:'喜剧',feedUrl:'https://feeds.simplecast.com/9xhgRST5',itid:1481015430},
    {title:'We Can Do Hard Things',author:'Glennon Doyle',genre:'喜剧',feedUrl:'https://feeds.megaphone.fm/dohard',itid:1564530722},
  ],
  society: [
    {title:'This American Life',author:'This American Life',genre:'社会',feedUrl:'https://www.thisamericanlife.org/podcast/rss.xml',itid:201671138},
    {title:'Serial',author:'Serial Productions',genre:'社会',feedUrl:'https://feeds.serialpodcast.org/serialpodcast',itid:917918570},
    {title:'Hidden Brain',author:'NPR',genre:'社会',feedUrl:'https://feeds.npr.org/510308/podcast.xml',itid:1028908750},
    {title:'Stuff You Should Know',author:'iHeart Podcasts',genre:'社会',feedUrl:'https://feeds.megaphone.fm/stuffyoushouldknow',itid:278981407},
    {title:'Revisionist History',author:'Pushkin Industries',genre:'社会',feedUrl:'https://feeds.megaphone.fm/revisionisthistory',itid:1119389968},
    {title:'99% Invisible',author:'Roman Mars',genre:'社会',feedUrl:'https://feeds.simplecast.com/BqbsxVfO',itid:394775318},
  ],
  crime: [
    {title:'Crime Junkie',author:'audiochuck',genre:'犯罪',feedUrl:'https://feeds.simplecast.com/qm_9xx0g',itid:1322200189},
    {title:'Casefile True Crime',author:'Casefile Presents',genre:'犯罪',feedUrl:'https://feeds.megaphone.fm/casefile',itid:1173707998},
    {title:'My Favorite Murder',author:'Exactly Right',genre:'犯罪',feedUrl:'https://feeds.megaphone.fm/myfavoritemurder',itid:1272025586},
    {title:'Scam Goddess',author:'Earwolf',genre:'犯罪',feedUrl:'https://feeds.simplecast.com/4Hn8ykH2',itid:1509741670},
    {title:'Cold',author:'Oxygen',genre:'犯罪',feedUrl:'https://feeds.megaphone.fm/cold',itid:1510894536},
  ],
};

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════
let settings     = JSON.parse(localStorage.getItem('pcn_settings') || '{}');
let myFeeds      = JSON.parse(localStorage.getItem('pcn_feeds') || '[]');
let curPage      = 'discover';
let prevPage     = 'discover';
let curCat       = 'all';
let curPodcast   = null;   // {title,author,genre,feedUrl,image}
let curEps       = [];
let curEp        = null;
let chunks       = [];
let _epoch       = 0;    // 代次令牌：切换剧集即 +1，作废上一集进行中的异步回写（P13）
// 捕获的代次是否已过期（剧集已切换）→ 进行中的转录/翻译应停止回写
function staleEpoch(ep) { return isStaleEpoch(ep, _epoch); }
const APP_VERSION = '0.1.0';   // 与 package.json 对齐，写入诊断报告
let _errlog      = (() => { try { return JSON.parse(localStorage.getItem('pcn_errlog') || '[]'); } catch { return []; } })();
// 记录一条错误到环形缓冲（最多 50 条）。脱敏后持久化；日志本身绝不再抛错。
function logErr(scope, err) {
  try {
    const raw = (err && err.stack) ? err.stack : (err && err.message ? err.message : err);
    const msg = redactSecrets(String(raw)).slice(0, 400);
    _errlog = pushErrLog(_errlog, { t: new Date().toISOString(), scope, msg }, 50);
    localStorage.setItem('pcn_errlog', JSON.stringify(_errlog));
  } catch { /* 诊断日志失败不应影响主流程 */ }
}
let viewMode     = 'both';
const RATES      = [0.75, 1, 1.25, 1.5, 2];
let rateIdx      = 1;
let ttsActive    = false;
let bilingualMode= false;
let bilingualPaused = false;
let searchTimer  = null;
let searchMode   = false;
let vocabPage    = 0;
const VOCAB_PAGE_SIZE = 20;
let subtitleOffset = 0; // 字幕同步偏移（秒），正值=提前，负值=延迟
let _audioSample   = null; // 音频前 2MB，用于自动对齐

const audio   = document.getElementById('audio');
const prog    = document.getElementById('prog');
const playBtn = document.getElementById('playBtn');

// ═══════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-' + id).classList.remove('hidden');
  curPage = id;
  // 搜索按钮仅在首页显示；离开首页时收起搜索
  const searchBtn = document.getElementById('hdrSearchBtn');
  if (searchBtn) searchBtn.style.display = id === 'discover' ? '' : 'none';
  if (id !== 'discover') collapseSearch();
}

function goBackFromDetail() {
  showPage(prevPage === 'player' ? 'discover' : 'discover');
}

function goBackFromPlayer() {
  stopTTS(); stopBilingual();
  showPage('detail');
  ['discover','vocab','playing'].forEach(t =>
    document.getElementById('hdrTab' + t[0].toUpperCase() + t.slice(1))
      ?.classList.toggle('active', t === 'discover'));
}

// ═══════════════════════════════════════════════════════════════
// Pod registry — avoids inline JSON / single-quote issues in onclick
// ═══════════════════════════════════════════════════════════════
const _podReg = {};
let   _podRegId = 0;
function regPod(p) {
  const id = 'p' + (_podRegId++);
  _podReg[id] = p;
  return id;
}

// ═══════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════
function openSettings() { document.getElementById('settingsOverlay').classList.remove('hidden'); }
function closeSettings() { document.getElementById('settingsOverlay').classList.add('hidden'); }
function saveSettings() {
  settings.groqToken = document.getElementById('groqToken').value.trim();
  settings.hfToken   = document.getElementById('hfToken').value.trim();
  settings.mmEmail   = document.getElementById('mmEmail').value.trim();
  settings.ttsVoice  = document.getElementById('ttsVoice').value;
  settings.corsProxy = document.getElementById('corsProxy').value.trim();
  settings.audioProxy = document.getElementById('audioProxy').value.trim();
  localStorage.setItem('pcn_settings', JSON.stringify(settings));
  closeSettings(); setStatus('设置已保存', 'ok');
}

// 导出诊断报告（P9）：脱敏后的纯文本，浏览器下载，供排查/分享。
function exportDiagnostics() {
  const report = formatDiagnostics({
    errlog: _errlog, settings, ua: navigator.userAgent,
    version: APP_VERSION, now: Date.now(),
  });
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'podcast-cn-diagnostics-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`诊断已导出（${_errlog.length} 条日志）`, 'ok');
}
// 清空诊断日志。
function clearErrLog() {
  _errlog = [];
  localStorage.removeItem('pcn_errlog');
  setStatus('诊断日志已清空', 'ok');
}

function loadVoices() {
  const sel=document.getElementById('ttsVoice');
  const populate=()=>{
    // 高品质音色优先排序（P8）：神经网络音色置顶，机械音色沉底
    const voices=speechSynthesis.getVoices()
      .filter(v=>v.lang.startsWith('zh')||v.lang.startsWith('cmn'))
      .sort((a,b)=>scoreZhVoice(b)-scoreZhVoice(a));
    const best=pickBestZhVoice(voices);
    sel.innerHTML='<option value="">自动选择（推荐）</option>';
    voices.forEach(v=>{
      const o=document.createElement('option');
      const tag=isHighQualityZhVoice(v)?'★ ':'';
      const hint=(v.name===best)?' · 自动选用':'';
      o.value=v.name; o.textContent=`${tag}${v.name} (${v.lang})${hint}`;  // textContent，安全
      if(v.name===settings.ttsVoice) o.selected=true;
      sel.appendChild(o);
    });
  };
  populate(); speechSynthesis.onvoiceschanged=populate;
}

// ═══════════════════════════════════════════════════════════════
// Status bar
// ═══════════════════════════════════════════════════════════════
function setStatus(text, state) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusDot');
  dot.className = 'dot ' + ({busy:'dot-busy',ok:'dot-ok',err:'dot-err'}[state]||'dot-idle');
  if (state === 'err') logErr('ui', text);   // 用户可见的错误统一进诊断日志（P9）
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`
    : `${m}:${sec.toString().padStart(2,'0')}`;
}
function fmtDur(d) {
  if (!d) return '';
  const s = String(d).trim();
  if (/^\d+:\d{2}(:\d{2})?$/.test(s)) return s; // already H:MM:SS or M:SS
  const secs = Math.floor(parseFloat(s));
  if (isNaN(secs) || secs <= 0) return '';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), sec = secs % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`
    : `${m}:${sec.toString().padStart(2,'0')}`;
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

// 封面图加载失败时安全替换为字母占位块（P14）。颜色/字母经 data-* 传入（已 esc），
// 这里用 textContent 渲染，绝不把外部标题拼进 HTML —— 取代旧的 onerror="this.outerHTML='...'" XSS 隐患。
function imgFallback(img) {
  const d = document.createElement('div');
  d.className = img.dataset.phClass || 'pod-placeholder';
  d.style.background = img.dataset.phCol || '';
  d.textContent = img.dataset.phIni || '';
  img.replaceWith(d);
}
// 设置氛围背景图：仅放行 http(s) URL（safeCssUrl），挡掉可破坏 CSS 声明的字符（P14）。
function setAmbient(el, url) {
  if (!el) return;
  const css = safeCssUrl(url);
  el.style.backgroundImage = css;
  el.classList.toggle('on', !!css);
}

// ═══════════════════════════════════════════════════════════════
// Last-play Persistence
// ═══════════════════════════════════════════════════════════════
function saveLastPlay() {
  if (!curEp) return;
  try {
    localStorage.setItem('pcn_last_play', JSON.stringify({
      podcast: curPodcast,
      ep:      curEp,
      time:    Math.floor(audio.currentTime),
    }));
  } catch { }
}

// 通用：将指定 podcast/ep/time 装载进播放器（不导航）
function _setupPlayer(podcast, ep, time, statusMsg) {
  curPodcast = podcast || null;
  curEp      = ep;
  chunks     = [];
  subtitleOffset = 0;
  lastHlIdx  = -1;

  const img = curPodcast?.image;
  const col = podColor(curPodcast?.title || '');
  const ini = initials(curPodcast?.title || '');
  document.getElementById('playerNavTitle').textContent = curPodcast?.title || '';
  document.getElementById('playerBackLabel').textContent = '返回';
  document.getElementById('epTitle').textContent = ep.title;
  document.getElementById('epFeed').textContent  = curPodcast?.title || '';

  const amb      = document.getElementById('playerAmbient');
  const artInner = document.getElementById('apmArtInner');
  if (img) {
    setAmbient(amb, img);
    artInner.innerHTML = `<img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;display:block"
      data-ph-class="apm-art-ph" data-ph-col="${esc(col)}" data-ph-ini="${esc(ini)}"
      onerror="imgFallback(this)">`;
  } else {
    setAmbient(amb, '');
    artInner.innerHTML = `<div class="apm-art-ph" style="background:${col}">${ini}</div>`;
  }

  const ol = document.getElementById('syncOffsetLabel');
  if (ol) ol.textContent = '0.0s';

  audio.src = ep.audio;
  audio.load();
  if (time > 0) {
    const seek = () => { audio.currentTime = time; audio.removeEventListener('loadedmetadata', seek); };
    audio.addEventListener('loadedmetadata', seek);
  }
  playBtn.textContent = '▶';
  document.getElementById('apmArt')?.classList.remove('playing');

  const cached = loadTranscript(ep);
  if (cached?.length) { chunks = cached; }
  renderTr();
  setSubtitle(null);
  if (statusMsg) setStatus(statusMsg, 'ok');
}

function restoreLastPlay() {
  try {
    const s = JSON.parse(localStorage.getItem('pcn_last_play') || 'null');
    if (!s?.ep?.audio) return;
    const t = s.time || 0;
    _setupPlayer(s.podcast, s.ep, t,
      t > 0 ? `上次播放至 ${fmt(t)}，点击播放继续` : '上次播放已恢复');
  } catch { }
}

// 从单词本跳转到记录的播客段落
function jumpToSource(i) {
  const src = vocab[i]?.source;
  if (!src?.ep?.audio) return;
  const t = src.time || 0;

  // 同集：直接 seek
  if (curEp?.audio === src.ep.audio) {
    audio.currentTime = t;
    if (audio.paused) audio.play().catch(() => {});
    showTab('playing');
    setStatus(`已跳转到 ${fmt(t)}`, 'ok');
    return;
  }

  // 不同集：装载后跳转
  _setupPlayer(src.podcast, src.ep, t, `已跳转到 ${fmt(t)}`);
  showTab('playing');
}

// ═══════════════════════════════════════════════════════════════
// Transcript Cache
// ═══════════════════════════════════════════════════════════════
// trKey / TR_CACHE_VERSION / staleTrKeys 已移至 lib/text-utils.js（全局可用）

// 启动时清理旧版本转写缓存（P11）：删除非当前版本的 pcn_tr_* 键，并把索引收敛到
// "当前版本且实际存在"的键，防止格式升级后旧缓存把脏数据喂回 UI。
function pruneOldCache() {
  try {
    const stale = staleTrKeys(Object.keys(localStorage), TR_CACHE_VERSION);
    stale.forEach(k => localStorage.removeItem(k));
    const cur = 'pcn_tr_' + TR_CACHE_VERSION + '_';
    const idx = JSON.parse(localStorage.getItem('pcn_tr_keys') || '[]')
      .filter(k => k.startsWith(cur) && localStorage.getItem(k) != null);
    localStorage.setItem('pcn_tr_keys', JSON.stringify(idx));
  } catch { /* 清理失败不影响主流程 */ }
}

function loadTranscript(ep) {
  try {
    const raw = localStorage.getItem(trKey(ep));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveTranscript(ep, data) {
  const key = trKey(ep);
  const payload = JSON.stringify(data);
  const writeIndex = keys => {
    keys = keys.filter(k => k !== key);
    keys.push(key);
    localStorage.setItem('pcn_tr_keys', JSON.stringify(keys));
    return keys;
  };
  try {
    localStorage.setItem(key, payload);
    writeIndex(JSON.parse(localStorage.getItem('pcn_tr_keys') || '[]'));
  } catch {
    // Storage full: evict oldest transcript and retry once
    try {
      const keys = JSON.parse(localStorage.getItem('pcn_tr_keys') || '[]');
      if (keys.length) { localStorage.removeItem(keys[0]); keys.shift(); }
      localStorage.setItem('pcn_tr_keys', JSON.stringify(keys));
      localStorage.setItem(key, payload);
      writeIndex(keys);
    } catch { /* give up silently */ }
  }
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════
function init() {
  // 捕获未处理的异常 / Promise 拒绝，进诊断环形缓冲（P9）
  window.addEventListener('error', e => logErr('window.error', e.error || e.message));
  window.addEventListener('unhandledrejection', e => logErr('unhandledrejection', e.reason));
  // 键盘可操作：可点击卡片/列表项（role=button + data-kbd）支持 Enter/Space 触发（无障碍）
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-kbd]')) {
      e.preventDefault(); e.target.click();
    }
  });
  pruneOldCache();   // 清理旧版本转写缓存（P11）
  if (!settings.corsProxy) {
    settings.corsProxy = 'https://bird.ioliu.cn/v2/?url=';
    localStorage.setItem('pcn_settings', JSON.stringify(settings));
  }
  // 从缓存恢复封面图（首次加载秒显示）
  try { Object.assign(podImages, JSON.parse(localStorage.getItem('pcn_artwork') || '{}')); } catch { }
  document.getElementById('groqToken').value = settings.groqToken || '';
  document.getElementById('hfToken').value   = settings.hfToken   || '';
  document.getElementById('mmEmail').value   = settings.mmEmail   || '';
  document.getElementById('corsProxy').value = settings.corsProxy || '';
  document.getElementById('audioProxy').value = settings.audioProxy || '';
  loadVoices();

  audio.addEventListener('timeupdate', onTick);
  audio.addEventListener('loadedmetadata', () => {
    document.getElementById('tTot').textContent = fmt(audio.duration);
  });
  audio.addEventListener('play', () => {
    playBtn.textContent = '⏸';
    document.getElementById('apmArt')?.classList.add('playing');
    document.getElementById('playDot')?.classList.add('on');
  });
  audio.addEventListener('pause', () => {
    playBtn.textContent = '▶';
    document.getElementById('apmArt')?.classList.remove('playing');
    document.getElementById('playDot')?.classList.remove('on');
    saveLastPlay();
  });
  audio.addEventListener('ended', () => {
    playBtn.textContent = '▶';
    document.getElementById('apmArt')?.classList.remove('playing');
    document.getElementById('playDot')?.classList.remove('on');
  });
  prog.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (prog.value / 100) * audio.duration;
      prog.style.setProperty('--v', prog.value + '%');
    }
  });

  // 单词点击 — 事件委托，阻止冒泡到 chunk 的 seekTo
  document.getElementById('trBody').addEventListener('click', e => {
    const w = e.target.closest('.w');
    if (!w) return;
    e.stopPropagation();
    lookupWord(w.dataset.word);
  });

  // 初始化单词本徽标
  _updateVocabBadge();

  // 用户手动滚动字幕列表时暂停自动定位 3 秒
  document.getElementById('trBody').addEventListener('scroll', () => {
    if (Date.now() - _trAutoScrollTS < 250) return; // 忽略我们自己触发的滚动事件
    _trUserScrolled = true;
    clearTimeout(_trScrollPauseTimer);
    _trScrollPauseTimer = setTimeout(() => { _trUserScrolled = false; }, 3000);
  }, { passive: true });

  // 单词本：点击单词触发弹窗
  document.getElementById('vocabPageList').addEventListener('click', e => {
    if (e.target.closest('.vocab-mastered-btn') || e.target.closest('.vocab-jump-btn')) return;
    const main = e.target.closest('[data-word]');
    if (main) lookupWord(main.dataset.word);
  });

  renderDiscover();
  loadArtwork(); // async, re-renders cards when images arrive
}

