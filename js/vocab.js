// ── 播客中文 · vocab （单词卡 / 生词本） ──────────────────────────────────
// 由 index.html 内联脚本拆分而来（P10）。classic <script>，与其它 js/*.js 共享同一全局
// 词法作用域；按 index.html 中 <script src> 顺序加载，init() 在全部加载后于末尾调用。

// ═══════════════════════════════════════════════════════════════
// Word Card & Vocabulary
// ═══════════════════════════════════════════════════════════════
let vocab      = JSON.parse(localStorage.getItem('pcn_vocab') || '[]');
let _wcCurrent = '';   // word currently shown in card
let _wcAudio   = '';   // pronunciation audio url

// wrap each English word in a clickable span
function wrapWords(text) {
  return text.split(/([A-Za-z]+(?:'[A-Za-z]+)?)/).map((part, i) =>
    i % 2 === 1
      ? `<span class="w" data-word="${esc(part.toLowerCase())}">${esc(part)}</span>`
      : esc(part)
  ).join('');
}

// ── 词形还原：去掉复数/时态，返回原型 ─────────────────────────────
const _LEMMAS = {
  went:'go',gone:'go',going:'go',was:'be',were:'be',been:'be',being:'be',is:'be',are:'be',am:'be',
  had:'have',has:'have',having:'have',did:'do',does:'do',done:'do',doing:'do',
  said:'say',says:'say',saying:'say',got:'get',gotten:'get',getting:'get',
  made:'make',makes:'make',making:'make',came:'come',comes:'come',coming:'come',
  took:'take',taken:'take',takes:'take',taking:'take',
  knew:'know',known:'know',knows:'know',knowing:'know',
  thought:'think',thinks:'think',thinking:'think',
  saw:'see',seen:'see',sees:'see',seeing:'see',
  gave:'give',given:'give',gives:'give',giving:'give',
  found:'find',finds:'find',finding:'find',
  told:'tell',tells:'tell',telling:'tell',
  felt:'feel',feels:'feel',feeling:'feel',
  left:'leave',leaves:'leave',leaving:'leave',
  kept:'keep',keeps:'keep',keeping:'keep',
  brought:'bring',brings:'bring',bringing:'bring',
  bought:'buy',buys:'buy',buying:'buy',
  taught:'teach',teaches:'teach',teaching:'teach',
  caught:'catch',catches:'catch',catching:'catch',
  built:'build',builds:'build',building:'build',
  sent:'send',sends:'send',sending:'send',
  spent:'spend',spends:'spend',spending:'spend',
  ran:'run',runs:'run',running:'run',sitting:'sit',sat:'sit',sits:'sit',
  grew:'grow',grown:'grow',grows:'grow',growing:'grow',
  wrote:'write',written:'write',writes:'write',writing:'write',
  broke:'break',broken:'break',breaks:'break',breaking:'break',
  spoke:'speak',spoken:'speak',speaks:'speak',speaking:'speak',
  chose:'choose',chosen:'choose',chooses:'choose',choosing:'choose',
  drove:'drive',driven:'drive',drives:'drive',driving:'drive',
  wore:'wear',worn:'wear',wears:'wear',wearing:'wear',
  fell:'fall',fallen:'fall',falls:'fall',falling:'fall',
  held:'hold',holds:'hold',holding:'hold',
  stood:'stand',stands:'stand',standing:'stand',
  lost:'lose',loses:'lose',losing:'lose',
  met:'meet',meets:'meet',meeting:'meet',
  paid:'pay',pays:'pay',paying:'pay',
  sold:'sell',sells:'sell',selling:'sell',
  heard:'hear',hears:'hear',hearing:'hear',
  began:'begin',begun:'begin',begins:'begin',beginning:'begin',
  became:'become',becomes:'become',becoming:'become',
  meant:'mean',means:'mean',meaning:'mean',
  led:'lead',leads:'lead',leading:'lead',
  putting:'put',hitting:'hit',cutting:'cut',setting:'set',letting:'let',
  children:'child',men:'man',women:'woman',feet:'foot',teeth:'tooth',
  mice:'mouse',geese:'goose',leaves:'leaf',wolves:'wolf',lives:'life',
  knives:'knife',wives:'wife',
  better:'good',best:'good',worse:'bad',worst:'bad',
  further:'far',farther:'far',farthest:'far',furthest:'far',
};

function lemmatize(raw) {
  const w = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!w || w.length < 2) return w || raw.toLowerCase();
  if (_LEMMAS[w]) return _LEMMAS[w];
  // -ing: running→run, making→make, talking→talk
  if (w.length > 5 && w.endsWith('ing')) {
    const s = w.slice(0, -3);
    if (/(nn|tt|pp|gg|bb|dd|mm)$/.test(s)) return s.slice(0, -1);
    if (s.length >= 3 && /[^aeiou][aeiou][^aeiou]$/.test(s)) return s + 'e';
    return s.length >= 2 ? s : w;
  }
  // -ed: tried→try, stopped→stop, jumped→jump
  if (w.length > 4 && w.endsWith('ed')) {
    if (w.endsWith('ied')) return w.slice(0, -3) + 'y';
    const s = w.slice(0, -2);
    if (/(nn|tt|pp|gg|bb|dd|mm)$/.test(s)) return s.slice(0, -1);
    return s.length >= 2 ? s : w;
  }
  // -s / -es: flies→fly, boxes→box, cats→cat
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
    if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
    if (w.endsWith('es') && /[sxzh]es$/.test(w) && w.length > 4) return w.slice(0, -2);
    return w.slice(0, -1);
  }
  return w;
}

