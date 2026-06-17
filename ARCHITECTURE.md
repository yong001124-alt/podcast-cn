# 技术架构 · 播客中文

> 现状梳理 + 合理性评估 + 风险与预防。最近更新：2026-06-17。
> 排期见 `ROADMAP.md`，开发约定见 `CLAUDE.md`。

## 1. 架构概览

纯前端单页应用 + 一个本地代理脚本，无后端、无框架、无构建（`npm` 仅用于跑单测）。
逻辑/样式已外联为多文件（P10），但仍是 classic 脚本 + 同目录相对路径，双击 `file://` 可运行。

```
┌──────────────────────────── 浏览器 ────────────────────────────┐
│  表现层   index.html <body> + styles.css：4 page + modal，切 .hidden │
│  逻辑层   js/*.js（classic 脚本，共享全局词法作用域，末尾 init()） │
│           core ├ discover ├ player ├ transcribe ├ vocab          │
│  纯函数   lib/text-utils.js（无 DOM/无全局依赖，可单测）          │
│  状态     全局 let 变量（js/core.js）+ localStorage（pcn_* 键）   │
└───────────┬───────────────────────────────────┬─────────────────┘
            │ 直连 / 第三方代理                   │ 本机代理（仅音频/封面）
            ▼                                     ▼
┌─────────────────────────┐         ┌──────────────────────────────┐
│ 第三方服务（免费/公共）  │         │ serve.ps1（本机 HttpListener） │
│ iTunes 搜索 / RSS 代理   │         │ 静态托管 + /audioproxy         │
│ Groq·HF STT / 翻译       │         │ 转发 Range/Content-Range       │
└─────────────────────────┘         └──────────────────────────────┘
```

### 组件职责
| 组件 | 职责 | 关键实现 |
|------|------|---------|
| `js/*.js`（core/discover/player/transcribe/vocab） | 全部业务逻辑与 DOM 操作 | classic 脚本，共享全局词法作用域，按主题分文件 |
| `lib/text-utils.js` | 可测纯函数（拼接/对齐/URL/错误分类） | 双用途加载：浏览器全局 + Node `import` |
| `serve.ps1` | 本机静态托管 + 音频代理 | `$root=$PSScriptRoot`，`/audioproxy` 转发 Range |
| localStorage | 全部持久化 | `pcn_settings/feeds/vocab/tr_*/tr_keys/last_play/artwork` |

## 2. 关键数据流

1. **发现→订阅**：iTunes 搜索 → `parseRSS`（5 级回退：自定义代理→bird.ioliu→直连→codetabs→rss2json）→ 剧集列表。
2. **播放→转录**：`<audio>` 播放 → `groqTranscribeProgressive`：经 `/audioproxy` 用 Range 按 8MB 分段下载（优先当前播放位置所在段）→ Groq `whisper-large-v3-turbo` 转写 → 按时间戳插入 `chunks`。
3. **翻译**：`translateRange` 分批并发 → 腾讯（熔断保护）→ MyMemory 批量（`splitAligned` 校验）→ 逐段兜底，保证行对齐。
4. **呈现**：双语字幕跟随 `timeupdate`；`subtitleOffset` + `autoAlignSubtitles`（音频能量扫描）校正时间。
5. **缓存**：转写结果按 `trKey(ep)` 存 `pcn_tr_*`，`pcn_tr_keys` 维护 LRU；配额满淘汰最旧。

## 3. 合理性评估

### 合理之处 ✅
- **零部署 / 零成本 / 隐私友好**：无后端，API token 只存用户本地 localStorage，服务端不经手。
- **离线优先的缓存**：转写结果落盘 + LRU，重复打开秒出。
- **韧性设计**：RSS 多级回退、翻译三级降级、分段渐进转写并优先当前播放位置——在不可靠的免费服务上尽量保证可用。
- **新引入的可测缝**：纯逻辑抽到 `lib/`，零依赖单测，回归成本低。

