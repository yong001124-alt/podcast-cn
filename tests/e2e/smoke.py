"""浏览器冒烟测试（Playwright）。验证 app 能正常启动且关键 UI 流程可用。

运行（由 with_server.py 自动起 serve.ps1）：
  python ../../../../.claude/skills/webapp-testing/scripts/with_server.py \
    --server "powershell -File D:\\my-project\\podcast-cn\\serve.ps1" --port 8080 \
    -- python smoke.py

覆盖：① 启动无 JS 错误 ② 发现页渲染 ③ 设置含 audioProxy 字段(P2) + 诊断导出/脱敏(P9)
     ④ 缓存清旧(P11) ⑤ 安全：CSP + imgFallback 防注入 + setAmbient 拒非 http(P14)
     ⑥ 中文 TTS 音色优选 + 配置不抛错(P8) ⑦ 卡片键盘可操作(无障碍) ⑧ 首次引导卡(P7) + 改用粘贴通道 ⑨ 粘贴弹窗
纯逻辑（对齐/退避/近似/epoch/脱敏/缓存键/CSS-URL/音色评分 等）由 Node 单测覆盖，这里只验证浏览器层。
"""
import sys
from playwright.sync_api import sync_playwright

# Windows 控制台默认非 UTF-8，强制 UTF-8 输出避免中文乱码
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = "http://localhost:8080/"
js_errors = []       # 真正的 JS 未捕获异常（pageerror）—— 视为代码 bug
console_errors = []  # console.error —— 过滤掉离线环境的网络资源加载失败后才算 bug
checks = []          # (名称, 是否通过)

# 离线测试环境无外网，init 拉取封面/RSS 必然失败，这类属环境噪声而非代码缺陷
NETWORK_NOISE = ("Failed to load resource", "ERR_NAME_NOT_RESOLVED",
                 "ERR_CONNECTION", "ERR_INTERNET", "net::ERR", "status of 4", "status of 5")


def is_noise(msg):
    return any(s in msg for s in NETWORK_NOISE)


