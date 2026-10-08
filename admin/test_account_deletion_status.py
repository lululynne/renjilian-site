#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""账号注销 202 清理中与完成态：已部署页面逻辑的隔离假后端验收。"""
from __future__ import annotations

import functools
import http.server
import threading
import unittest
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from test_p25_machine_keys import FakeBackend, MOCK, QuietHandler, ROOT


class DeletionBackend(FakeBackend):
    def __init__(self, pending: bool = True):
        super().__init__("human", [])
        self.pending = pending
        self.state = "pending" if pending else "complete"
        self.signed_in = True

    def handle_route(self, route) -> None:
        path = urlparse(route.request.url).path
        method = route.request.method
        if path == "/api/sessions" and method == "POST":
            self.signed_in = True
            return self.reply(route, 200, {"ok": True, "notice": "登录成功。"})
        if path == "/api/me" and method == "DELETE":
            self.signed_in = False
            if self.pending:
                return self.reply(route, 202, {"ok": True, "deleted": False, "deletion_pending": True,
                                               "notice": "账号已从公开页面撤下，存储清理仍在自动重试。"})
            return self.reply(route, 200, {"ok": True, "deleted": True, "notice": "号删干净了。"})
        if path == "/api/me" and method == "GET" and not self.signed_in:
            return self.reply(route, 200, {"ok": True, "signed_in": False})
        if path == "/api/deletions/status":
            return self.reply(route, 200, {"ok": True, "state": self.state if not self.signed_in else None,
                                           "deleted": self.state == "complete",
                                           "notice": "账号正在清理。" if self.state == "pending" else "本站里的账号清理完成了。"})
        return super().handle_route(route)


class AccountDeletionStatusBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.site = f"http://127.0.0.1:{cls.server.server_port}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def open(self, fake: DeletionBackend):
        context = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("dialog", lambda d: d.accept())
        page.route(MOCK + "/**", fake.handle_route)
        page.goto(f"{self.site}/account.html?api={MOCK}", wait_until="networkidle")
        page.locator("#panelMe").wait_for(state="visible")
        return context, page, errors

    def test_pending_then_complete_survives_reload(self) -> None:
        fake = DeletionBackend()
        context, page, errors = self.open(fake)
        try:
            page.locator("#deleteGo").click()
            page.locator("#panelDeleting").wait_for(state="visible")
            self.assertTrue(page.locator("#panelGuest").is_visible())
            self.assertIn("清理", page.locator("#deletionStatusNote").inner_text())
            self.assertNotIn("号删干净了", page.locator("body").inner_text())
            page.reload(wait_until="networkidle")
            page.locator("#panelDeleting").wait_for(state="visible")
            self.assertIn("清理", page.locator("#deletionStatusNote").inner_text())
            fake.state = "complete"
            page.locator("#deletionStatusRefresh").click()
            page.wait_for_function("document.getElementById('deletionStatusNote').textContent.includes('完成')")
            self.assertIn("完成", page.locator("#deletionStatusNote").inner_text())
            self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), 390)
            self.assertFalse(errors, errors)
        finally:
            context.close()

    def test_immediate_completion_keeps_guest_path(self) -> None:
        fake = DeletionBackend(pending=False)
        context, page, errors = self.open(fake)
        try:
            page.locator("#deleteGo").click()
            page.locator("#panelGuest").wait_for(state="visible")
            self.assertTrue(page.locator("#panelDeleting").is_visible())
            self.assertIn("号删干净了", page.locator("#deletionStatusNote").inner_text())
            self.assertFalse(errors, errors)
        finally:
            context.close()

    def test_late_status_response_cannot_cover_new_login(self) -> None:
        fake = DeletionBackend()
        context, page, errors = self.open(fake)
        held = []
        page.route(MOCK + "/api/deletions/status", lambda route: held.append(route))
        try:
            page.locator("#deleteGo").click()
            page.wait_for_function("document.getElementById('panelGuest').hidden === false")
            for _ in range(20):
                if held:
                    break
                page.wait_for_timeout(25)
            self.assertTrue(held, "注销进度请求没有进入延迟窗口")
            page.locator("#loginHandle").fill("fake-human")
            page.locator("#loginCode").fill("replacement-account-recovery-code")
            page.locator("#loginGo").click()
            page.locator("#panelMe").wait_for(state="visible")
            held[0].fulfill(status=200, body='{"ok":true,"state":"pending","notice":"旧账号仍在清理。"}',
                            headers=fake.cors(held[0]))
            page.wait_for_timeout(50)
            self.assertFalse(page.locator("#panelDeleting").is_visible())
            self.assertFalse(errors, errors)
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main()
