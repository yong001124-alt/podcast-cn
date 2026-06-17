# 安全策略

感谢帮助让「播客中文」更安全。

## 支持范围

本项目是滚动开发的单一应用，无版本化发布。**安全修复只针对 `main` 分支的最新代码**；请先在最新 `main` 上确认问题仍存在。

## 如何报告漏洞

**请不要在公开 Issue 里提交安全漏洞。** 走以下任一私密渠道：

1. **GitHub 私密漏洞报告（首选）**：仓库 **Security** 标签 → **Report a vulnerability**
   （需仓库已在 *Settings → Security* 开启「Private vulnerability reporting」；若看不到该入口，请用邮件）。
2. **邮件**：发送到 `yong001124@gmail.com`，标题注明 `[security] podcast-cn`。

报告请尽量包含：受影响文件/功能、复现步骤或 PoC、影响评估、以及（如有）修复建议。

我会尽力在 **72 小时内**确认收到，并在评估后与你沟通修复与披露节奏。请在修复发布前**暂不公开**细节（负责任披露）。

## 关注范围（In scope）

- 应用内的 XSS / 注入（DOM 写入、`innerHTML`、`onerror`、CSS `url()` 等）。
- 本地代理 `serve.ps1` 与 Cloudflare Worker（`worker/`）的 SSRF / 开放代理滥用 / 来源校验绕过。
- 用户 Token 处理：Token 仅存于浏览器 `localStorage`、**不应进入日志或诊断导出**（诊断已用 `redactSecrets` 脱敏）。
- 持久化数据（`pcn_*`）被恶意构造内容污染导致的执行/破坏。

## 不属于漏洞（Out of scope / 已知设计取舍）

- **依赖免费/公共第三方服务**（iTunes / rss2json / MyMemory / bird.ioliu / Groq / HF）本身的可用性或安全性——这是项目的已知稳定性风险，非本仓库漏洞。
- **CSP 仍含 `script-src 'unsafe-inline'`**：受单文件大量内联 `onclick` 所限，属已知取舍（彻底移除需将事件处理器全部外联，见 ROADMAP）。已通过 meta CSP + 安全响应头收紧 `object/base/form/frame` 等面。
- **音频代理 Worker 的 `Origin` 校验是软防护**：用于挡浏览器场景下别站滥用，命令行可伪造 `Origin`——已在 `worker/README.md` 标注。
- 用户自行泄露 Token、或在不受信任设备上使用导致的本地数据暴露。

## 现有安全措施（参考）

- 外部数据统一 `esc()` 转义；图片地址进 CSS 走 `safeCssUrl`/`setAmbient`，加载失败回退 `imgFallback`（`textContent`，不拼 HTML）。
- meta CSP + `serve.ps1` 安全响应头（`X-Frame-Options` / `X-Content-Type-Options` / `frame-ancestors`）。
- 诊断导出经 `redactSecrets` 脱敏，Token / 邮箱不入日志。
- 代理仅放行 `http(s)` 目标；Worker 带来源白名单。

详见 [`ARCHITECTURE.md`](ARCHITECTURE.md) 第 4 节风险登记。
