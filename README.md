# 播客中文 · Podcast 中文

帮中文用户「听懂英文播客」的**纯前端 Web App**：搜索英文播客 → 转写英文字幕 → 翻译为中文 → 双语对照 + 中文 TTS 跟读 + 生词本。

> **核心约束**：纯前端、无后端、无框架、无构建、无 npm 运行时依赖——浏览器**双击 `index.html`** 即可运行。所有能力依赖免费/公共第三方服务，不引入任何付费 API。

## 功能

- 🔎 **发现 / 搜索**：内置精选目录 + iTunes 播客搜索
- 📝 **转写**：Groq `whisper-large-v3-turbo`（主，国内可访问）/ HuggingFace（备）；无 Token 也可「粘贴字幕」
- 🌐 **翻译**：腾讯（会话级熔断）→ MyMemory 兜底，批量保持行对齐
- 🎧 **双语播放**：双语字幕对照 + 中文 TTS 跟读（自动优选高品质中文音色）
- 📖 **生词本**：点词查释义（词形还原）、收藏、分页
- ♿ **无障碍**：键盘全可达、焦点环、`prefers-reduced-motion`、aria 标签

## 快速开始

直接双击 `index.html` 即可用；但**播放在线音频会遇到 CORS / Range 问题**，推荐用自带本地代理：

```powershell
# 在项目根目录启动本地服务（静态托管 + /audioproxy 音频代理 + 安全头）
powershell -File .\serve.ps1
# 浏览器打开：
#   http://localhost:8080
```

转写需要一个免费 **Groq Token**（设置 ⚙ 或首次引导卡里填，`gsk_` 开头，国内可访问）；
没有 Token 也能用「✏ 粘贴字幕」手动贴英文，照样翻译 + 双语 + 跟读。

## 项目结构

```
index.html         标记 + <link styles.css> + 顺序加载脚本 + init()
styles.css         全部样式（CSS 变量主题 + 无障碍）
lib/text-utils.js  纯函数（双用途：浏览器 classic / Node import，可单测）
js/
  core.js          状态 / 导航 / 设置 / 工具 / 缓存 / init
  discover.js      分类 / 搜索 / 详情 / RSS 解析
  player.js        播放 / 双语 / 字幕渲染 / TTS / 自动滚动
  transcribe.js    Groq+HF 转录 / 粘贴 / 翻译
  vocab.js         单词卡 / 生词本
serve.ps1          本机 HttpListener：静态托管 + /audioproxy（转发 Range）+ 安全头
tests/             Node 单测 + Playwright 浏览器冒烟
```

> `js/*.js` 均为 classic 脚本，共享同一全局词法作用域；按 `index.html` 中顺序加载，`init()` 末尾调用。

## 测试

```powershell
npm test           # 72 个纯函数单测（node --test，零依赖，无需 npm install）

# 浏览器冒烟（25 项，经 webapp-testing skill 起 serve.ps1）
python <webapp-testing>/scripts/with_server.py `
  --server "powershell -File .\serve.ps1" --port 8080 `
  -- python tests\e2e\smoke.py
```

## 文档

- [`CLAUDE.md`](CLAUDE.md) — 给协作者/AI 的项目说明与开发约定
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — 技术架构、合理性评估、风险登记与预防
- [`ROADMAP.md`](ROADMAP.md) — 排期与实时进度
- [`DELIVERY.md`](DELIVERY.md) — 交付总览

## 状态

P1–P14 全部完成，界面经两轮打磨。质量门：**72 Node 单测 + 25 浏览器冒烟全绿**。

> ⚠️ 全链路依赖免费/公共服务（iTunes / rss2json / MyMemory / bird.ioliu / Groq / HF），任一变动都可能影响功能——这是当前最大的稳定性风险。