async function lookupWord(inflected) {
  const base = lemmatize(inflected);
  _wcCurrent = base;
  _wcAudio   = '';
  document.getElementById('wcWord').textContent      = base;
  document.getElementById('wcPh').textContent        = '';
  document.getElementById('wcPlayBtn').style.display = 'none';
  document.getElementById('wcDefs').innerHTML        =
    '<div style="padding:16px 0;text-align:center;color:var(--text3)"><span class="spin"></span></div>';
  document.getElementById('wcZhWrap').style.display  = 'none';
  _updateSaveBtn();
  document.getElementById('wordCard').classList.add('show');
  document.getElementById('wcOverlay').classList.add('show');

  // 优先查原型；404 时降级查原始词形
  let res;
  try { res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(base)}`); } catch { res = null; }
  if ((!res || !res.ok) && base !== inflected) {
    try { res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(inflected)}`); } catch { res = null; }
  }

  try {
    if (!res || !res.ok) throw new Error();
    const data  = await res.json();
    const entry = data[0];

    // 使用 API 返回的规范词形（会自动纠正我们的还原结果）
    _wcCurrent = entry.word || base;
    document.getElementById('wcWord').textContent = _wcCurrent;
    _updateSaveBtn();

    const ph    = entry.phonetics?.find(p => p.text)?.text   || '';
    const audio = entry.phonetics?.find(p => p.audio)?.audio || '';
    document.getElementById('wcPh').textContent = ph;
    if (audio) {
      _wcAudio = audio.startsWith('//') ? 'https:' + audio : audio;
      document.getElementById('wcPlayBtn').style.display = '';
    }

    let html = '';
    (entry.meanings || []).slice(0, 4).forEach(m => {
      html += `<div class="wc-pos">${esc(m.partOfSpeech)}</div>`;
      m.definitions.slice(0, 2).forEach(d => {
        html += `<div class="wc-def">• ${esc(d.definition)}</div>`;
        if (d.example) html += `<div class="wc-eg">"${esc(d.example)}"</div>`;
      });
    });
    document.getElementById('wcDefs').innerHTML =
      html || '<div style="color:var(--text3);font-size:13px">无详细释义</div>';

    const firstDef = entry.meanings?.[0]?.definitions?.[0]?.definition;
    if (firstDef) _fetchZhDef(firstDef);

  } catch {
    document.getElementById('wcDefs').innerHTML =
      `<div style="color:var(--text3);font-size:13px;padding:12px 0">未找到「${esc(base)}」的释义</div>`;
  }
}

