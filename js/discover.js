// ── 播客中文 · discover （分类 / 搜索 / 详情 / RSS） ──────────────────────────────────
// 由 index.html 内联脚本拆分而来（P10）。classic <script>，与其它 js/*.js 共享同一全局
// 词法作用域；按 index.html 中 <script src> 顺序加载，init() 在全部加载后于末尾调用。

// ═══════════════════════════════════════════════════════════════
// Discover — Category
// ═══════════════════════════════════════════════════════════════
function selectCat(cat) {
  curCat = cat;
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  event.target.classList.add('active');
  collapseSearch();
  renderDiscover();
}

const FEATURED_IDS = [
  'https://feeds.megaphone.fm/hubermanlab',
  'https://lexfridman.com/feed/podcast/',
  'https://feeds.simplecast.com/54nAGcIl',
];

function renderDiscover() {
  const wrap = document.getElementById('discoverContent');

  if (curCat === 'rss') {
    renderMyFeeds(wrap);
    return;
  }

  const list = CATALOG[curCat] || CATALOG.all;
  const catNames = {all:'精选推荐',news:'新闻时事',tech:'科技数码',science:'科学教育',
    business:'商业财经',health:'健康生活',comedy:'喜剧娱乐',society:'社会文化',crime:'真实犯罪'};

  if (curCat === 'all') {
    const allPods = Object.values(CATALOG).flat();
    const seen = new Set();
    const featured = FEATURED_IDS.map(url => allPods.find(p => p.feedUrl === url)).filter(Boolean);
    wrap.innerHTML = `
      <div class="sec-hdr"><span class="sec-title">精选推荐</span></div>
      <div class="feat-scroll">${featured.map(p => featCardHtml(p)).join('')}</div>
      <div class="sec-hdr"><span class="sec-title">全部播客 · ${list.length} 个</span></div>
      <div class="pod-grid">${list.map(p => podCardHtml(p)).join('')}</div>
    `;
  } else {
    wrap.innerHTML = `
      <div class="sec-hdr"><span class="sec-title">${catNames[curCat]||'播客'} · ${list.length} 个</span></div>
      <div class="pod-grid">${list.map(p => podCardHtml(p)).join('')}</div>
    `;
  }
  loadCardImages();
}

function featCardHtml(p) {
  const col = podColor(p.title);
  const id  = regPod(p);
  const img = p.image || podImages[p.feedUrl] || (p.itid && podImages[p.itid]);
  return `<div class="feat-card" style="${img ? '' : 'background:' + col}"
      tabindex="0" role="button" data-kbd aria-label="${esc(p.title)}"
      onclick="openPodcast(_podReg['${id}'])">
    ${img ? `<img class="feat-cover" src="${esc(img)}" loading="lazy" onerror="this.style.display='none'">` : ''}
    <div class="feat-overlay">
      <div class="feat-genre">${esc(p.genre)}</div>
      <div class="feat-title">${esc(p.title)}</div>
      <div class="feat-author">${esc(p.author)}</div>
    </div>
  </div>`;
}

function podCardHtml(p) {
  const col = podColor(p.title);
  const ini = initials(p.title);
  const id  = regPod(p);
  const img = p.image || podImages[p.feedUrl] || (p.itid && podImages[p.itid]);
  const coverHtml = img
    ? `<img class="pod-cover" src="${esc(img)}" loading="lazy"
           data-ph-class="pod-placeholder" data-ph-col="${esc(col)}" data-ph-ini="${esc(ini)}"
           onerror="imgFallback(this)">`
    : `<div class="pod-placeholder" style="background:${col}">${ini}</div>`;
  return `<div class="pod-card" data-feed="${esc(p.feedUrl)}" tabindex="0" role="button" data-kbd aria-label="${esc(p.title)}" onclick="openPodcast(_podReg['${id}'])">
    ${coverHtml}
    <div class="pod-overlay">
      <div class="pod-name">${esc(p.title)}</div>
      <div class="pod-author">${esc(p.author)}</div>
    </div>
  </div>`;
}

