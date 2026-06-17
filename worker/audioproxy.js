// Cloudflare Worker：音频代理，等价于 serve.ps1 的 /audioproxy。
// 让浏览器（含 GitHub Pages 上的在线 Demo）能跨域、按 Range 取播客音频用于转写。
//
// 契约（与 lib/text-utils.js 的 buildAudioProxyUrl 一致）：
//   GET <worker-url>/?url=<编码后的目标音频URL>[&maxbytes=N]
//   • 透传请求的 Range 头 / 回传上游的 Content-Range —— 支持“只下前 N 字节做字幕对齐”
//   • 加 CORS —— 仅对 ALLOWED_ORIGINS 内的来源放行
//
// 部署见同目录 README.md；部署后把 Worker 地址填进 App 设置「音频代理地址」即可。

// ── 允许的来源（按需增删）──────────────────────────────────────
// 浏览器跨域 fetch 会带 Origin 头；不在此列表的来源一律 403（防被别站当开放代理白嫖）。
// 非浏览器请求（curl 等无 Origin）放行，便于自测；本机 file:// 的 Origin 为 "null"，
// 如需用 Worker 调试 file:// 页面可把 'null' 加进来（会放宽到任意本地文件页，谨慎）。
const ALLOWED_ORIGINS = [
  'https://yong001124-alt.github.io', // GitHub Pages 在线 Demo
  'http://localhost:8080',            // 本地 serve.ps1
];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    const allowed = !origin || ALLOWED_ORIGINS.includes(origin);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors(origin, allowed) });
    }
    // 浏览器跨域且来源不在白名单 → 拒绝
    if (!allowed) {
      return new Response('origin not allowed', { status: 403, headers: cors(origin, false) });
    }

    const u = new URL(request.url);
    const target = u.searchParams.get('url');
    const maxbytes = parseInt(u.searchParams.get('maxbytes') || '0', 10) || 0;

    // 仅放行 http(s) 目标，避免被当作任意内网探测/SSRF 入口
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response('missing or invalid "url" query param', { status: 400, headers: cors(origin, true) });
    }

    // 透传客户端 Range；若无 Range 但设了 maxbytes，则只取前 N 字节
    const fwd = new Headers();
    const clientRange = request.headers.get('Range');
    if (clientRange) fwd.set('Range', clientRange);
    else if (maxbytes > 0) fwd.set('Range', `bytes=0-${maxbytes - 1}`);
    fwd.set('User-Agent', 'Mozilla/5.0 (compatible; podcast-cn-audioproxy)');

    let upstream;
    try {
      upstream = await fetch(target, { method: 'GET', headers: fwd, redirect: 'follow' });
    } catch (e) {
      return new Response('upstream fetch failed: ' + e, { status: 502, headers: cors(origin, true) });
    }

    const headers = new Headers(cors(origin, true));
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
    for (const h of ['Content-Range', 'Accept-Ranges', 'Content-Length']) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }

    // 上游忽略 Range 返回 200 全量、但设了 maxbytes 时，在边缘截断，避免传整文件
    let body = upstream.body;
    if (maxbytes > 0 && !clientRange && upstream.status === 200 && body) {
      body = body.pipeThrough(capStream(maxbytes));
      headers.delete('Content-Length'); // 截断后长度不再准确
    }

    return new Response(body, { status: upstream.status, headers });
  },
};

// 构造 CORS 头：允许的来源回显其 Origin（无 Origin 回 *）；不允许则不带 ACAO。
function cors(origin, allowed) {
  const h = {
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Vary': 'Origin',
  };
  if (allowed) h['Access-Control-Allow-Origin'] = origin || '*';
  return h;
}

// 累计字节达到 limit 后停止的 TransformStream。
function capStream(limit) {
  let sent = 0;
  return new TransformStream({
    transform(chunk, controller) {
      if (sent >= limit) return;
      if (sent + chunk.byteLength <= limit) {
        controller.enqueue(chunk);
        sent += chunk.byteLength;
      } else {
        controller.enqueue(chunk.slice(0, limit - sent));
        sent = limit;
        controller.terminate();
      }
    },
  });
}
