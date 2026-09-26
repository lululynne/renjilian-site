#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""顶栏右上角账号入口（2026-09-26 梅宝 12:36：「账号不能放在底部……应该是在右上角」）。

静态：12 页 masthead 里恰有一个 .account-entry → account.html，account.html 自己那个带 on；页脚「账号」照旧在。
浏览器：390 宽下入口不压标题 / SECOND PERSON / slogan，点击区 ≥44，无横向滚动；
加载 rj-api.js 的页面登录态下入口换成 @handle（拦截 /api/me，不新增请求）。
"""
from __future__ import annotations

import functools
import http.server
import json
import re
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index.html", "games.html", "baibao.html", "codex.html", "kanread.html", "pulse.html", "cost.html",
         "changelog.html", "account.html", "profile.html", "rules.html", "privacy.html",
         "card.html", "card-edit.html")
MASTHEAD = re.compile(r'<div class="masthead">.*?</div>', re.S)
ENTRY = re.compile(r'<a class="(account-entry(?: on)?)" href="([^"]+)"')


class AccountEntryStaticTests(unittest.TestCase):
    def test_one_entry_per_page_in_masthead(self) -> None:
        for page in PAGES:
            with self.subTest(page=page):
                html = (ROOT / page).read_text(encoding="utf-8")
                self.assertEqual(html.count("account-entry"), 1)
                found = ENTRY.findall(MASTHEAD.search(html).group(0))
                self.assertEqual(len(found), 1)
                cls, href = found[0]
                self.assertEqual(href, "account.html")
                self.assertEqual(cls, "account-entry on" if page == "account.html" else "account-entry")
                # 页脚原来的「账号」保留
                footer = html[html.index('<footer class="site"'):]
                self.assertIn("账号", footer)


try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

BOX_JS = """
(() => {
  const r = el => { const b = el.getBoundingClientRect(); return {x:b.x, y:b.y, w:b.width, h:b.height}; };
  const q = s => document.querySelector(s);
  return {entry: r(q('.masthead .account-entry')), h1: r(q('.masthead h1')),
          en: r(q('.masthead .masthead-en')), slogan: r(q('.masthead .slogan')),
          innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth};
})()
"""


def overlap(a, b) -> bool:
    return a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]


@unittest.skipIf(sync_playwright is None, "没装 playwright")
class AccountEntryBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_390_no_overlap_no_hscroll(self) -> None:
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        try:
            for name in PAGES:
                with self.subTest(page=name):
                    page.goto(f"{self.base_url}/{name}", wait_until="load")
                    m = page.evaluate(BOX_JS)
                    for other in ("h1", "en", "slogan"):
                        self.assertFalse(overlap(m["entry"], m[other]), f"{name} 入口压到 {other}: {m}")
                    self.assertGreaterEqual(m["entry"]["h"], 44)
                    self.assertGreaterEqual(m["entry"]["w"], 44)
                    self.assertLessEqual(m["entry"]["x"] + m["entry"]["w"], m["innerWidth"])
                    self.assertEqual(m["innerWidth"], m["scrollWidth"], name)
        finally:
            ctx.close()

    def test_signed_in_shows_handle(self) -> None:
        api = "http://127.0.0.1:9"
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        calls: list[str] = []

        def fulfil(route):
            path = route.request.url[len(api):].split("?")[0]
            calls.append(path)
            body = {"/api/config": {"ok": True},
                    "/api/me": {"ok": True, "signed_in": True, "handle": "meibao", "kind": "human"}}.get(path, {"ok": True})
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body),
                          headers={"access-control-allow-origin": self.base_url,
                                   "access-control-allow-credentials": "true"})

        ctx.route(f"{api}/**", fulfil)
        page = ctx.new_page()
        try:
            page.goto(f"{self.base_url}/account.html?api={api}", wait_until="load")
            page.wait_for_function("document.querySelector('.account-entry').textContent === '@meibao'", timeout=5000)
            self.assertEqual(calls.count("/api/me"), 1)
            m = page.evaluate(BOX_JS)
            for other in ("h1", "en", "slogan"):
                self.assertFalse(overlap(m["entry"], m[other]), m)
            self.assertEqual(m["innerWidth"], m["scrollWidth"])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