// 通过本地代理流式读取 RSS 前 30KB，找 itunes:image 标签
async function fetchRssImage(feedUrl) {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 15000);
    // 优先用本地代理（稳定）；serve.ps1 的 maxbytes 参数确保只读前 30KB
    const proxyUrl = buildAudioProxyUrl(settings.audioProxy, feedUrl, 60000);
    const res = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', total = 0;
    while (total < 60000) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      total += value?.length || 0;
      const m = buf.match(/<itunes:image[^>]*href="([^"]+)"/)    // <itunes:image href="URL"/>
             || buf.match(/<itunes:image[^>]*>\s*(https?:\/\/[^\s<]+)/)  // <itunes:image>URL</itunes:image>
             || buf.match(/<image>[\s\S]{0,800}<url>(https?:\/\/[^\s<]+)<\/url>/); // <image><url>URL</url>
      if (m?.[1]?.startsWith('http')) { reader.cancel(); return m[1].trim(); }
    }
    reader.cancel();
  } catch { }
  return null;
}

// 为所有占位符卡片懒加载图片，每批并发 3 个
async function loadCardImages() {
  const cards = [...document.querySelectorAll('.pod-card[data-feed]')]
    .filter(c => c.querySelector('.pod-placeholder'));
  for (let i = 0; i < cards.length; i += 3) {
    await Promise.all(cards.slice(i, i + 3).map(async card => {
      const feedUrl = card.dataset.feed;
      if (!feedUrl || !card.isConnected) return;
      const imgUrl = await fetchRssImage(feedUrl);
      if (!imgUrl || !card.isConnected) return;
      podImages[feedUrl] = imgUrl;
      const ph = card.querySelector('.pod-placeholder');
      if (!ph) return;
      const imgEl = document.createElement('img');
      imgEl.className = 'pod-cover'; imgEl.loading = 'lazy'; imgEl.src = imgUrl;
      const [col, ini] = [ph.style.background, ph.textContent];
      imgEl.onerror = () => { imgEl.outerHTML = `<div class="pod-placeholder" style="background:${col}">${ini}</div>`; };
      ph.replaceWith(imgEl);
    }));
    // 每批后保存缓存
    try {
      localStorage.setItem('pcn_artwork', JSON.stringify(
        Object.fromEntries(Object.entries(podImages).filter(([k]) => k.startsWith('http')))
      ));
    } catch { /* storage full */ }
  }
}

// iTunes 批量拉取（仍作为补充，更新 podImages 后重渲染）
async function loadArtwork() {
  const allIds = [...new Set(
    Object.values(CATALOG).flat().map(p => p.itid).filter(Boolean)
  )];
  if (!allIds.length) return;
  const itunesUrl = `https://itunes.apple.com/lookup?id=${allIds.join(',')}&entity=podcast`;
  const proxy = settings.corsProxy || 'https://bird.ioliu.cn/v2/?url=';
  for (const attempt of [buildProxyUrl(proxy, itunesUrl), `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(itunesUrl)}`]) {
    try {
      const res = await fetchWithTimeout(attempt, 8000);
      if (!res.ok) continue;
      const data = JSON.parse(await res.text());
      (data.results || []).forEach(r => {
        const img = r.artworkUrl600 || r.artworkUrl100;
        if (img) {
          if (r.collectionId)   podImages[r.collectionId] = img;
          if (r.feedUrl)        podImages[r.feedUrl]       = img;
        }
      });
      if (curPage === 'discover') renderDiscover();
      return;
    } catch { /* try next */ }
  }
}

