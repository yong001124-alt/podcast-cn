# 项目排期 · 播客中文

> 实时维护。状态：✅完成 / 🔄推进中 / ⬜未开始 / ⚠️有风险
> 最近更新：2026-06-17

## 总览

| 批次 | 项 | 状态 | 备注（要做的事） |
|------|----|------|------------------|
| 阶段0 | 测试底座 | ✅ | `npm test`（Node 内置 runner，零依赖）；纯函数抽到 `lib/text-utils.js`；20 个单测 |
| 阶段1 | P1 翻译行错位 | ✅ | `joinForBatch`+`splitAligned`+逐段兜底，绝不静默错位；单测覆盖 |
| 阶段1 | P2 代理硬编码 | ✅ | 抽成 `settings.audioProxy`，加设置项，`buildAudioProxyUrl` |
| 阶段1 | P3 腾讯接口 | ✅⚠️ | 已加会话级熔断；**风险**：未公开内部接口随时可能失效，仅靠 MyMemory 兜底 |
| 阶段2 | P4 audioproxy 多代理回退 | ✅ | 分段/探测仅用 Range 来源（本机代理+直连）；全量降级扩展 codetabs+自定义代理；纯函数 `audioRangeSources`/`audioFullDownloadSources`，单测覆盖 |
| 阶段2 | P5 Groq 429 退避重试 | ✅ | 429/5xx 退避重试（优先 `Retry-After`，否则指数退避+抖动，最多 4 次）；纯函数 `backoffDelayMs`/`parseRetryAfterMs`/`isRetriableStatus`，单测覆盖 |
| 阶段2 | P6 Whisper 时间戳近似 | ✅ | 无 segment 时统一走 `approxChunks` 并标记 `approx`；UI 显示 `~` + 提示条；自动对齐对近似数据跳过并引导手动 `−/+` 校正；纯函数 `splitSentences`/`approxChunks` 单测覆盖 |
| 阶段3 | P7 首次 token 引导 | ✅ | 无 token 时弹引导卡（三步获取 Groq token + 直达链接 + 内嵌输入），并提供「改用粘贴字幕」无 token 通道；`hasAnyToken` 单测覆盖 |
| 阶段3 | P9 错误日志导出 | ✅ | 环形缓冲 `pcn_errlog`（最多 50 条）+ `setStatus('err')`/未捕获异常自动入库；设置里「导出诊断」下载脱敏纯文本（Token/邮箱抹除）；纯函数 `redactSecrets`/`pushErrLog`/`formatDiagnostics` 单测覆盖 |
| 阶段4 | Playwright 浏览器冒烟 | ✅ | `tests/e2e/smoke.py`，23 项检查全绿；验证启动无 JS 异常 + 发现页 + 设置(P2) + 诊断导出/脱敏(P9) + 缓存清旧(P11) + 安全(CSP/防注入/CSS-URL，P14) + TTS 音色优选(P8) + 引导卡(P7) + 粘贴通道；离线网络失败已识别为噪声 |
| 阶段4 | P11 缓存键版本化 | ✅ | `trKey` 加版本前缀 `pcn_tr_<ver>_`（`TR_CACHE_VERSION`，格式不兼容时 +1）；启动 `pruneOldCache` 删旧版本键并收敛索引，防脏数据喂回 UI；纯函数 `staleTrKeys` 单测覆盖 |
| 阶段4 | P10 拆分多文件 | ✅ | 无构建方案：CSS→`styles.css`，JS→`js/{core,discover,player,transcribe,vocab}.js`（classic 脚本，共享全局词法作用域，`init()` 末尾调用）；保持双击 `file://` 可运行、零运行时依赖；冒烟 21/21 验证无回归 |
| 阶段4 | P8 中文 TTS 音质 | ✅ | 用户选「路线一·音色优选+调校」（纯前端零依赖）：`pickBestZhVoice`/`scoreZhVoice` 自动优选 Edge Natural 神经网络音色、贬低机械音色，设置里高品质置顶并标 ★，`configZhUtterance` 统一调校；路线二/三（云端/自建 Worker）按决策不做。纯函数单测 + 冒烟覆盖 |
| 阶段3 | P13 异步竞态 | ✅ | `_epoch` 代次令牌，`loadEp` 切换即 +1；转录/翻译全链路捕获并在回写前 `staleEpoch(ep)` 校验，过期即放弃；纯函数 `isStaleEpoch` 单测覆盖 |
| 阶段4 | P14 安全审计 | ✅ | 审计 31 处 `innerHTML`：消除 5 处 `onerror` 内用外部标题拼 HTML 的 XSS（改 `imgFallback` data-* + textContent）；CSS `url()` 走 `safeCssUrl`（仅 http(s)+转义）；加 meta CSP（锁 object/base/form）+ serve.ps1 安全头（X-Frame-Options/nosniff/frame-ancestors）；token 经 `redactSecrets` 不入日志；纯函数 `safeCssUrl` 单测覆盖。**残留**：脚本因单文件内联处理器暂留 `'unsafe-inline'`，彻底外联化随 P10 |
| —    | 免费第三方服务依赖 | ⚠️ | 全链路依赖免费/公共额度（rss2json/MyMemory/bird.ioliu/Groq/HF），任一变动即断，属持续性风险 |