def check(name, ok):
    checks.append((name, ok))
    print(("  PASS " if ok else "  FAIL ") + name)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: js_errors.append(str(e)))

    page.goto(BASE)
    # 不等 networkidle（init 会发起封面/RSS 请求可能长时间不空闲），给 JS 充分执行时间
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_timeout(1500)

    # ① 标题正确
    check("页面标题为播客中文", "播客中文" in page.title())

    # ② 发现页可见
    discover = page.locator("#page-discover")
    check("发现页存在且可见", discover.count() == 1 and discover.is_visible())

    # ③ 设置弹窗 + audioProxy 字段(P2)
    page.evaluate("openSettings()")
    page.wait_for_timeout(200)
    settings_visible = page.locator("#settingsOverlay").is_visible()
    audio_proxy = page.locator("#audioProxy").count() == 1
    check("设置弹窗可打开", settings_visible)
    check("设置含 audioProxy 字段(P2)", audio_proxy)
    # 诊断日志导出(P9)：按钮存在 + logErr 写入环形缓冲 + 报告脱敏
    has_export = page.locator("text=导出诊断").count() == 1
    check("设置含「导出诊断」按钮(P9)", has_export)
    page.evaluate("closeSettings()")
    diag = page.evaluate(
        "() => { logErr('test', new Error('boom gsk_secret123')); "
        "return formatDiagnostics({errlog: _errlog, settings: {groqToken:'gsk_secret123'}, version: APP_VERSION}); }"
    )
    check("logErr 写入并可生成诊断报告(P9)", "test:" in diag and "错误日志" in diag)
    check("诊断报告脱敏 Token(P9)", "gsk_***" in diag and "gsk_secret123" not in diag)
    page.evaluate("clearErrLog()")
    check("clearErrLog 清空日志(P9)", page.evaluate("() => _errlog.length") == 0)
    # 缓存版本化(P11)：旧版本键被 pruneOldCache 清理，当前版本键保留
    prune = page.evaluate(
        "() => { const cur = 'pcn_tr_' + TR_CACHE_VERSION + '_keep';"
        " localStorage.setItem('pcn_tr_v0_old', '[1]');"
        " localStorage.setItem(cur, '[2]');"
        " localStorage.setItem('pcn_tr_keys', JSON.stringify(['pcn_tr_v0_old', cur]));"
        " pruneOldCache();"
        " return { oldGone: localStorage.getItem('pcn_tr_v0_old') === null,"
        "          curKept: localStorage.getItem(cur) === '[2]',"
        "          idx: JSON.parse(localStorage.getItem('pcn_tr_keys')) }; }"
    )
    check("pruneOldCache 删除旧版本缓存键(P11)", prune["oldGone"])
    check("pruneOldCache 保留当前版本缓存键(P11)", prune["curKept"])
    check("pruneOldCache 收敛索引到当前版本(P11)", prune["idx"] == [f"pcn_tr_{page.evaluate('TR_CACHE_VERSION')}_keep"])
    # 安全审计(P14)：CSP 存在 + imgFallback 不执行注入 + setAmbient 拒绝非 http(s)
    check("存在 CSP meta(P14)", page.locator("meta[http-equiv='Content-Security-Policy']").count() == 1)
    xss = page.evaluate(
        "() => { const box = document.createElement('div'); box.id='__t14';"
        " const img = document.createElement('img');"
        " img.dataset.phClass='pod-placeholder'; img.dataset.phCol='red';"
        " img.dataset.phIni='<img src=x onerror=window.__xss=1>';"
        " box.appendChild(img); document.body.appendChild(box); imgFallback(img);"
        " const ph = box.querySelector('.pod-placeholder');"
        " return { safe: !!ph && ph.textContent.includes('<img') && ph.querySelector('img') === null,"
        "          fired: !!window.__xss }; }"
    )
    check("imgFallback 以 textContent 渲染、不执行注入(P14)", xss["safe"] and not xss["fired"])
    amb = page.evaluate(
        "() => { const d = document.createElement('div'); setAmbient(d, 'javascript:alert(1)');"
        " const rejected = d.style.backgroundImage === '';"
        " setAmbient(d, 'https://x/a.jpg');"
        " return { rejected, accepted: d.style.backgroundImage.includes('https://x/a.jpg') }; }"
    )
    check("setAmbient 拒绝非 http(s)、放行 https(P14)", amb["rejected"] and amb["accepted"])
    # 中文 TTS 音色优选(P8)：pickBestZhVoice 选神经网络音色 + configZhUtterance 不抛错
    tts = page.evaluate(
        "() => { const list = ["
        "  {name:'Microsoft David - English (US)', lang:'en-US', localService:true},"
        "  {name:'Microsoft Huihui - Chinese', lang:'zh-CN', localService:true},"
        "  {name:'Microsoft Xiaoxiao Online (Natural) - Chinese', lang:'zh-CN', localService:false} ];"
        " const best = pickBestZhVoice(list);"
        " let ok = false; try { const u = configZhUtterance('你好', 0.95);"
        "   ok = !!u && u.lang === 'zh-CN' && Math.abs(u.rate - 0.95) < 0.01; } catch(e) { ok = false; }"
        " return { best, configOk: ok }; }"
    )
    check("pickBestZhVoice 选中神经网络音色(P8)", "Natural" in tts["best"])
    check("configZhUtterance 配置朗读不抛错(P8)", tts["configOk"])
    # 卡片键盘可操作（无障碍打磨）：pod-card 有 role/tabindex + Enter 触发导航
    kbd = page.evaluate(
        "() => { const c = document.querySelector('.pod-card'); if (!c) return {found:false};"
        " const ok = c.getAttribute('role')==='button' && c.getAttribute('tabindex')==='0' && c.hasAttribute('data-kbd');"
        " c.focus(); c.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));"
        " const d = document.getElementById('page-detail');"
        " const shown = !!d && !d.classList.contains('hidden');"
        " showPage('discover');"
        " return {found:true, attrs:ok, shown}; }"
    )
    check("卡片含 role/tabindex/data-kbd(无障碍)", kbd.get("found") and kbd.get("attrs"))
    check("卡片 Enter 键可触发导航(无障碍)", kbd.get("shown"))

    # ④ 首次引导卡(P7)
    page.evaluate("openOnboard()")
    page.wait_for_timeout(200)
    onboard = page.locator("#onboardOverlay")
    onboard_txt = onboard.inner_text() if onboard.is_visible() else ""
    check("引导卡可打开", onboard.is_visible())
    check("引导卡含获取步骤(Create API Key)", "Create API Key" in onboard_txt)
    check("引导卡含 gsk_ 提示", "gsk_" in page.locator("#onboardToken").get_attribute("placeholder"))
    # 「改用粘贴字幕」→ 切到粘贴弹窗（无 token 通道）
    page.click("text=改用粘贴字幕（无需 Token）")
    page.wait_for_timeout(200)
    check("点「改用粘贴字幕」后弹出粘贴弹窗", page.locator("#pasteOverlay").is_visible())
    check("点「改用粘贴字幕」后引导卡关闭", not onboard.is_visible())
    page.evaluate("closePaste()")

    # ⑤ 无真正的 JS 异常（未捕获异常 + 排除网络噪声后的 console.error）
    code_console_errors = [e for e in console_errors if not is_noise(e)]
    check("无未捕获 JS 异常", len(js_errors) == 0)
    check("无代码相关 console 错误（已排除离线网络噪声）", len(code_console_errors) == 0)

    page.screenshot(path="smoke_result.png", full_page=True)
    browser.close()

print("\n=== 冒烟结果 ===")
failed = [n for n, ok in checks if not ok]
noise = [e for e in console_errors if is_noise(e)]
if noise:
    print(f"（已忽略 {len(noise)} 条离线网络噪声，如封面/RSS 加载失败）")
if js_errors:
    print("未捕获 JS 异常：")
    for e in js_errors:
        print("  - " + e)
code_console = [e for e in console_errors if not is_noise(e)]
if code_console:
    print("非噪声 console 错误：")
    for e in code_console:
        print("  - " + e)
if failed:
    print(f"FAILED {len(failed)}/{len(checks)}: " + "; ".join(failed))
    sys.exit(1)
print(f"ALL PASS ({len(checks)}/{len(checks)})；截图 smoke_result.png")