function renderMyFeeds(wrap) {
  if (!myFeeds.length) {
    wrap.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--text3)">
      <div style="font-size:40px;margin-bottom:14px;opacity:.3">📡</div>
      <div style="font-size:15px;font-weight:600;color:var(--text2);margin-bottom:8px">还没有订阅</div>
      <div style="font-size:13px;line-height:1.6">从其他分类中点击播客，<br>然后点击「+ 订阅」添加到此处</div>
    </div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="sec-hdr"><span class="sec-title">我的订阅 · ${myFeeds.length} 个</span></div>
    <div class="pod-grid">${myFeeds.map(p => podCardHtml(p)).join('')}</div>
  `;
  loadCardImages();
}

// ═══════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════
function onSearchInput(val) {
  const clearBtn = document.getElementById('searchClear');
  clearBtn.style.display = val ? 'block' : 'none';
  clearTimeout(searchTimer);
  if (!val.trim()) {
    if (searchMode) { searchMode = false; renderDiscover(); }
    return;
  }
  searchMode = true;
  document.getElementById('discoverContent').innerHTML =
    '<div class="search-status"><span class="spin"></span> 搜索中…</div>';
  searchTimer = setTimeout(() => doSearch(val.trim()), 500);
}

async function doSearch(q) {
  // First show local matches
  const allPods = Object.values(CATALOG).flat();
  const seen = new Set();
  const local = allPods.filter(p => {
    const key = p.feedUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return p.title.toLowerCase().includes(q.toLowerCase()) ||
           p.author.toLowerCase().includes(q.toLowerCase()) ||
           p.genre.toLowerCase().includes(q.toLowerCase());
  });

  const wrap = document.getElementById('discoverContent');
  if (local.length) {
    wrap.innerHTML = `<div class="sec-hdr"><span class="sec-title">本地结果 · ${local.length} 个</span></div>` +
      local.map(p => searchItemHtml(p)).join('');
  }

  // Try iTunes Search API（国内通过代理）
  try {
    const itunesSearch = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=podcast&entity=podcast&limit=20&country=us`;
    const proxy = settings.corsProxy || 'https://bird.ioliu.cn/v2/?url=';
    const searchProxies = [
      buildProxyUrl(proxy, itunesSearch),
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(itunesSearch)}`,
    ];
    let res = null;
    for (const u of searchProxies) {
      try { res = await fetchWithTimeout(u, 8000); if (res.ok) break; } catch { res = null; }
    }
    if (!res?.ok) throw new Error('iTunes unreachable');
    const data = await res.json();
    const results = (data.results || []).filter(r => r.feedUrl).map(r => ({
      title: r.collectionName,
      author: r.artistName,
      genre: r.primaryGenreName || '播客',
      feedUrl: r.feedUrl,
      image: r.artworkUrl600 || r.artworkUrl100,
    }));
    if (results.length) {
      const seen2 = new Set(local.map(p => p.feedUrl));
      const online = results.filter(r => !seen2.has(r.feedUrl));
      wrap.innerHTML =
        (local.length ? `<div class="sec-hdr"><span class="sec-title">本地结果 · ${local.length} 个</span></div>` +
          local.map(p => searchItemHtml(p)).join('') : '') +
        (online.length ? `<div class="sec-hdr" style="margin-top:8px"><span class="sec-title">在线结果 · ${online.length} 个</span></div>` +
          online.map(p => searchItemHtml(p)).join('') : '');
    }
    if (!local.length && !results.length) {
      wrap.innerHTML = `<div class="search-status">未找到「${esc(q)}」相关播客</div>`;
    }
  } catch {
    if (!local.length) {
      wrap.innerHTML = `<div class="search-status">搜索失败，请检查网络连接</div>`;
    }
  }
}

function searchItemHtml(p) {
  const col = podColor(p.title);
  const ini = initials(p.title);
  const imgHtml = p.image
    ? `<img class="search-thumb" src="${esc(p.image)}"
           data-ph-class="search-thumb-placeholder" data-ph-col="${esc(col)}" data-ph-ini="${esc(ini)}"
           onerror="imgFallback(this)">`
    : `<div class="search-thumb-placeholder" style="background:${col}">${ini}</div>`;
  const id = regPod(p);
  return `<div class="search-res-item" tabindex="0" role="button" data-kbd aria-label="${esc(p.title)}" onclick="openPodcast(_podReg['${id}'])">
    ${imgHtml}
    <div class="search-info">
      <div class="search-title">${esc(p.title)}</div>
      <div class="search-meta">${esc(p.author)} · ${esc(p.genre)}</div>
    </div>
  </div>`;
}

// 展开搜索覆盖层
function expandSearch() {
  document.getElementById('hdrSearchOverlay').classList.add('open');
  setTimeout(() => document.getElementById('searchInp').focus(), 50);
}

// 收起搜索覆盖层，重置状态
function collapseSearch() {
  const overlay = document.getElementById('hdrSearchOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.getElementById('searchInp').value = '';
  document.getElementById('searchClear').style.display = 'none';
  if (searchMode) {
    searchMode = false;
    clearTimeout(searchTimer);
    renderDiscover();
  }
}

// 清空输入框内容（✕ 按钮），不收起覆盖层
function clearSearchInput() {
  searchMode = false;
  clearTimeout(searchTimer);
  document.getElementById('searchInp').value = '';
  document.getElementById('searchClear').style.display = 'none';
  renderDiscover();
  document.getElementById('searchInp').focus();
}

function clearSearch() {
  collapseSearch();
}

// ═══════════════════════════════════════════════════════════════
// Podcast Detail
// ═══════════════════════════════════════════════════════════════
async function openPodcast(p) {
  curPodcast = p;
  prevPage = curPage;
  showPage('detail');

  const col = podColor(curPodcast.title);
  const ini = initials(curPodcast.title);
  const imgHtml = curPodcast.image
    ? `<img class="detail-cover" src="${esc(curPodcast.image)}"
           data-ph-class="detail-cover-ph" data-ph-col="${esc(col)}" data-ph-ini="${esc(ini)}"
           onerror="imgFallback(this)">`
    : `<div class="detail-cover-ph" style="background:${col}">${ini}</div>`;

  const subscribed = myFeeds.some(f => f.feedUrl === curPodcast.feedUrl);

  // Ambient background
  const amb = document.getElementById('detailAmbient');
  setAmbient(amb, curPodcast.image);

  document.getElementById('detailNavTitle').textContent = curPodcast.title;
  document.getElementById('detailHero').innerHTML = `
    ${imgHtml}
    <div class="detail-info">
      <div class="detail-title">${esc(curPodcast.title)}</div>
      <div class="detail-author">${esc(curPodcast.author)}</div>
      <div class="detail-genre">${esc(curPodcast.genre)}</div>
      <div class="detail-btns">
        <button class="btn btn-accent btn-sm" id="subBtn" onclick="toggleSubscribe()">
          ${subscribed ? '✓ 已订阅' : '+ 订阅'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('epListHdr').textContent = '加载节目列表…';
  document.getElementById('epList').innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3)"><span class="spin"></span> 加载中…</div>`;

  try {
    const feed = await parseRSS(curPodcast.feedUrl);
    curEps = feed.eps;
    // Update cover if we got one
    if (feed.image && !curPodcast.image) {
      curPodcast.image = feed.image;
      const cover = document.querySelector('.detail-cover');
      if (cover) cover.src = feed.image;
      setAmbient(document.getElementById('detailAmbient'), feed.image);
    }
    document.getElementById('epListHdr').textContent = `节目列表 · ${curEps.length} 集`;
    renderEpList();
  } catch (e) {
    document.getElementById('epListHdr').textContent = '节目列表';
    document.getElementById('epList').innerHTML =
      `<div style="padding:24px;text-align:center;color:var(--red);font-size:13px">加载失败：${esc(e.message)}</div>`;
  }
}

