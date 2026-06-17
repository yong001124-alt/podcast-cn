# 交付总览 · 播客中文

> 截至 2026-06-17。详情见 `ROADMAP.md` / `ARCHITECTURE.md` / `CLAUDE.md`。

## 一句话
英文播客 → 转写 → 中译 → 双语对照 + 中文跟读 + 生词本的**纯前端 Web App**：无后端、无框架、无构建、零运行时依赖，双击 `index.html` 即可运行。

## 本轮交付（P1–P14 全部完成）
| # | 项 | 结果 |
|---|----|------|
| P1 | 翻译行错位 | `joinForBatch`/`splitAligned` + 逐段兜底，绝不静默错位 |
| P2 | 代理硬编码 | 抽成可配置 `settings.audioProxy` |
| P3 | 腾讯接口脆弱 | 会话级熔断，硬失败转 MyMemory |
| P4 | 音频下载单点 | Range 来源 + 全量多级回退（codetabs/自定义代理） |
| P5 | Groq 429 | 退避重试（Retry-After + 指数退避 + 抖动） |
| P6 | 时间戳缺失 | `approxChunks` 标记近似 + UI 提示 + 跳过自动对齐 |
| P7 | 首次无引导 | 无 token 弹引导卡 + 「改用粘贴字幕」通道 |
| P9 | 无错误上报 | 环形日志 `pcn_errlog` + 「导出诊断」(脱敏) |
| P10 | 单文件臃肿 | 无构建拆 `styles.css` + `js/*.js`（5 模块） |
| P11 | 缓存无版本 | 键加 `TR_CACHE_VERSION` + 启动清旧 |
| P13 | 异步竞态 | `_epoch` 代次令牌，回写前 `staleEpoch` 校验 |
| P14 | 安全 | 消除 5 处 onerror XSS + `safeCssUrl` + CSP + 安全头 |
| P8 | TTS 音质 | 自动优选 Edge Natural 神经网络音色 + 调校（纯前端） |

## 工程结构
```
index.html        标记 + <link> + 顺序加载脚本 + 末尾 init()
styles.css        全部 CSS
lib/text-utils.js 纯函数（双用途：浏览器 classic / Node import）
js/{core,discover,player,transcribe,vocab}.js  业务逻辑（共享全局词法作用域）
serve.ps1         本机静态托管 + /audioproxy（转发 Range）+ 安全头
tests/*.test.js   72 个 Node 单测（零依赖 node --test）
tests/e2e/smoke.py 23 项 Playwright 浏览器冒烟
```

## 质量门
- **72 Node 单测 + 23 浏览器冒烟全绿**；冒烟验证启动无 JS 异常、关键 UI 流程可用。
- 高频命令（npm test / serve.ps1 / 冒烟）已进项目 allowlist，跑测无打扰。

## 已知边界（非 bug，长期项）
1. **CSP 残留 `script-src 'unsafe-inline'`**：body 内大量内联 `onclick`；彻底去掉需改 `addEventListener`（工作量大、收益边际，按需再做）。
2. **依赖免费/公共第三方服务**（iTunes/rss2json/MyMemory/bird.ioliu/Groq/HF）：任一变动即可能断功能——监控项。
3. **「双击即用」与本机代理的张力**：在线音频/转录强依赖 `serve.ps1`（地址已可配，缺则降级提示）。
