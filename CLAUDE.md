# CLAUDE.md — 播客中文 · 英文播客翻译平台

> 项目位于 `D:\my-project\podcast-cn\`，核心是 `index.html` 这个**播客翻译 Web App**。
> 上级目录 `D:\my-project\` 下还有其它独立项目（见末尾「兄弟项目」），它们各自独立，互不依赖。

## 项目目标

帮助中文用户「听懂英文播客」：搜索英文播客 → 转写英文字幕 → 翻译为中文 → 双语对照 + 中文 TTS 跟读 + 生词本。
核心约束：**纯前端、无后端、无 npm 运行时依赖、无框架、无构建**——浏览器直接双击打开 `index.html` 即可运行。
（逻辑/样式已外联为多文件，见「代码结构」，但仍是 classic 脚本 + 同目录相对路径，`file://` 双击照常可用。）

## 如何运行

直接双击 `index.html` 即可用，但**播放在线音频会遇到 CORS / Range 问题**，因此推荐用自带代理服务：

```powershell
# 在 D:\my-project\podcast-cn 下启动本地服务（含 /audioproxy 音频代理）
powershell -File .\serve.ps1
# 然后浏览器打开 http://localhost:8080
```

`serve.ps1` 是一个 ~120 行的 PowerShell HttpListener（`$root = $PSScriptRoot`，即脚本所在目录）：
- 静态托管 `podcast-cn\` 下文件（`http://localhost:8080/`）
- `GET /audioproxy?url=...&maxbytes=N` —— 代理音频请求，转发 `Range` / `Content-Range`，解决跨域和「只下前 2MB 做字幕对齐」的需求。
  音频代理地址可在设置里改（`settings.audioProxy`，默认 `http://localhost:8080/audioproxy`），不再硬编码。

### 跑测试（纯函数单测，零依赖）
```powershell
npm test   # = node --test，用 Node 内置 runner，无需 npm install
```
- 纯函数抽到 `lib/text-utils.js`，**双用途加载**：浏览器用 `<script src>`（classic，顶层声明即全局），
  Node 测试 `import` 后函数挂到 `globalThis`。新增可测纯函数时沿用此约定（文件末尾 `globalThis.fn = fn`）。
- 测试在 `tests/*.test.js`。**不引入构建工具 / 测试框架**，保持零依赖。

## 代码结构（已拆分多文件，P10）

`index.html` 现在只含 `<head>`（含 CSP）+ `<body>`（4 个 page + 多个 modal 标记）+ 末尾按序加载的脚本；
样式与逻辑已外联，**仍是纯前端、零运行时依赖、双击 `index.html` 即可运行**（全部 classic `<script src>` + 同目录相对路径，`file://` 可用，无构建、无 ES module）。

```
index.html        ← 标记 + <link styles.css> + 顺序加载下列脚本，末尾 <script>init()</script>
styles.css        ← 原 <style> 全部 CSS
lib/text-utils.js ← 纯函数（双用途：浏览器 classic / Node import）
js/core.js        ← 状态/导航/Pod 注册/设置/状态栏/工具(esc·imgFallback·setAmbient·fmt)/上次播放/转写缓存/init
js/discover.js    ← 分类目录/搜索(iTunes)/播客详情/RSS 解析
js/player.js      ← 加载剧集/音频播放/双语跟读/字幕渲染/TTS/自动滚动
js/transcribe.js  ← Groq+HF 转录/粘贴字幕/翻译(腾讯·MyMemory)
js/vocab.js       ← 单词卡/生词本
```

> **加载模型（重要）**：所有 `js/*.js` 是 classic 脚本，**共享同一个全局词法作用域**——
> 顶层 `function`/`let`/`const` 跨文件可见，故**每个全局名只能声明一次**（重复声明=`SyntaxError`）。
> 文件加载顺序只对「立即执行」语句有意义；目前唯一的立即执行是 index.html 末尾的 `init()`，
> 它在全部脚本加载后调用。新增「异步后回写全局」逻辑仍须遵守 epoch/`staleEpoch` 约定（P13）。
> 新函数请放进对应主题的 `js/*.js`；纯函数仍放 `lib/text-utils.js`（可单测）。

### 页面（SPA，靠 `showPage(id)` 切换 `.hidden`）
- `#page-discover` —— 发现/搜索，分类目录 `CATALOG`、精选 `FEATURED_IDS`
- `#page-detail` —— 单个播客的剧集列表
- `#page-vocab` —— 生词本（分页，`VOCAB_PAGE_SIZE=20`）
- `#page-player` —— 播放器 + 双语字幕

