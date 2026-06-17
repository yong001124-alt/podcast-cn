// ── 播客中文 · transcribe （转录 / 粘贴 / 翻译） ──────────────────────────────────
// 由 index.html 内联脚本拆分而来（P10）。classic <script>，与其它 js/*.js 共享同一全局
// 词法作用域；按 index.html 中 <script src> 顺序加载，init() 在全部加载后于末尾调用。

// ═══════════════════════════════════════════════════════════════
// Transcription — HuggingFace Whisper
// ═══════════════════════════════════════════════════════════════
async function startTranscription() {
  if (!curEp) return;
  if (!hasAnyToken(settings)) { openOnboard(); return; }  // 首次引导（P7）
  const ep = _epoch;          // 捕获本次代次，剧集切换后即作废（P13）
  const epOfEp = curEp;       // 完成时回写缓存用，避免存到切换后的剧集
  const btn = document.getElementById('transcribeBtn');
  btn.innerHTML = '<span class="spin"></span> 处理中…'; btn.disabled = true;
  chunks = [];
  renderTr();
  try {
    if (settings.groqToken) {
      await groqTranscribeProgressive(curEp.audio, ep); // 分段转录 + 边转边译
    } else {
      setStatus('正在发送音频到 HuggingFace Whisper…', 'busy');
      const result = await whisperTranscribe(curEp.audio);
      if (staleEpoch(ep)) return;   // 剧集已切换，丢弃过期结果
      chunks = result;
      renderTr();
      setStatus(`转录完成 ${chunks.length} 段，翻译中…`, 'busy');
      await translateRange(0, chunks.length, ep);
    }
    if (staleEpoch(ep)) return;     // 收尾前再确认未切换
    setStatus(`✓ 完成 ${chunks.length} 段`, 'ok');
    saveTranscript(epOfEp, chunks);
    autoAlignSubtitles();
  } catch (e) {
    if (staleEpoch(ep)) return;     // 切换引发的中断不报错
    setStatus('处理失败：' + e.message, 'err');
    if (!chunks.length) renderTrError(e.message);
  } finally {
    if (!staleEpoch(ep)) { btn.innerHTML = '🎙 转录翻译'; btn.disabled = false; }
  }
}

