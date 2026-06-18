# 更新日志

本项目的所有显著变更记录于此。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- _暂无_

### Changed
- _暂无_

### Fixed
- _暂无_

### Security
- _暂无_

## [0.1.0] - 2026-06-18

首个发布。英文播客翻译 Web App：纯前端、无后端、无构建，双击 `index.html` 即用。

### Added
- 核心流程：发现/搜索（iTunes）、转写（Groq `whisper-large-v3-turbo` / HuggingFace / 手动粘贴字幕）、翻译（腾讯 → MyMemory，批量保持行对齐）、双语字幕对照、中文 TTS 跟读、生词本。
- 健壮性：音频下载多级回退（区分 Range / 全量来源）、Groq 429/5xx 退避重试（Retry-After + 指数退避 + 抖动）、无时间戳时近似估算并标注。
- 体验：音频代理地址可配置、首次无 Token 引导卡 + 粘贴通道、诊断日志导出（脱敏）、中文 TTS 自动优选神经网络音色。
- 无障碍：键盘全可达（卡片/列表 Enter/Space）、`:focus-visible` 焦点环、`prefers-reduced-motion`、`aria-label`。
- 工程：纯函数抽到 `lib/text-utils.js`（72 个 Node 单测）、Playwright 浏览器冒烟（25 项）、GitHub Actions CI、无构建多文件拆分（`styles.css` + `js/*.js`）、转写缓存键版本化、Cloudflare Worker 音频代理（`worker/`，带来源白名单）、GitHub Pages 在线 Demo。
- 文档/社区：README（徽章 + 在线 Demo）、CLAUDE / ARCHITECTURE / ROADMAP / DELIVERY、CONTRIBUTING、SECURITY（含私密漏洞报告）、CODE_OF_CONDUCT、Issue/PR 模板、`.editorconfig`、`.gitattributes`、MIT License。

### Fixed
- 批量翻译行错位：`joinForBatch` + `splitAligned` + 逐段兜底，绝不静默错位。
- 切换剧集时的异步竞态：`_epoch` 代次令牌，回写前 `staleEpoch` 校验，过期即放弃。

### Security
- 消除 5 处 `onerror` 内拼外部数据的 XSS（改用 `imgFallback`）；CSS `url()` 经 `safeCssUrl`；加 meta CSP + `serve.ps1` 安全响应头；诊断导出经 `redactSecrets` 脱敏；Worker `Origin` 白名单。

[Unreleased]: https://github.com/yong001124-alt/podcast-cn/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yong001124-alt/podcast-cn/releases/tag/v0.1.0