### 张力与不足 ⚠️
1. **"双击即用"与本机代理自相矛盾**：音频/封面/转录强依赖 `serve.ps1`（localhost:8080）。纯 `file://` 打开时这条链路降级或失效——架构存在"半本地半纯前端"的割裂（P2 已做成可配置，但依赖未消除）。
2. **强耦合不可控的第三方端点**：腾讯 `transmart` 为未公开内部接口、公共 CORS 代理随时可能限流/下线。可用性建立在外部善意之上。
3. **无 Provider 抽象层**：STT/翻译/代理的具体实现与业务流程交织，换源需改流程代码（已开始用 `lib/` 抽纯函数，但尚无统一 provider 接口）。
4. **可变全局状态**：`curEp/chunks` 等为模块级可变量；异步回写竞态已用 `_epoch` 代次令牌治理（P13✅），但状态仍分散在全局变量，缺集中管理。
5. ~~**单文件 ~2800 行**~~：已按主题拆为 `js/*.js` + `styles.css`（P10✅，无构建、双击仍可用）；测试覆盖仍以抽出的纯函数为主。**残留**：CSP 因 body 内大量内联 `onclick` 仍需 `'unsafe-inline'`。
6. **隐私经第三方代理**：RSS/翻译经公共代理，feed URL 与文本对第三方可见。

> 总体判断：**对"个人自用、零成本、可离线缓存"的定位是合理且务实的**；主要技术债集中在「外部依赖韧性」「provider 抽象」「异步竞态」三处，均可渐进治理，无需推倒重来。

## 4. 风险登记与预防

| 风险 | 可能性 | 影响 | 预防 / 缓解方案 | 关联 |
|------|:---:|:---:|----------------|------|
| 腾讯/公共代理/rss2json 等端点失效 | 高 | 高 | 多源回退（部分已做）；自建 Cloudflare Worker 代理；统一 provider 接口便于换源 | P3✅/P4 |
| 本机 serve.ps1 未运行 → 转录/封面失效 | 中 | 高 | 代理地址可配置（P2✅）；音频下载多级回退含公共代理兜底（P4✅）；无代理时明确降级提示；可提供托管 Worker | P2✅/P4✅ |
| API token 泄露（localStorage / XSS） | 低 | 高 | 已审计 31 处 innerHTML，消除 5 处 onerror XSS（`imgFallback`），CSS url 走 `safeCssUrl`，加 CSP + 安全头，token 经 `redactSecrets` 不入日志（P14✅）；**残留** CSP `script-src 'unsafe-inline'`（内联 onclick 所限） | P14✅ |
| 异步竞态写入过期转写/翻译 | 中 | 中 | `_epoch` 代次令牌（P13✅）：`loadEp` +1，回写前 `staleEpoch(ep)` 校验，过期即放弃 | P13✅ |
| Groq 429 / MyMemory 日额度 | 中 | 中 | Groq 429/5xx 退避重试（P5✅，`Retry-After`+指数退避+抖动）；批量+填邮箱提额；逐段兜底防整批失败 | P5✅ |
| Whisper 无时间戳 → 字幕错位 | 中 | 中 | 统一 `approxChunks` 标记近似（P6✅），UI 显示 `~`+提示条，自动对齐跳过并引导手动 `subtitleOffset` 校正 | P6✅ |
| localStorage 配额耗尽 | 中 | 低 | 转写已 LRU；写入做配额感知 try/catch；缓存键版本化 + 启动清旧（P11✅，`TR_CACHE_VERSION`/`pruneOldCache`） | P11✅ |
| 单文件膨胀致回归 | 中 | 中 | 已拆 `js/*.js`+`styles.css`（P10✅，无构建）；持续抽纯函数到 `lib/` 并补单测；冒烟守回归 | P10✅ |
| 浏览器 TTS 音质/差异 | 低 | 低 | 守"无付费 API"原则保持浏览器引擎；自动优选 Edge Natural 神经网络音色、贬低机械音色 + 统一调校（P8✅，路线一）；云端/自建 Worker 路线按决策不做 | P8✅ |

## 5. 演进建议（与 ROADMAP 呼应）
- **近期**：补齐外部依赖韧性（P4 多代理回退、P5 退避），低风险高收益。
- **中期**：抽 **provider 接口**（STT/翻译/代理三类），把"换源/熔断/重试"收敛到一处；加 **epoch 取消**根治竞态。
- **持续**：纯逻辑下沉 `lib/` + 单测；安全侧补一次 innerHTML/CSP 审计。

## 变更记录
- 2026-06-17 首版：梳理现状、评估、风险与预防。
