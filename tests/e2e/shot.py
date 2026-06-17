"""临时：抓当前界面基线截图，供 UI 优化对比用。"""
import sys
from playwright.sync_api import sync_playwright
try: sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception: pass

BASE = "http://localhost:8080/"
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.wait_for_timeout(1500)

    # 1) 发现页
    pg.screenshot(path="ui_discover.png", full_page=True)

    # 2) 设置弹窗
    pg.evaluate("openSettings()")
    pg.wait_for_timeout(300)
    pg.screenshot(path="ui_settings.png", full_page=True)
    pg.evaluate("closeSettings()")

    # 3) 移动端宽度（375）下的发现页 —— 复用同一页（serve.ps1 单线程，避免并发客户端把它堵死）
    pg.set_viewport_size({"width": 375, "height": 812})
    pg.wait_for_timeout(500)
    pg.screenshot(path="ui_discover_mobile.png", full_page=True)

    b.close()
print("saved: ui_discover.png, ui_settings.png, ui_discover_mobile.png")