// 下载音频 → 分段 → 逐段转录 + 翻译，边处理边展示
// ── 主入口：优先当前播放位置，用 Range 请求按需下载 ─────────────
async function groqTranscribeProgressive(audioUrl, ep = _epoch) {
  const CHUNK  = 8 * 1024 * 1024;   // 每段 8MB ≈ 8-12 分钟
  const MAX    = 24 * 1024 * 1024;  // Groq 上限
  const rangeSources = audioRangeSources(audioUrl, settings); // 支持 Range 的来源（探测+分段）

  // Step 1：Range GET bytes=0-1023 探测文件总大小（比 HEAD 更可靠，CDN 通常支持）
  setStatus('正在分析音频…', 'busy');
  let totalBytes = 0;
  for (const src of rangeSources) {
    try {
      const h = await fetchWithTimeout(src, 15000, { headers: { Range: 'bytes=0-1023' } });
      if (h.status === 206) {
        const cr = h.headers.get('content-range'); // "bytes 0-1023/TOTAL"
        const m  = cr && cr.match(/\/(\d+)$/);
        if (m) totalBytes = parseInt(m[1]);
        try { await h.body.cancel(); } catch { }
        break;
      } else if (h.ok) {
        totalBytes = parseInt(h.headers.get('content-length') || '0') || 0;
        try { await h.body.cancel(); } catch { }
        if (totalBytes) break;
      }
    } catch { }
  }

  // totalBytes=0 → 文件大小未知，不拆段（避免重复下载整个文件）
  const limited    = totalBytes ? Math.min(totalBytes, MAX) : 0;
  const numChunks  = limited ? Math.max(1, Math.ceil(limited / CHUNK)) : 1;
  const totTime    = audio.duration || 0;
  const curTime    = audio.currentTime || 0;

  // Step 2：确定处理顺序 —— 优先当前播放位置所在分段
  const priorityIdx = (totalBytes && totTime && curTime > 30)
    ? Math.min(Math.floor((curTime / totTime) * numChunks), numChunks - 1)
    : 0;

  const order = priorityIdx > 0
    ? [priorityIdx, ...Array.from({ length: numChunks }, (_, i) => i).filter(i => i !== priorityIdx)]
    : Array.from({ length: numChunks }, (_, i) => i);

  let sampleSaved = false;

  // Step 3：按顺序下载 → 转录 → 翻译 → 立即显示
  for (const idx of order) {
    if (staleEpoch(ep)) return;   // 剧集已切换，停止后续分段（P13）
    const byteStart  = idx * CHUNK;
    const byteEnd    = Math.min(byteStart + CHUNK - 1, limited - 1);
    // 用文件大小比例估算该段的起始时间（足够精度，自动对齐会校正剩余偏差）
    const timeOffset = (totalBytes && totTime) ? (byteStart / totalBytes) * totTime : 0;
    const isPriority = idx === priorityIdx && priorityIdx > 0;
    const segLabel   = numChunks > 1 ? `第 ${idx + 1}/${numChunks} 段${isPriority ? '（当前位置）' : ''}` : '';

    setStatus(`下载${segLabel ? ' ' + segLabel : ''}…`, 'busy');

    // Range 下载当前段（先走代理，再直连；仅用支持 Range 的来源）
    let buf = null;
    for (const src of rangeSources) {
      try {
        const headers = totalBytes ? { Range: `bytes=${byteStart}-${byteEnd}` } : {};
        const r = await fetchWithTimeout(src, 180000, { headers });
        if (r.ok || r.status === 206) {
          const c = await r.arrayBuffer();
          if (c.byteLength > 10000) { buf = c.byteLength > MAX ? c.slice(0, MAX) : c; break; }
        }
      } catch { }
    }

    // Range 失败时降级全量下载（仅首次）
    if (!buf && idx === order[0]) {
      setStatus('分段下载失败，尝试全量下载…', 'busy');
      for (const src of audioFullDownloadSources(audioUrl, settings)) {
        try {
          const r = await fetchWithTimeout(src, 90000);
          if (r.ok) { buf = await r.arrayBuffer(); break; }
        } catch { }
      }
      if (!buf) throw new Error('无法获取音频（所有来源均失败）');
      // 全量直接处理，不再分段
      _audioSample = buf.slice(0, Math.min(buf.byteLength, 2 * 1024 * 1024));
      const safeBuf = buf.byteLength > MAX ? buf.slice(0, MAX) : buf;
      await _processChunk(safeBuf, 0, '', numChunks, ep);
      return;
    }
    if (!buf) continue;

    if (!sampleSaved) {
      _audioSample = buf.slice(0, Math.min(buf.byteLength, 2 * 1024 * 1024));
      sampleSaved = true;
    }

    await _processChunk(buf, timeOffset, segLabel, numChunks, ep);
  }

  if (!chunks.length) throw new Error('所有分段均无法转录');
}

