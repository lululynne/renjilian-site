"""Unpublished card privacy: current page, isolated API fixture, real Chromium."""
from __future__ import annotations

import copy
import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from urllib.parse import quote

from playwright.sync_api import sync_playwright
from test_card_review_browser import ApiHandler, QuietSite, machine_own

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_BIO = "Synthetic private card sentence"
PRIVATE_DEVICE = "Synthetic Private Device"


class PrivateCardBackend:
    def __init__(self, viewer):
        self.viewer = viewer
        self.calls = []
        self.own = machine_own()
        self.own["card"].update({
            "published": False, "skin": "rpg", "bio": PRIVATE_BIO,
            "devices": [{"brand": "Fixture", "cat": "laptop", "model": PRIVATE_DEVICE, "main": True}],
        })
        self.own["card"]["avatar"]["mode"] = "logo"

    def request(self, method, path, body):
        self.calls.append((method, path))
        if method != "GET":
            return 405, {"ok": False, "error": "Read-only fixture"}
        if path == "/api/config":
            return 200, {"ok": True}
        if path == "/api/card/catalog":
            return 200, {"ok": True}
        if path == "/api/me":
            if self.viewer == "anonymous":
                return 200, {"ok": True, "signed_in": False}
            return 200, {"ok": True, "signed_in": True, "kind": "machine",
                         "handle": self.own["handle"] if self.viewer == "owner" else "other-bot"}
        if path == "/api/accounts/" + self.own["handle"] + "/card":
            return 200, {"ok": True, "handle": self.own["handle"], "kind": "machine",
                         "display_name": "Fixture machine", "published": False,
                         "avatar": {"mode": "logo", "model": "claude", "head": "catears"},
                         "stats": self.own["stats"], "badges": [], "family": [],
                         "is_me": self.viewer == "owner"}
        if path == "/api/me/card":
            return (200, copy.deepcopy(self.own)) if self.viewer == "owner" else (403, {"ok": False})
        return 404, {"ok": False}


class PrivateCardBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site_server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(QuietSite, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.site_server.serve_forever, daemon=True)
        cls.thread.start()
        cls.site = f"http://127.0.0.1:{cls.site_server.server_port}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.site_server.shutdown()
        cls.site_server.server_close()
        cls.thread.join(timeout=3)

    def check_view(self, viewer):
        for width in (390, 1100):
            with self.subTest(viewer=viewer, width=width):
                backend = PrivateCardBackend(viewer)
                handler = type("PrivateApiHandler", (ApiHandler,), {"backend": backend})
                server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                api = f"http://127.0.0.1:{server.server_port}"
                context = self.browser.new_context(viewport={"width": width, "height": 900})
                try:
                    page = context.new_page()
                    page.set_default_timeout(6000)
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(self.site + "/card.html?u=" + backend.own["handle"] + "&api=" + quote(api, safe=""),
                              wait_until="networkidle")
                    hero = page.locator("#hero")
                    hero.wait_for(state="visible")
                    text = hero.inner_text()
                    if viewer == "owner":
                        self.assertIn(PRIVATE_BIO, text)
                        self.assertIn(PRIVATE_DEVICE, text)
                        self.assertIn("仅本人可见的完整预览", text)
                        self.assertEqual(hero.locator(".empty-house").count(), 0)
                        self.assertEqual(hero.locator("a.edit").count(), 1)
                        self.assertIn(("GET", "/api/me/card"), backend.calls)
                    else:
                        self.assertNotIn(PRIVATE_BIO, text)
                        self.assertNotIn(PRIVATE_DEVICE, text)
                        self.assertNotIn("仅本人可见的完整预览", text)
                        self.assertEqual(hero.locator(".empty-house").count(), 1)
                        self.assertEqual(hero.locator("a.edit").count(), 0)
                        self.assertNotIn(("GET", "/api/me/card"), backend.calls)
                    self.assertGreater(hero.locator("svg").count(), 0)
                    self.assertFalse(page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"))
                    self.assertEqual(errors, [])
                    self.assertTrue(all(method == "GET" for method, _ in backend.calls))
                    if os.environ.get("X03_SHOTS"):
                        dest = Path(os.environ["X03_SHOTS"])
                        dest.mkdir(mode=0o700, parents=True, exist_ok=True)
                        page.screenshot(path=str(dest / f"private-card-{viewer}-{width}.png"), full_page=True)
                finally:
                    context.close()
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=3)

    def test_owner_reads_complete_unpublished_card(self):
        self.check_view("owner")

    def test_anonymous_reads_only_the_public_doorplate(self):
        self.check_view("anonymous")

    def test_other_signed_in_machine_cannot_read_private_body(self):
        self.check_view("other")


if __name__ == "__main__":
    unittest.main()
