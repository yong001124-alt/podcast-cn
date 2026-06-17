// ── 播客中文 · player （播放器 / 双语 / 字幕渲染 / TTS / 自动滚动） ──────────────────────────────────
// 由 index.html 内联脚本拆分而来（P10）。classic <script>，与其它 js/*.js 共享同一全局
// 词法作用域；按 index.html 中 <script src> 顺序加载，init() 在全部加载后于末尾调用。

// ═══════════════════════════════════════════════════════════════
// Load Episode → Player
// ═══════════════════════════════════════════════════════════════
function loadEp(i) {
  _epoch++;            // 作废上一集仍在进行的转录/翻译异步回写（P13）
  curEp = curEps[i];
  chunks = [];
  stopTTS(); stopBilingual();
  saveLastPlay(); // 立即记录新选的集（time=0）

  showPage('player');
  document.getElementById('page-player').classList.remove('no-ep');
  ['discover','vocab','playing'].forEach(t =>
    document.getElementById('hdrTab' + t[0].toUpperCase() + t.slice(1))
      ?.classList.toggle('active', t === 'playing'));
  document.getElementById('playerNavTitle').textContent = curPodcast?.title || '';
  document.getElementById('playerBackLabel').textContent = '返回';
  document.getElementById('epTitle').textContent = curEp.title;
  document.getElementById('epFeed').textContent = curPodcast?.title || '';

  // Ambient background + artwork
  const img      = curPodcast?.image;
  const col      = podColor(curPodcast?.title || '');
  const ini      = initials(curPodcast?.title || '');
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

  subtitleOffset = 0;
  const ol = document.getElementById('syncOffsetLabel');
  if (ol) ol.textContent = '0.0s';
  lastHlIdx = -1;
  audio.src = curEp.audio;
  audio.load();
  playBtn.textContent = '▶';
  document.getElementById('apmArt')?.classList.remove('playing');

  renderTr();
  setSubtitle(null);

  const cached = loadTranscript(curEp);
  if (cached?.length) {
    chunks = cached;
    renderTr();
    setStatus(`✓ 已加载缓存（${chunks.length} 段）`, 'ok');
  } else {
    setStatus('节目已加载，点击「转录翻译」开始处理', 'ok');
  }
}

// ═══════════════════════════════════════════════════════════════
// Audio Player
// ═══════════════════════════════════════════════════════════════
function togglePlay() {
  if (audio.paused) { audio.play(); playBtn.textContent = '⏸'; }
  else { audio.pause(); playBtn.textContent = '▶'; }
}
function skip(s) { audio.currentTime = Math.max(0, Math.min(audio.duration||0, audio.currentTime+s)); }
function cycleRate() {
  rateIdx = (rateIdx+1) % RATES.length;
  audio.playbackRate = RATES[rateIdx];
  document.getElementById('rateTag').textContent = RATES[rateIdx] + '×';
}

let lastHlIdx  = -1;
let _lastSaveTS = 0;

function onTick() {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  prog.value = pct;
  prog.style.setProperty('--v', pct + '%');
  document.getElementById('tCur').textContent = fmt(audio.currentTime);
  // 每 5 秒自动保存播放进度
  if (curEp && Date.now() - _lastSaveTS > 5000) {
    _lastSaveTS = Date.now();
    saveLastPlay();
  }
}
// 字幕用 requestAnimationFrame 驱动，精度 ~16ms（远优于 timeupdate 的 ~250ms）
;(function rafSubtitle() {
  if (!audio.paused && audio.duration) updateSubtitle();
  requestAnimationFrame(rafSubtitle);
})();