// 转录单个已下载的音频段，按时间顺序插入全局 chunks，翻译并刷新界面
async function _processChunk(buf, timeOffset, segLabel, numChunks, ep = _epoch) {
  setStatus(`转录${segLabel ? ' ' + segLabel : ''}…`, 'busy');

  let newSegs;
  try {
    newSegs = await _groqCallSegments(buf, timeOffset);
  } catch (e) {
    if (staleEpoch(ep)) return;    // 切换引发的中断，不当致命错误
    if (!chunks.length) throw e;   // 第一段失败是致命的
    setStatus(`${segLabel || '某段'}转录失败，跳过`, 'err');
    return;
  }
  if (staleEpoch(ep)) return;      // 剧集已切换，丢弃这段结果（P13）
  if (!newSegs.length) return;

  // 按时间戳插入（保证非顺序下载时字幕仍连贯）
  const firstTs  = newSegs[0].timestamp[0];
  let insertAt   = chunks.findIndex(c => c.timestamp[0] > firstTs);
  if (insertAt === -1) insertAt = chunks.length;
  chunks = [...chunks.slice(0, insertAt), ...newSegs, ...chunks.slice(insertAt)];
  renderTr();

  setStatus(`翻译${segLabel ? ' ' + segLabel : ''}…`, 'busy');
  await translateRange(insertAt, insertAt + newSegs.length, ep);
}

// 单次 Groq API 调用，返回带偏移时间戳的 chunk 数组
async function _groqCallSegments(buf, timeOffset) {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  // 429 限流 / 5xx 临时错误时退避重试（优先用 Retry-After，否则指数退避 + 抖动）
  const MAX_RETRY = 4;
  let resp;
  for (let attempt = 1; ; attempt++) {
    resp = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', 120000, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.groqToken}` },
      body: form,
    });
    if (resp.ok) break;
    if (isRetriableStatus(resp.status) && attempt <= MAX_RETRY) {
      const wait = backoffDelayMs(attempt, resp.headers.get('retry-after'));
      const jittered = Math.round(wait * (0.9 + Math.random() * 0.2)); // ±10% 抖动，防惊群
      const reason = resp.status === 429 ? '限流' : `服务端错误 ${resp.status}`;
      setStatus(`Groq ${reason}，${Math.ceil(jittered / 1000)} 秒后重试（${attempt}/${MAX_RETRY}）…`, 'busy');
      try { await resp.body?.cancel(); } catch { }
      await sleep(jittered);
      continue;
    }
    const e = await resp.json().catch(() => ({}));
    throw new Error(e.error?.message || `Groq API ${resp.status}`);
  }
  const data = await resp.json();

  if (data.segments?.length) {
    return data.segments
      .map(s => ({
        timestamp: [+(s.start + timeOffset).toFixed(2), +(s.end + timeOffset).toFixed(2)],
        en: s.text.trim(),
        zh: '',
      }))
      .filter(c => c.en);
  }
  if (data.text) {
    // 无 segment 时间戳，按句均匀估算并标记 approx（UI 会提示近似 + 引导手动校正）
    return approxChunks(splitSentences(data.text), data.duration || buf.byteLength / 16000, timeOffset);
  }
  throw new Error('Groq 返回空结果');
}

async function whisperTranscribe(audioUrl) {
  const MODEL = 'openai/whisper-small';
  const API   = `https://api-inference.huggingface.co/models/${MODEL}`;

  // 503 = 模型冷启动，自动重试最多 3 次（每次等 35 秒）
  for (let attempt = 1; attempt <= 3; attempt++) {
    setStatus(`正在调用 Whisper（第 ${attempt}/3 次，首次冷启动约 30 秒）…`, 'busy');
    let resp = await fetch(API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.hfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: audioUrl, parameters: { return_timestamps: true } })
    }).catch(() => null);

    if (!resp) {
      setStatus('URL 方式失败，尝试直接上传音频…', 'busy');
      resp = await fetchAndSendBinary(audioUrl, API);
    } else if (!resp.ok && resp.status !== 503) {
      setStatus('URL 方式失败，尝试直接上传音频…', 'busy');
      resp = await fetchAndSendBinary(audioUrl, API);
    }

    if (resp.status === 503) {
      if (attempt < 3) {
        setStatus(`模型加载中，${35} 秒后重试（${attempt}/3）…`, 'busy');
        await sleep(35000);
        continue;
      }
      throw new Error('模型持续无响应，请稍后再试');
    }
    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `API ${resp.status}`); }
    return parseWhisper(await resp.json());
  }
}