### 关键全局状态（均在 `<script>` 顶部，~859 行起）
- `settings` ← `localStorage['pcn_settings']`（Token、邮箱、语音、代理）
- `myFeeds` ← `localStorage['pcn_feeds']`（订阅）
- `vocab` ← `localStorage['pcn_vocab']`（生词本）
- `curPodcast` / `curEps` / `curEp` / `chunks` —— 当前播放上下文；`chunks` 是字幕数组 `{en, zh, timestamp:[start,end]}`
- `viewMode`（en/zh/both）、`subtitleOffset`（字幕对齐偏移秒）

### 主要流程与函数入口
| 功能 | 入口函数 | 说明 |
|------|---------|------|
| 播客搜索 | `doSearch` | iTunes Search API |
| RSS 解析 | `parseRSS` → `parseRssXml` / `normaliseRss2json` | 多级回退，最后兜底 rss2json.com |
| 转写（主） | `startTranscription` → `groqTranscribeProgressive` | Groq `whisper-large-v3-turbo`，分段渐进式 |
| 转写（备） | `whisperTranscribe` | HuggingFace `whisper-small`，国内慢 |
| 翻译 | `translateRange` → `tencentTranslate` / `myMemoryTranslate` | 腾讯优先，MyMemory 兜底 |
| 手动粘贴字幕 | `submitPaste` | 无需 Token |
| 字幕自动对齐 | `autoAlignSubtitles` | 用音频前 2MB 能量扫描微调时间戳 |
| 双语 TTS 跟读 | `toggleBilingual` / `scheduleBilingualTTS` | 浏览器 `SpeechSynthesis` |
| 生词本/单词卡 | `vocab*` / `*WordCard` | `_LEMMAS` 词形还原表 |

## 外部依赖（全部第三方免费服务，无需自建）
- **iTunes Search API** —— 播客搜索（无 key）
- **rss2json.com** —— RSS 兜底解析（限 30~50 集/次）
- **CORS 代理** —— 默认 `bird.ioliu.cn`，可在设置里换自建 Cloudflare Workers
- **Groq API**（用户自填 token）—— 转写主力，国内可访问
- **HuggingFace API**（用户自填 token）—— 转写备用
- **腾讯翻译 / MyMemory** —— 翻译（MyMemory 免费 5k 字/天，填邮箱 10k）
- **浏览器 SpeechSynthesis** —— 中文 TTS

> ⚠️ 所有服务都是免费/公共额度，任一变动都可能断功能；这是当前最大稳定性风险。

## 开发约定
- **不要引入构建工具 / npm 运行时依赖 / 前端框架**——保持单文件可直接打开（仅 `npm test` 用 Node 内置 runner）。
- 主逻辑在 `js/*.js`（按主题分文件，见「代码结构」），纯函数放 `lib/text-utils.js`（可被单测覆盖），代理在 `serve.ps1`；新增全局名注意跨文件唯一。
- 持久化一律走 `localStorage`，key 前缀 `pcn_`（设置 `pcn_settings`、订阅 `pcn_feeds`、生词 `pcn_vocab`、转写缓存 `pcn_tr_*` + 索引 `pcn_tr_keys`、上次播放 `pcn_last_play`、封面 `pcn_artwork`、诊断日志 `pcn_errlog`）。
- 写错误日志统一用 `logErr(scope, err)`（脱敏 + 环形缓冲）；面向用户的失败提示用 `setStatus(text, 'err')`（已自动转调 `logErr`）。**任何写日志/诊断的文本必须经 `redactSecrets` 脱敏，token / 邮箱不入库**（P9/P14）。
- 翻译走批量时**必须保持行对齐**：用 `joinForBatch` 折叠段内换行后拼接，`splitAligned` 校验段数，不匹配则降级逐段翻译，**绝不静默错位**（见 `tests/translate-align.test.js`）。
- 新增任何"异步后回写 `chunks`/全局状态"的逻辑时，**必须在入口捕获 `const ep = _epoch`，回写前 `staleEpoch(ep)` 校验**，否则切换剧集会写入过期数据（P13）。
- 改动转写缓存（`chunk` 结构 / 缓存语义）且不兼容旧数据时，**必须把 `TR_CACHE_VERSION` +1**（`lib/text-utils.js`）。键自动变为 `pcn_tr_<新版本>_*`，旧缓存不再命中，并由启动时 `pruneOldCache` 回收（P11）。
- **任何把外部数据（RSS/搜索/词典/图片 URL）写进 DOM 的地方必须先 `esc()`；图片地址进 `src`/`data-*` 用 `esc()`，进 CSS `url()` 用 `safeCssUrl`/`setAmbient`，图片加载失败回退用 `imgFallback`（data-* + textContent）——绝不在 `onerror`/内联事件里用外部数据拼 HTML**（P14）。新增 `innerHTML` 写入点请沿用此约定。
- **可点击的非按钮元素（`<div onclick>` 卡片/列表项）必须加 `tabindex="0" role="button" data-kbd` + `aria-label`**——`init()` 里有全局 keydown 委托，对 `[data-kbd]` 元素响应 Enter/Space 触发 `.click()`，保证键盘可操作（无障碍）。样式层 `:focus-visible` 已给焦点环；`prefers-reduced-motion` 已关动效。
- 应用主列宽走 CSS 变量 `--col`（移动 600px，≥1024px 放宽到 680px），header/nav/内容/播放页统一引用，勿再硬编码列宽。
- 中文 UI 文案；代码注释中英混用均可。

