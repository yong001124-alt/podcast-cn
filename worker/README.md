# 音频代理 Worker（让在线 Demo 也能转写）

[GitHub Pages 上的在线 Demo](https://yong001124-alt.github.io/podcast-cn/) 默认无法做**在线音频转写**——它原本依赖本机 `serve.ps1` 的 `/audioproxy`（云端没有、且 https 页面访问不了 `http://localhost`）。

把这个 Cloudflare Worker 部署上去（免费额度足够个人用），它等价于 `serve.ps1` 的 `/audioproxy`：转发 `Range`、回传 `Content-Range`、加 CORS。部署后在 App 设置里填上它的地址，Demo 即可转写在线播客。

## 部署（任选其一）

### A. wrangler CLI（推荐）
```bash
cd worker
npx wrangler login      # 首次：浏览器授权你的 Cloudflare 账号
npx wrangler deploy     # 部署，结束后打印 https://podcast-cn-audioproxy.<子域>.workers.dev
```

### B. Cloudflare 控制台（无需本地工具）
1. 登录 <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Create Worker**。
2. 把 `audioproxy.js` 的内容整段粘贴进编辑器，**Deploy**。
3. 记下分配的 `*.workers.dev` 地址。

## 接入 App
打开 App（本地或 Demo）→ ⚙ **设置** → **音频代理地址** 填：
```
https://podcast-cn-audioproxy.<你的子域>.workers.dev
```
保存即可。转写时 App 会经此 Worker 按 Range 拉取音频分段（契约见 `lib/text-utils.js` 的 `buildAudioProxyUrl`：`?url=<编码URL>[&maxbytes=N]`）。

## 契约
```
GET <worker>/?url=<URL-encoded 音频地址>[&maxbytes=N]
  • 透传 Range → 回传 Content-Range（分段下载）
  • maxbytes：无 Range 时只取前 N 字节（字幕对齐用），上游忽略 Range 时在边缘截断
  • 响应带 Access-Control-Allow-Origin: *
```

## 来源白名单（已内置）
`audioproxy.js` 顶部的 `ALLOWED_ORIGINS` 只放行指定来源的浏览器请求，其余跨域来源一律 `403`——
防止别的站点把它当开放代理白嫖。默认放行：
```js
const ALLOWED_ORIGINS = [
  'https://yong001124-alt.github.io', // GitHub Pages 在线 Demo
  'http://localhost:8080',            // 本地 serve.ps1
];
```
- 换了自定义域名 / 其它部署地址，把对应来源加进这个数组再重新部署。
- 非浏览器请求（curl 等无 `Origin`）默认放行，方便自测。
- 仅靠 `Origin` 是**软防护**（命令行可伪造），用于挡住浏览器场景下别站的滥用；如需更强，
  再叠加目标 host 白名单或鉴权。

## ⚠️ 注意
- 免费额度：Workers 免费档每天 10 万次请求，个人转写远用不完。
- 仅放行 http(s) 目标（已内置），不会被当作内网探测入口。
