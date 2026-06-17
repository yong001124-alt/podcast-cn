# 贡献指南 · 播客中文

欢迎贡献！动手前请先读这份指南——本项目有几条**硬约束**，PR 若违反会被退回。

## 不可破坏的原则

- **纯前端、无构建、无运行时依赖、无框架**——浏览器双击 `index.html` 必须能跑。
- **不引入付费 API**：转写/翻译/TTS 一律走免费或公共额度服务，或浏览器内置能力。
- **不引入构建工具 / npm 运行时依赖 / 前端框架**。唯一的 `npm` 用途是 `npm test`（Node 内置 `node --test`，无需 `npm install`）。
- 全部 `js/*.js` 是 **classic 脚本**，相对路径加载（`file://` 可用），**不要**改成 ES module / 打包。

## 开发环境

```powershell
git clone https://github.com/yong001124-alt/podcast-cn.git
cd podcast-cn
powershell -File .\serve.ps1     # 本地服务 + /audioproxy
# 浏览器打开 http://localhost:8080
```

结构总览见 [README.md](README.md)，详细约定与架构见 [CLAUDE.md](CLAUDE.md) / [ARCHITECTURE.md](ARCHITECTURE.md)。

## 测试（提 PR 前必须全绿）

```powershell
npm test     # 纯函数单测（node --test，零依赖）—— CI 门禁，必须通过

# 浏览器冒烟（经 webapp-testing 起 serve.ps1）
python <webapp-testing>/scripts/with_server.py `
  --server "powershell -File .\serve.ps1" --port 8080 `
  -- python tests\e2e\smoke.py
```

- 新增**可测纯逻辑**→ 放进 `lib/text-utils.js`（文件末尾 `globalThis.fn = fn` 双用途），并在 `tests/*.test.js` 补单测。
- 新增/改动 **UI 流程** → 同步在 `tests/e2e/smoke.py` 加断言。

## 代码约定（务必遵守）

- **全局名跨文件唯一**：`js/*.js` 共享同一全局词法作用域，顶层 `function`/`let`/`const` 重名会 `SyntaxError`。新逻辑放进对应主题的 `js/` 文件（core/discover/player/transcribe/vocab）。
- **批量翻译保持行对齐**：用 `joinForBatch` 折叠段内换行，`splitAligned` 校验段数，不匹配降级逐段，**绝不静默错位**。
- **异步回写须防竞态**：入口 `const ep = _epoch`，回写 `chunks`/全局前 `staleEpoch(ep)` 校验，过期即放弃（P13）。
- **安全（P14）**：写进 DOM 的外部数据一律 `esc()`；图片地址进 CSS `url()` 用 `safeCssUrl`/`setAmbient`，加载失败回退用 `imgFallback`（data-* + textContent）；**绝不**在 `onerror`/内联事件里用外部数据拼 HTML。
- **可点击的非按钮元素**（`<div onclick>` 卡片/列表）必须加 `tabindex="0" role="button" data-kbd` + `aria-label`——`init()` 的全局 keydown 委托会让其支持 Enter/Space（无障碍）。
- **改转写缓存格式**且不兼容旧数据 → `TR_CACHE_VERSION` +1（`lib/text-utils.js`）。
- **列宽**走 CSS 变量 `--col`，勿硬编码；持久化 key 一律 `pcn_` 前缀。
- **UI 文案用中文**；代码注释中英皆可。

## 提交与 PR

- 提交信息清晰、聚焦单一改动；分支提 PR 而非直接推 `main`。
- PR 会自动跑 CI（`npm test`）——**绿了才合并**；涉及 UI 的请附冒烟结果/截图。
- 提交署名沿用仓库现有 trailer 习惯。

谢谢贡献 🙏