async function _fetchZhDef(enDef) {
  const wrap = document.getElementById('wcZhWrap');
  const el   = document.getElementById('wcZhDef');
  wrap.style.display = '';
  el.innerHTML = '<span class="spin"></span>';
  try {
    const results = await tencentTranslate([enDef]);
    el.textContent = results[0] || '';
  } catch {
    try {
      el.textContent = await myMemoryTranslate(enDef);
    } catch {
      wrap.style.display = 'none';
    }
  }
}

function playWordAudio() {
  if (_wcAudio) new Audio(_wcAudio).play().catch(() => {});
}

function closeWordCard() {
  document.getElementById('wordCard').classList.remove('show');
  document.getElementById('wcOverlay').classList.remove('show');
}

function _updateSaveBtn() {
  const saved = vocab.some(v => v.word === _wcCurrent);
  const btn   = document.getElementById('wcSaveBtn');
  btn.textContent = saved ? '✓ 已收录' : '＋ 加入单词本';
  btn.className   = `btn btn-sm ${saved ? 'btn-ghost' : 'btn-accent'}`;
}

function toggleSaveWord() {
  const idx = vocab.findIndex(v => v.word === _wcCurrent);
  if (idx >= 0) {
    vocab.splice(idx, 1);
  } else {
    const ph    = document.getElementById('wcPh').textContent;
    const def   = document.getElementById('wcDefs')
                    .querySelector('.wc-def')?.textContent.replace(/^•\s*/, '') || '';
    const zhWrap = document.getElementById('wcZhWrap');
    const zhDef  = (zhWrap && zhWrap.style.display !== 'none')
                    ? document.getElementById('wcZhDef')?.textContent?.trim() || ''
                    : '';
    const source = curEp ? {
      podcast: curPodcast ? { title: curPodcast.title, image: curPodcast.image, feedUrl: curPodcast.feedUrl } : null,
      ep:      { title: curEp.title, audio: curEp.audio, guid: curEp.guid },
      time:    Math.floor(audio.currentTime),
    } : null;
    vocab.unshift({ word: _wcCurrent, ph, def, zhDef, source, savedAt: Date.now() });
  }
  localStorage.setItem('pcn_vocab', JSON.stringify(vocab));
  _updateSaveBtn();
  _updateVocabBadge();
}

function _updateVocabBadge() {
  // tab label updates when vocab page renders; badge element removed
}

// ── Tab navigation ──────────────────────────────────────────
function showTab(tab) {
  ['discover','vocab','playing'].forEach(t => {
    document.getElementById('hdrTab' + t[0].toUpperCase() + t.slice(1))
      ?.classList.toggle('active', t === tab);
  });
  if (tab === 'playing') {
    if (!curEp) restoreLastPlay();
    showPage('player');
    document.getElementById('page-player').classList.toggle('no-ep', !curEp);
    return;
  }
  if (tab === 'vocab') {
    showPage('vocab');
    _renderVocabPage();
  } else {
    showPage('discover');
  }
}

function openVocab() { showTab('vocab'); }
function closeVocab() { showTab('discover'); }

const _CHECK_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function _vocabItemHtml(v, i) {
  const m   = !!v.mastered;
  const src = v.source;
  const srcHtml = src?.ep
    ? `<div class="vocab-source">
        <span class="vocab-source-time">${fmt(src.time || 0)}</span>
        <span class="vocab-source-ep">${esc(src.ep.title || '')}</span>
       </div>`
    : '';
  const jumpBtn = src?.ep
    ? `<button class="vocab-jump-btn"
         onclick="event.stopPropagation();jumpToSource(${i})">↗ 跳转</button>`
    : '';
  return `
    <div class="vocab-item${m ? ' is-mastered' : ''}">
      <div class="vocab-main" data-word="${esc(v.word)}">
        <div><span class="vocab-word">${esc(v.word)}</span>
             <span class="vocab-ph">${esc(v.ph)}</span></div>
        ${v.def   ? `<div class="vocab-def">${esc(v.def)}</div>`   : ''}
        ${v.zhDef ? `<div class="vocab-zh">${esc(v.zhDef)}</div>` : ''}
        ${srcHtml}
      </div>
      <div class="vocab-btns">
        ${jumpBtn}
        <button class="vocab-mastered-btn${m ? ' on' : ''}"
          onclick="event.stopPropagation();toggleMastered(${i})">
          ${m ? '已掌握' : '标记掌握'}
        </button>
      </div>
    </div>`;
}