function updateSubtitle() {
  if (!chunks.length) return;
  const t = audio.currentTime + subtitleOffset;

  // 精确匹配当前段
  let idx = chunks.findIndex(c => t >= c.timestamp[0] && t < c.timestamp[1]);

  // 间隙填充：在两段之间时，保持显示上一段（而不是闪空）
  // 仅在距上一段结束 ≤ 2 秒内有效
  if (idx === -1 && t > 0) {
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (t >= chunks[i].timestamp[0]) { idx = i; break; }
    }
    if (idx >= 0 && t > chunks[idx].timestamp[1] + 2) idx = -1;
  }

  if (idx === lastHlIdx) return;
  lastHlIdx = idx;

  document.querySelectorAll('.chunk').forEach((el, i) => {
    const on = i === idx;
    el.classList.toggle('hl', on);
    if (on) trAutoScroll(el);
  });

  const trBody = document.getElementById('trBody');
  if (trBody) trBody.classList.toggle('has-hl', idx >= 0);

  if (idx >= 0) {
    setSubtitle(chunks[idx]);
    if (bilingualMode && !audio.paused) scheduleBilingualTTS(idx);
  } else {
    setSubtitle(null);
  }
}

function setSubtitle() {}

function adjustOffset(delta) {
  subtitleOffset = Math.max(-5, Math.min(5, +(subtitleOffset + delta).toFixed(1)));
  const label = document.getElementById('syncOffsetLabel');
  if (label) label.textContent = (subtitleOffset >= 0 ? '+' : '') + subtitleOffset.toFixed(1) + 's';
  lastHlIdx = -1;
  updateSubtitle();
}

async function autoAlignSubtitles() {
  if (!chunks.length) { setStatus('请先完成转录', 'err'); return; }
  // 时间戳为近似估算时，基于能量扫描的自动对齐无意义，跳过并引导手动校正
  if (chunks.some(c => c.approx)) { setStatus('本次时间为近似值，无法自动对齐，请用 −/+ 手动校正', 'busy'); return; }
  if (!_audioSample)  { setStatus('音频数据不可用，请重新转录', 'err'); return; }

  const btn = document.getElementById('autoAlignBtn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  setStatus('正在分析音频对齐…', 'busy');

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let audioBuf;
    try {
      audioBuf = await ctx.decodeAudioData(_audioSample.slice(0));
    } catch {
      // 截断的 MP3 可能解码失败，尝试更短片段
      audioBuf = await ctx.decodeAudioData(_audioSample.slice(0, 512 * 1024));
    }
    await ctx.close();

    const data = audioBuf.getChannelData(0);
    const sr   = audioBuf.sampleRate;
    const FRAME = Math.floor(sr * 0.02); // 20ms 帧

    // 对前 N 段各检测语音起始点，收集偏移样本
    const offsets = [];
    const probeCount = Math.min(chunks.length, 6);

    for (let i = 0; i < probeCount; i++) {
      const chunk = chunks[i];
      const whisperStart = chunk.timestamp[0];
      // 在 Whisper 时间戳前后各 2.5 秒内搜索实际语音起始
      const scanFrom = Math.max(0,           Math.floor((whisperStart - 2.5) * sr));
      const scanTo   = Math.min(data.length, Math.floor((whisperStart + 2.5) * sr));
      if (scanFrom >= data.length) break;

      // 估算背景噪底（扫描窗口前 0.5s）
      let noise = 0.001;
      const noiseEnd = scanFrom;
      const noiseStart = Math.max(0, noiseEnd - Math.floor(sr * 0.5));
      for (let s = noiseStart; s + FRAME < noiseEnd; s += FRAME) {
        let e = 0;
        for (let j = 0; j < FRAME; j++) e += data[s + j] ** 2;
        noise = Math.max(noise, Math.sqrt(e / FRAME));
      }
      const threshold = Math.max(noise * 3, 0.006);

      // 找第一个超过阈值的帧
      for (let s = scanFrom; s + FRAME < scanTo; s += Math.floor(FRAME / 2)) {
        let e = 0;
        for (let j = 0; j < FRAME; j++) e += data[s + j] ** 2;
        if (Math.sqrt(e / FRAME) > threshold) {
          offsets.push(s / sr - whisperStart);
          break;
        }
      }
    }

    if (!offsets.length) throw new Error('未能检测到清晰的语音起始点');

    // 取中位数偏移（过滤异常值）
    offsets.sort((a, b) => a - b);
    const median = offsets[Math.floor(offsets.length / 2)];
    if (Math.abs(median) > 4) throw new Error(`偏移量过大 (${median.toFixed(1)}s)，请手动调整`);

    subtitleOffset = +(-median).toFixed(1);
    const label = document.getElementById('syncOffsetLabel');
    if (label) label.textContent = (subtitleOffset >= 0 ? '+' : '') + subtitleOffset.toFixed(1) + 's';
    lastHlIdx = -1;
    updateSubtitle();
    setStatus(`字幕已自动对齐 (${subtitleOffset >= 0 ? '+' : ''}${subtitleOffset.toFixed(1)}s)`, 'ok');

  } catch (e) {
    setStatus('自动对齐失败：' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '自动'; }
  }
}

