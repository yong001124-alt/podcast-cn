$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8080/')
$listener.Start()
Write-Host "Server ready at http://localhost:8080"

while ($listener.IsListening) {
    $ctx  = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath

    if ($path -eq '/audioproxy') {
        $targetUrl = $ctx.Request.QueryString['url']
        $maxBytes  = 0
        $mbParam   = $ctx.Request.QueryString['maxbytes']
        if ($mbParam) {
            $maxBytes = [int]$mbParam
        }

        $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')

        if ($ctx.Request.HttpMethod -eq 'OPTIONS') {
            $ctx.Response.StatusCode = 204
            $ctx.Response.Close()
            continue
        }

        if ($ctx.Request.HttpMethod -eq 'HEAD') {
            try {
                $ctx.Response.StatusCode = 200
                $ctx.Response.Close()
            } catch { }
            continue
        }

        try {
            $req           = [System.Net.HttpWebRequest][System.Net.WebRequest]::Create($targetUrl)
            $req.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            $req.Timeout   = 25000

            $rangeHeader = $ctx.Request.Headers['Range']
            if ($rangeHeader -and $rangeHeader -match 'bytes=(\d+)-(\d+)') {
                try {
                    $req.AddRange([long]$Matches[1], [long]$Matches[2])
                } catch { }
            }

            $webResp  = $req.GetResponse()
            $inStream = $webResp.GetResponseStream()

            $ctx.Response.StatusCode  = [int]$webResp.StatusCode
            $ctx.Response.ContentType = 'application/octet-stream'

            # Forward Content-Range so JS can extract total file size from 206 responses
            $crVal = $webResp.Headers['Content-Range']
            if ($crVal) {
                try { $ctx.Response.Headers.Add('Content-Range', $crVal) } catch { }
            }

            if ($webResp.ContentLength -ge 0) {
                $limitBytes = $webResp.ContentLength
                if ($maxBytes -gt 0 -and $maxBytes -lt $webResp.ContentLength) {
                    $limitBytes = [long]$maxBytes
                }
                $ctx.Response.ContentLength64 = $limitBytes
            }

            $buf   = New-Object byte[] 8192
            $total = 0
            $go    = $true

            while ($go) {
                if ($maxBytes -gt 0 -and $total -ge $maxBytes) {
                    break
                }
                $want = 8192
                if ($maxBytes -gt 0) {
                    $remain = $maxBytes - $total
                    if ($remain -lt 8192) {
                        $want = $remain
                    }
                }
                $n = $inStream.Read($buf, 0, $want)
                if ($n -le 0) {
                    break
                }
                try {
                    $ctx.Response.OutputStream.Write($buf, 0, $n)
                } catch {
                    $go = $false
                }
                $total += $n
            }

            $inStream.Close()
            $webResp.Close()
        } catch {
            $ctx.Response.StatusCode = 502
        }

        $ctx.Response.Close()
        continue
    }

    if ($path -eq '/') {
        $path = '/index.html'
    }
    $file = Join-Path $root $path.TrimStart('/')

    if (Test-Path $file -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext   = [System.IO.Path]::GetExtension($file)
        $mime  = 'application/octet-stream'
        if ($ext -eq '.html') { $mime = 'text/html; charset=utf-8' }
        if ($ext -eq '.js')   { $mime = 'application/javascript' }
        if ($ext -eq '.css')  { $mime = 'text/css' }
        $ctx.Response.ContentType     = $mime
        # 安全响应头（P14）：meta CSP 无法表达的 header-only 防护——禁内嵌(防点击劫持) + 禁 MIME 嗅探
        try {
            $ctx.Response.Headers.Add('X-Frame-Options', 'DENY')
            $ctx.Response.Headers.Add('X-Content-Type-Options', 'nosniff')
            $ctx.Response.Headers.Add('Content-Security-Policy', "frame-ancestors 'none'")
        } catch { }
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }

    $ctx.Response.Close()
}