const _CHEVRON_L = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const _CHEVRON_R = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

function onVocabSearch() { vocabPage = 0; _renderVocabPage(); }

function setVocabPage(p) {
  vocabPage = p;
  _renderVocabPage();
  document.getElementById('vocabPageList').scrollTop = 0;
}

function _renderVocabPage() {
  const el = document.getElementById('vocabPageList');
  if (!el) return;

  // 过滤（搜索）
  const q = (document.getElementById('vocabSearch')?.value || '').toLowerCase().trim();
  const all = vocab.map((v, i) => ({v, i})).filter(({v}) =>
    !q || v.word.toLowerCase().includes(q) ||
    (v.zhDef || '').toLowerCase().includes(q) ||
    (v.def   || '').toLowerCase().includes(q)
  );

  if (!all.length) {
    el.innerHTML = q
      ? `<div style="text-align:center;padding:40px 0;color:var(--text3);font-size:13px">未找到「${esc(q)}」相关单词</div>`
      : `<div style="text-align:center;padding:56px 0;color:var(--text3);font-size:13px;line-height:2">暂无收录单词<br>在播放页点击英文单词可添加</div>`;
    return;
  }

  // 分组（学习中在前）
  const learning = all.filter(({v}) => !v.mastered);
  const mastered = all.filter(({v}) =>  v.mastered);
  const ordered  = [...learning, ...mastered];

  // 分页
  const totalPages = Math.ceil(ordered.length / VOCAB_PAGE_SIZE);
  vocabPage = Math.min(vocabPage, Math.max(0, totalPages - 1));
  const pageItems = ordered.slice(vocabPage * VOCAB_PAGE_SIZE, (vocabPage + 1) * VOCAB_PAGE_SIZE);

  const lOnPage = pageItems.filter(({v}) => !v.mastered);
  const mOnPage = pageItems.filter(({v}) =>  v.mastered);

  let html = '';
  if (lOnPage.length)
    html += `<div class="vocab-group-hdr">学习中 · ${learning.length}</div>`
          + lOnPage.map(({v, i}) => _vocabItemHtml(v, i)).join('');
  if (mOnPage.length)
    html += `<div class="vocab-group-hdr mastered">已掌握 · ${mastered.length}</div>`
          + mOnPage.map(({v, i}) => _vocabItemHtml(v, i)).join('');

  // 分页控件（超过 1 页才显示）
  if (totalPages > 1)
    html += `<div class="vocab-pagination">
      <button class="vocab-page-btn" onclick="setVocabPage(${vocabPage - 1})"
        ${vocabPage <= 0 ? 'disabled' : ''}>${_CHEVRON_L}</button>
      <span class="vocab-page-info">${vocabPage + 1} / ${totalPages}</span>
      <button class="vocab-page-btn" onclick="setVocabPage(${vocabPage + 1})"
        ${vocabPage >= totalPages - 1 ? 'disabled' : ''}>${_CHEVRON_R}</button>
    </div>`;

  el.innerHTML = html;
}

function toggleMastered(i) {
  vocab[i].mastered = !vocab[i].mastered;
  localStorage.setItem('pcn_vocab', JSON.stringify(vocab));
  _renderVocabPage();
}

function removeVocabWord(i) {
  vocab.splice(i, 1);
  localStorage.setItem('pcn_vocab', JSON.stringify(vocab));
  _renderVocabPage();
  _updateVocabBadge();
}

