// Cloudflare Worker：音频代理，等价于 serve.ps1 的 /audioproxy。
// 让浏览器（含 GitHub Pages 上的在线 Demo）能跨域、按 Range 取播客音频用于转写。
//
// 契约（与 lib/text-utils.js 的 buildAudioProxyUrl 一致）：
//   GET <worker-url>/?url=<编码后的目标音频URL>[&maxbytes=N]
//   • 透传请求的 Range 头 / 回传上游的 Content-Range —— 支持“只下前 N 字节做字幕对齐”
//   • 加 CORS（Access-Control-Allow-Origin: *），解决跨域
//
// 部署见同目录 README.md；部署后把 Worker 地址填进 App 设置「音频代理地址」即可。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const u = new URL(request.url);
    const target = u.searchParams.get('url');
    const maxbytes = parseInt(u.searchParams.get('maxbytes') || '0', 10) || 0;

    // 仅放行 http(s) 目标，避免被当作任意内网探测/SSRF 入口
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response('missing or invalid "url" query param', { status: 400, headers: CORS });
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
      return new Response('upstream fetch failed: ' + e, { status: 502, headers: CORS });
    }

    const headers = new Headers(CORS);
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