function renderEpList() {
  document.getElementById('epList').innerHTML = curEps.map((ep, i) => {
    const dur = fmtDur(ep.duration);
    const date = ep.date ? ep.date.replace(/\s\d{4}$/, '').replace(/^\w+,\s*/, '') : '';
    return `
    <div class="ep-row" tabindex="0" role="button" data-kbd aria-label="播放：${esc(ep.title)}" onclick="loadEp(${i})">
      <span class="ep-num">${i + 1}</span>
      <div class="ep-row-info">
        <div class="ep-row-title">${esc(ep.title)}</div>
        <div class="ep-row-meta">
          ${date ? `<span>${esc(date)}</span>` : ''}
          ${dur  ? `<span class="ep-dur">${esc(dur)}</span>` : ''}
        </div>
      </div>
      <button class="ep-play-btn" onclick="event.stopPropagation();loadEp(${i})">▶</button>
    </div>`;
  }).join('');
}

function toggleSubscribe() {
  const idx = myFeeds.findIndex(f => f.feedUrl === curPodcast.feedUrl);
  if (idx >= 0) {
    myFeeds.splice(idx, 1);
    document.getElementById('subBtn').textContent = '+ 订阅';
  } else {
    myFeeds.push(curPodcast);
    document.getElementById('subBtn').textContent = '✓ 已订阅';
  }
  localStorage.setItem('pcn_feeds', JSON.stringify(myFeeds));
}

// ═══════════════════════════════════════════════════════════════
// RSS parsing  — 国内优先代理链
// ═══════════════════════════════════════════════════════════════
function fetchWithTimeout(url, ms = 12000, opts = {}) {
  const ctrl = new AbortController();
  const tid   = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal })
    .finally(() => clearTimeout(tid));
}

// buildProxyUrl 已移至 lib/text-utils.js（全局可用）