// ═══════════════════════════════════════════════════════════════
// Bilingual Audio Mode
// ═══════════════════════════════════════════════════════════════
let bilingualSpoken = new Set();

function toggleBilingual() {
  bilingualMode = !bilingualMode;
  bilingualSpoken.clear();
  const btn = document.getElementById('bilingualBtn');
  btn.classList.toggle('active', bilingualMode);
  if (!bilingualMode) stopBilingual();
  setStatus(bilingualMode ? '双语模式已开启：每段英文后自动朗读中文' : '双语模式已关闭', bilingualMode ? 'ok' : 'idle');
}

function stopBilingual() {
  bilingualMode = false;
  bilingualSpoken.clear();
  speechSynthesis.cancel();
  document.getElementById('bilingualBtn')?.classList.remove('active');
}

let bilingualScheduled = -1;
function scheduleBilingualTTS(idx) {
  if (bilingualScheduled === idx) return;
  const chunk = chunks[idx];
  if (!chunk?.zh || chunk.zh === '[翻译失败]') return;
  if (bilingualSpoken.has(idx)) return;
  bilingualScheduled = idx;

  // When audio reaches 90% of this chunk, pause and speak Chinese
  const endTime = chunk.timestamp[1];
  const checkFn = () => {
    if (!bilingualMode) { audio.removeEventListener('timeupdate', checkFn); return; }
    if (audio.currentTime >= endTime - 0.2 && !bilingualSpoken.has(idx)) {
      audio.removeEventListener('timeupdate', checkFn);
      bilingualSpoken.add(idx);
      audio.pause();
      const u = configZhUtterance(chunk.zh, 0.9);
      u.onend = u.onerror = () => { if (bilingualMode) audio.play(); };
      speechSynthesis.speak(u);
    }
  };
  audio.addEventListener('timeupdate', checkFn);
}

// ═══════════════════════════════════════════════════════════════
// Rendering
// ═══════════════════════════════════════════════════════════════
function renderTr() {
  const body = document.getElementById('trBody');
  const cls  = viewMode==='zh' ? 'view-zh' : viewMode==='en' ? 'view-en' : '';
  body.className = `tr-body ${cls}`;
  if (!chunks.length) {
    body.innerHTML = `<div style="text-align:center;color:var(--text3);font-size:13px;padding:36px 16px">
      点击「转录翻译」自动处理音频，或点击「粘贴字幕」手动输入英文文本。</div>`;
    return;
  }
  const approxNote = chunks.some(c => c.approx)
    ? `<div class="approx-note">⏱ 时间为近似估算（本段无精确时间戳）。如字幕与音频不同步，可用播放器的 −/+ 按钮手动校正偏移。</div>`
    : '';
  body.innerHTML = approxNote + chunks.map((c,i) => `
    <div class="chunk" data-idx="${i}" tabindex="0" role="button" data-kbd aria-label="跳转到此句" onclick="seekTo(${i})">
      <div class="chunk-en"><span class="chunk-ts${c.approx ? ' approx' : ''}" ${c.approx ? 'title="时间为近似估算"' : ''}>${c.approx ? '~' : ''}${fmt(c.timestamp[0])}</span>${wrapWords(c.en)}</div>
      <div class="chunk-zh">${c.zh ? esc(c.zh) : '<span class="pending">翻译中…</span>'}</div>
    </div>
  `).join('');
}