## 进展 / 已知待办（截至 2026-06）

> 排期与实时进度见 `ROADMAP.md`；技术架构、合理性评估与风险预防见 `ARCHITECTURE.md`（推进时同步更新）。
**已完成**
- ✅ 转写结果已缓存（`saveTranscript/loadTranscript`，`pcn_tr_*` + LRU 淘汰）。
- ✅ P1 翻译行错位：已修，`joinForBatch`/`splitAligned` + 逐段兜底，单测覆盖。
- ✅ P2 音频代理地址可配置（`settings.audioProxy`），不再硬编码 localhost。
- ✅ P3 腾讯翻译加会话级熔断（`isHardNetworkError`），CORS/网络硬失败后本会话直走 MyMemory。
- ✅ 纯函数单测底座（`npm test`，零依赖）。
- ✅ P4 音频下载多级回退：分段/探测用 Range 来源（`audioRangeSources`），全量降级扩展公共代理（`audioFullDownloadSources`）。
- ✅ P5 Groq 429/5xx 退避重试（`backoffDelayMs`/`parseRetryAfterMs`/`isRetriableStatus`）。
- ✅ P6 近似时间戳：无 segment 统一 `approxChunks` 标记 `approx`，UI 显示 `~`+提示条，自动对齐跳过近似数据。
- ✅ P13 异步竞态：`_epoch` 代次令牌，`loadEp` +1；转录/翻译回写前 `staleEpoch(ep)` 校验，过期即放弃（`isStaleEpoch`）。
- ✅ P7 首次引导：无 token（`hasAnyToken`）时弹 `onboardOverlay` 引导卡（三步获取 Groq token + 直达链接 + 内嵌输入），并提供「改用粘贴字幕」无 token 通道。
- ✅ P9 错误日志导出：环形缓冲 `pcn_errlog`（≤50 条），`setStatus('err')` 与未捕获异常自动入库；设置里「导出诊断」下载脱敏纯文本（`redactSecrets`/`pushErrLog`/`formatDiagnostics`）。
- ✅ P11 缓存键版本化：`trKey` 加版本前缀 `pcn_tr_<ver>_`（`TR_CACHE_VERSION`），启动 `pruneOldCache` 删旧版本键并收敛索引（`staleTrKeys`）。
- ✅ P14 安全审计：消除 5 处 `onerror` 内拼外部标题的 XSS（改 `imgFallback`：data-* + textContent）；CSS `url()` 走 `safeCssUrl`（仅 http(s)+转义）；加 meta CSP + `serve.ps1` 安全头（X-Frame-Options/nosniff/frame-ancestors）。
- ✅ P8 中文 TTS 音质（路线一·音色优选+调校）：`scoreZhVoice`/`pickBestZhVoice` 自动优选 Edge Natural 神经网络音色、贬低机械音色（慧慧等），设置里高品质置顶并标 ★，`configZhUtterance` 统一 lang/rate/pitch。纯前端零依赖；云端路线按决策不做。
- ✅ Playwright 浏览器冒烟：`tests/e2e/smoke.py`，23 项全绿（经 webapp-testing skill + `with_server.py`）。

**待办 / 可选后续**
1. 收紧 CSP：去掉 `script-src 'unsafe-inline'` 需把 body 内联 `onclick` 全改 `addEventListener`（工作量大、收益边际，按需再做）。
2. 持续性风险：全链路依赖免费/公共第三方服务（rss2json/MyMemory/bird.ioliu/Groq/HF/iTunes），任一变动即可能断功能——长期监控项。

---

## 兄弟项目（同目录，互相独立）
- `catidentify/` —— 猫脸个体识别（Python + onnxruntime + DINOv2），第0步可行性已验证。
- `float_translate/` —— Flutter 悬浮实时翻译 app。
- `minesweeper/` —— 扫雷游戏（有独立 CLAUDE.md / Vite 项目）。
- `whatsapp-mcp/` —— WhatsApp MCP server。