// Normalise raw rss2json response → {title,image,eps}
function normaliseRss2json(d) {
  return {
    title: d.feed.title || '',
    image: d.feed.image || '',
    eps: d.items.map(it => ({
      title:    it.title || '（无标题）',
      date:     (it.pubDate || '').split(' ')[0],
      audio:    it.enclosure?.link || '',
      duration: it.enclosure?.duration || '',
      guid:     it.guid || it.title,
    })).filter(e => e.audio),
  };
}

async function parseRSS(url) {
  const errs = [];

  // ① 用户自定义代理（最高优先级）
  if (settings.corsProxy) {
    try {
      const proxyUrl = settings.corsProxy.replace(/\/?$/, '') +
                       (settings.corsProxy.includes('?') ? encodeURIComponent(url) : '?url=' + encodeURIComponent(url));
      const res = await fetchWithTimeout(proxyUrl);
      if (res.ok) {
        const text = await res.text();
        if (text.trimStart().startsWith('{')) {
          const d = JSON.parse(text);
          if (d.status === 'ok' && d.items?.length) return normaliseRss2json(d);
          if (d.contents) return parseRssXml(d.contents);
        } else {
          return parseRssXml(text);
        }
      }
    } catch (e) { errs.push('custom:' + e.message); }
  }

  // ② bird.ioliu.cn — 国内可访问 CORS 代理（主力）
  try {
    const res = await fetchWithTimeout(
      `https://bird.ioliu.cn/v2/?url=${encodeURIComponent(url)}`
    );
    if (res.ok) return parseRssXml(await res.text());
  } catch (e) { errs.push('bird.ioliu:' + e.message); }

  // ③ 直接 fetch（部分播客 CDN 自带 Access-Control-Allow-Origin: *）
  try {
    const res = await fetchWithTimeout(url);
    if (res.ok) return parseRssXml(await res.text());
  } catch (e) { errs.push('direct:' + e.message); }

  // ④ codetabs.com — Cloudflare 节点，国内可用
  try {
    const res = await fetchWithTimeout(
      `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`
    );
    if (res.ok) return parseRssXml(await res.text());
  } catch (e) { errs.push('codetabs:' + e.message); }

  // ⑤ rss2json.com — Cloudflare CDN 备用
  try {
    const res = await fetchWithTimeout(
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=50`
    );
    if (res.ok) {
      const d = await res.json();
      if (d.status === 'ok' && d.items?.length) return normaliseRss2json(d);
    }
  } catch (e) { errs.push('rss2json:' + e.message); }

  throw new Error(
    '加载失败，所有代理均无法访问。\n' +
    '💡 解决方法：打开 ⚙ 设置，在「自定义代理」中填入自建 Cloudflare Workers 地址。\n' +
    '（' + errs.slice(0, 2).join(' / ') + '）'
  );
}

function parseRssXml(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('RSS 格式解析失败');
  const channel = doc.querySelector('channel');
  if (!channel) throw new Error('未找到 RSS channel');

  const txt  = (el, sel) => el.querySelector(sel)?.textContent?.trim() || '';
  const attr = (el, sel, a) => el.querySelector(sel)?.getAttribute(a) || '';
  // 命名空间兼容：CSS selector 和 getElementsByTagNameNS 两种方式
  const itunesTxt = (el, tag) =>
    el.querySelector(`itunes\\:${tag}`)?.textContent?.trim()
    || el.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', tag)[0]?.textContent?.trim()
    || '';
  const itunesAttr = (el, tag, a) =>
    el.querySelector(`itunes\\:${tag}`)?.getAttribute(a)
    || el.getElementsByTagNameNS('http://www.itunes.com/dtds/podcast-1.0.dtd', tag)[0]?.getAttribute(a)
    || '';

  const title = txt(channel, 'title');
  const image = itunesAttr(channel, 'image', 'href')
             || itunesTxt(channel, 'image')
             || txt(channel, 'image > url') || '';

  const eps = Array.from(doc.querySelectorAll('item')).map(item => {
    const enc   = item.querySelector('enclosure');
    const audio = enc?.getAttribute('url') || '';
    return {
      title:    txt(item, 'title') || '（无标题）',
      date:     txt(item, 'pubDate').split(' ').slice(0, 4).join(' '),
      audio,
      duration: itunesTxt(item, 'duration') || enc?.getAttribute('duration') || '',
      guid:     txt(item, 'guid') || txt(item, 'title'),
    };
  }).filter(e => e.audio);

  if (!eps.length) throw new Error('未找到可播放节目（无音频链接）');
  return { title, image, eps };
}