## 当前焦点
- **阶段 0–4 全部交付并验证**（72 Node 单测 + 23 项浏览器冒烟全绿）。P1–P14 已全部完成或按决策收口。
- **可选后续项**：收紧 CSP——P10 已外联 JS，但 CSP 仍含 `script-src 'unsafe-inline'`（body 内大量 `onclick=""` 内联处理器 + 末尾 `init()`）。彻底去掉 = 把内联处理器全改 `addEventListener`，工作量大、收益边际，留待需要时再做。
- 持续性风险：全链路依赖免费/公共第三方服务（见下表末行），属长期监控项而非可"完成"项。
- 后续 UI 改动应同步扩充 `tests/e2e/smoke.py`。

## 风险登记（⚠️）
1. **P3 腾讯接口**：未公开 API，可能随时失效/被封；缓解=熔断+MyMemory 兜底，但译质会降。
2. **免费服务额度**：MyMemory 5k/天、rss2json 限次等；缓解=多源回退（部分已做）。
3. **Playwright 体积**：浏览器下载较大，端到端冒烟待用户确认后再装。
4. **P8 TTS 决策点**：音质提升的最优解需付费 API，与项目原则冲突，需用户拍板。
5. ~~**P13 异步竞态**~~：已解决（epoch 代次令牌，回写前 `staleEpoch` 校验）。
6. ~~**P14 安全**~~：已审计——消除 5 处 onerror XSS、CSS url 走 `safeCssUrl`、加 CSP + 安全头。**残留**：脚本 CSP 仍含 `'unsafe-inline'`（单文件内联处理器所限），随 P10 外联后收紧。
> 完整风险矩阵（可能性/影响/方案）见 `ARCHITECTURE.md` 第 4 节。

## 变更记录
- 2026-06-17 建表；阶段0+阶段1（P1/P2/P3）完成。
- 2026-06-17 架构评审后新增 P13（异步竞态）、P14（安全审计）两项；详见 `ARCHITECTURE.md`。
- 2026-06-17 阶段2-P4 完成：音频下载多级回退（区分 Range / 全量来源），单测 25/25。
- 2026-06-17 阶段2-P5 完成：Groq 429/5xx 退避重试（Retry-After + 指数退避+抖动），单测 33/33。
- 2026-06-17 阶段2-P6 完成：近似时间戳统一 `approxChunks` + UI 标注 + 自动对齐跳过，单测 41/41。阶段2 收官。
- 2026-06-17 阶段3-P13 完成：epoch 代次令牌根治切换剧集的异步竞态回写，单测 44/44。
- 2026-06-17 阶段3-P7 完成：首次无 token 弹引导卡 + 粘贴模式通道，单测 46/46。
- 2026-06-17 配置根治：项目级 `.claude/settings.json` 加 `npm test`/`serve.ps1`/Playwright 冒烟的精确放行规则，绕开偶发分类器报错。
- 2026-06-17 阶段3-P9 完成：错误环形缓冲 + 诊断导出（脱敏），单测 54/54，冒烟 15/15。阶段3 收官。
- 2026-06-17 阶段4-P11 完成：转写缓存键版本化 + 启动清理旧版本，单测 58/58，冒烟 18/18。
- 2026-06-17 阶段4-P14 完成：消除 5 处 onerror XSS（`imgFallback`）+ CSS url 安全化（`safeCssUrl`）+ CSP/安全头，单测 63/63，冒烟 21/21。
- 2026-06-17 阶段4-P10 完成：无构建拆分多文件（styles.css + js/{core,discover,player,transcribe,vocab}.js），保持双击可运行，冒烟 21/21 无回归。
- 2026-06-17 阶段4-P8 完成：中文 TTS 路线一（音色优选+调校，`pickBestZhVoice`/`scoreZhVoice`/`configZhUtterance`），单测 72/72，冒烟 23/23。**阶段4 收官，P1–P14 全部完成。**
- 2026-06-18 界面打磨（两轮）：① 布局列宽变量 `--col`（宽屏 680px）+ `--text3` 提对比；② 无障碍——`:focus-visible` 焦点环、`prefers-reduced-motion`、图标按钮 `aria-label`、可点击卡片/列表 `tabindex+role+data-kbd` 全局 Enter/Space 委托；③ `accent-color` 品牌色。冒烟增至 25/25。