async function fetchAndSendBinary(audioUrl, apiUrl) {
  const MAX = 24 * 1024 * 1024;
  let buf;
  try {
    buf = await (await fetch(audioUrl)).arrayBuffer();
  } catch {
    const proxy = settings.corsProxy || 'https://bird.ioliu.cn/v2/?url=';
    buf = await (await fetch(buildProxyUrl(proxy, audioUrl))).arrayBuffer();
  }
  if (buf.byteLength > MAX) buf = buf.slice(0, MAX);
  return fetch(apiUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${settings.hfToken}`, 'Content-Type': 'audio/mpeg' },
    body: buf
  });
}

function parseWhisper(data) {
  if (Array.isArray(data?.chunks) && data.chunks.length) {
    return data.chunks.map(c => ({
      timestamp: Array.isArray(c.timestamp) ? c.timestamp : [0,0],
      en: (c.text||'').trim(), zh:'',
      approx: !Array.isArray(c.timestamp), // 无时间戳的段标记近似
    })).filter(c=>c.en);
  }
  const text = data?.text || (typeof data==='string' ? data : '');
  if (!text) throw new Error('Whisper 返回空结果');
  // 纯文本无时间戳，按句均匀估算并标记 approx
  return approxChunks(splitSentences(text), audio.duration || 3600, 0);
}

// ═══════════════════════════════════════════════════════════════
// Paste Transcript
// ═══════════════════════════════════════════════════════════════
function openPaste() { document.getElementById('pasteText').value=''; document.getElementById('pasteOverlay').classList.remove('hidden'); }
function closePaste() { document.getElementById('pasteOverlay').classList.add('hidden'); }

// 首次引导卡（无 Token 时）—— P7
function openOnboard() {
  document.getElementById('onboardToken').value = settings.groqToken || '';
  document.getElementById('onboardOverlay').classList.remove('hidden');
}
function closeOnboard() { document.getElementById('onboardOverlay').classList.add('hidden'); }
function onboardUsePaste() { closeOnboard(); openPaste(); }   // 改用粘贴模式，无需 Token
function onboardSaveStart() {
  const t = document.getElementById('onboardToken').value.trim();
  if (!t) { setStatus('请粘贴 Token，或选择「改用粘贴字幕」', 'err'); return; }
  settings.groqToken = t;
  localStorage.setItem('pcn_settings', JSON.stringify(settings));
  const gi = document.getElementById('groqToken'); if (gi) gi.value = t; // 与设置面板同步
  closeOnboard();
  startTranscription();
}
async function submitPaste() {
  const text = document.getElementById('pasteText').value.trim();
  if (!text) return;
  closePaste();
  const lines = text.split(/\n+/).filter(l=>l.trim());
  // 粘贴的字幕本就无精确时间戳：在整集时长上均匀铺开并标记 approx
  chunks = approxChunks(lines, audio.duration || 0, 0);
  renderTr();
  const ep = _epoch, epOfEp = curEp;   // 捕获代次，剧集切换后丢弃（P13）
  const btn = document.getElementById('transcribeBtn');
  btn.innerHTML = '<span class="spin"></span> 翻译中…'; btn.disabled = true;
  setStatus(`共 ${chunks.length} 段，翻译中…`, 'busy');
  try {
    await translateAll(ep);
    if (staleEpoch(ep)) return;
    setStatus(`✓ 翻译完成 ${chunks.length} 段`, 'ok');
    saveTranscript(epOfEp, chunks);
  } catch(e) { if (!staleEpoch(ep)) setStatus('翻译出错：'+e.message, 'err'); }
  finally { if (!staleEpoch(ep)) { btn.innerHTML = '🎙 转录翻译'; btn.disabled = false; } }
}

// ═══════════════════════════════════════════════════════════════
// Translation — MyMemory
// ═══════════════════════════════════════════════════════════════
// 会话级熔断：腾讯为未公开内部接口，被 CORS/网络硬性挡掉后，
// 本次会话不再每批重试，直接走 MyMemory（避免每批白费一次失败请求 + 延迟）。
let _tencentDisabled = false;

// 翻译 chunks[from..to)，边翻边渲染，分批并发
async function translateRange(from, to, ep = _epoch) {
  const BATCH = 10, CONCURRENCY = 5;
  const batches = [];
  for (let i = from; i < to; i += BATCH) batches.push(i);

  for (let g = 0; g < batches.length; g += CONCURRENCY) {
    if (staleEpoch(ep)) return;   // 剧集已切换，停止翻译并回写（P13）
    await Promise.all(batches.slice(g, g + CONCURRENCY).map(async start => {
      const end   = Math.min(start + BATCH, to);
      const texts = chunks.slice(start, end).map(c => c.en);
      // 回写前校验代次与目标仍存在，避免写入已被切换/重置的 chunks
      const setZh = (j, v) => { if (!staleEpoch(ep) && chunks[start + j]) chunks[start + j].zh = v; };
      const apply = arr => texts.forEach((_, j) => setZh(j, (arr[j] || '').trim() || '[翻译失败]'));
      // ① 腾讯批量（内部已校验对齐，不匹配会抛错）；会话内被硬性熔断后跳过
      if (!_tencentDisabled) {
        try {
          apply(await tencentTranslate(texts));
          return;
        } catch (e) {
          if (isHardNetworkError(e)) _tencentDisabled = true; // CORS/网络不可达 → 本会话不再试
        }
      }
      // ② MyMemory 批量：拼接 → 翻译 → 校验对齐，不匹配则视为失败进入逐段
      try {
        const blob = await myMemoryTranslate(joinForBatch(texts, '\n||||\n'));
        const aligned = splitAligned(blob, texts.length, '\n||||\n');
        if (aligned) { apply(aligned); return; }
      } catch { }
      // ③ 逐段翻译兜底：每段独立请求，天然对齐（慢但绝不错位）
      await Promise.all(texts.map(async (t, j) => {
        try { setZh(j, (await myMemoryTranslate(t)).trim() || '[翻译失败]'); }
        catch { setZh(j, '[翻译失败]'); }
      }));
    }));
    if (staleEpoch(ep)) return;
    renderTr();
    const done = Math.min(from + (g + CONCURRENCY) * BATCH, to);
    setStatus(`翻译中… ${done} / ${chunks.length}`, 'busy');
  }
}

async function translateAll(ep = _epoch) {
  await translateRange(0, chunks.length, ep);
}

async function tencentTranslate(texts) {
  const res = await fetchWithTimeout('https://transmart.qq.com/api/imt', 15000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      header: { fn: 'auto_translation_block', client_key: 'browser-chrome-120.0.0-Windows 10-' + Date.now() },
      type: 'plain',
      model_category: 'normal',
      source: { lang: 'en', text_block: joinForBatch(texts, '\n') },
      target: { lang: 'zh' }
    })
  });
  if (!res.ok) throw new Error('腾讯翻译 ' + res.status);
  const data = await res.json();
  if (data.header?.ret_code !== 'succ') throw new Error(data.header?.ret_code || '腾讯翻译失败');
  // 仅当行数与请求段数完全一致才采用，否则抛错让上层降级（避免静默错位）
  const aligned = splitAligned(data.auto_translation, texts.length, '\n');
  if (!aligned) throw new Error('腾讯翻译行数不匹配');
  return aligned;
}

async function myMemoryTranslate(text) {
  const p = new URLSearchParams({ q: text, langpair: 'en|zh' });
  if (settings.mmEmail) p.append('de', settings.mmEmail);
  const res  = await fetchWithTimeout(`https://api.mymemory.translated.net/get?${p}`, 10000);
  const data = await res.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error(data.responseDetails || '翻译 API 失败');
}