function renderTrError(msg) {
  document.getElementById('trBody').innerHTML = `
    <div style="text-align:center;padding:36px;color:var(--text3)">
      <div style="font-size:24px;margin-bottom:12px">⚠️</div>
      <div style="color:var(--red);margin-bottom:8px">转录失败</div>
      <div style="font-size:12px;line-height:1.6">${esc(msg)}</div>
      <div style="margin-top:16px;font-size:12px">可尝试「✏ 粘贴字幕」手动输入英文文本</div>
    </div>`;
}

function setView(mode) {
  viewMode = mode;
  ['both','en'].forEach(m => document.getElementById(`tab-${m}`)?.classList.toggle('on', m===mode));
  renderTr();
}

function seekTo(i) {
  const c = chunks[i]; if (!c) return;
  audio.currentTime = c.timestamp[0];
  audio.play(); playBtn.textContent = '⏸';
}

// ═══════════════════════════════════════════════════════════════
// TTS
// ═══════════════════════════════════════════════════════════════
let ttsQueue=[], ttsIdx=0;
function toggleTTS() {
  if (ttsActive) { stopTTS(); return; }
  const texts = chunks.filter(c=>c.zh&&c.zh!=='[翻译失败]').map(c=>c.zh);
  if (!texts.length) { setStatus('没有可朗读的中文内容，请先完成翻译', 'err'); return; }
  ttsQueue=texts; ttsIdx=0; ttsActive=true;
  document.getElementById('ttsBtn').textContent='⏹';
  speakNext();
}
function stopTTS() {
  speechSynthesis.cancel();
  ttsActive=false; ttsQueue=[];
  const b = document.getElementById('ttsBtn');
  if (b) b.textContent='🔊';
}
function speakNext() {
  if (!ttsActive||ttsIdx>=ttsQueue.length) { stopTTS(); return; }
  const u=configZhUtterance(ttsQueue[ttsIdx], 0.92);
  u.onend=()=>{ttsIdx++;speakNext()};
  u.onerror=()=>{ttsIdx++;speakNext()};
  speechSynthesis.speak(u);
}
function applyVoice(u) {
  const voices = speechSynthesis.getVoices();
  if (settings.ttsVoice) {                          // 用户手动指定
    const v = voices.find(x => x.name === settings.ttsVoice);
    if (v) { u.voice = v; return; }
  }
  // 自动模式：优选高品质中文音色（P8），避免落到机械的系统默认音色
  const name = pickBestZhVoice(voices);
  if (name) { const v = voices.find(x => x.name === name); if (v) u.voice = v; }
}
// 统一配置中文朗读 utterance（音色优选 + 调校，P8）
function configZhUtterance(text, rate = 0.95) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN'; u.rate = rate; u.pitch = 1.0;
  applyVoice(u);
  return u;
}

// ═══════════════════════════════════════════════════════════════
// Transcript auto-scroll  —  lerp, 字幕定位在列表上方 30%
// ═══════════════════════════════════════════════════════════════
let _trUserScrolled = false;
let _trScrollPauseTimer = null;
let _trAutoScrollTS = 0;
let _trRaf = null;

function trAutoScroll(el) {
  if (_trUserScrolled) return;
  const body = document.getElementById('trBody');
  if (!body) return;
  const elRect   = el.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const elAbsTop = elRect.top - bodyRect.top + body.scrollTop;
  const target   = Math.max(0, elAbsTop - 12);
  _trAutoScrollTS = Date.now();
  if (_trRaf) { cancelAnimationFrame(_trRaf); _trRaf = null; }
  const from = body.scrollTop;
  const dist = target - from;
  if (Math.abs(dist) < 4) return;
  const dur  = Math.min(420, Math.max(160, Math.abs(dist) * 0.6));
  const t0   = performance.now();
  function step(now) {
    const p = Math.min((now - t0) / dur, 1);
    body.scrollTop = from + dist * (1 - Math.pow(1 - p, 3)); // ease-out cubic
    _trRaf = p < 1 ? requestAnimationFrame(step) : null;
  }
  _trRaf = requestAnimationFrame(step);
}

