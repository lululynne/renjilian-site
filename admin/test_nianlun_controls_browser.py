"""Date/region intersections and the separately opted-in BARK reader; no production traffic."""
import functools
import contextlib
import http.server
import json
import threading
import unittest
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, Error as PlaywrightError

ROOT = Path(__file__).resolve().parents[1]
def item(id_, at, member):
    return {"id": id_, "at": at, "member": member, "tags": [], "level": 3,
            "line": "这是夹具中的公开产品记录，用来验证日期筛选交集。", "sources": [{"name": "来源", "url": "https://example.com/event"}]}
TIMELINE = {"schema_version": 1, "updated_at": "2026-10-24", "first_ring": "2026-09-30",
            "members": [{"id": "openai", "name": "甲", "region": "international"},
                        {"id": "deepseek", "name": "乙", "region": "china"},
                        {"id": "google", "name": "丙", "region": "international"}],
            "items": [item("nl-google", "2026-10-24", "google"), item("nl-openai", "2026-10-23", "openai"),
                      item("nl-deepseek", "2026-10-22", "deepseek"), item("nl-early", "2026-09-29", "deepseek")]}
def bark():
    return {"schema_version": 1, "updated_at": "2026-10-24", "items": [
        {"id": f"bark-test-{i}", "title": f"短稿{i}", "speaker": "公开作者", "at": "2026-10-12",
         "quote": f"Short quote {i}", "quote_basis": "reported" if i == 1 else "original",
         "paraphrase": "<img src=x onerror=window.bad=true>", "comment": f"这是我们的评论{i}",
         "sources": [{"name": "原始出处", "url": "https://example.com/post"}]} for i in range(3)]}

class NianlunControlsBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        handler.log_message = lambda *a, **k: None
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.p = sync_playwright().start(); cls.browser = cls.p.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.p.stop(); cls.server.shutdown(); cls.server.server_close(); cls.thread.join(2)

    def open(self, query="", width=390, bark_handler=None, init=None, clock=False):
        ctx = self.browser.new_context(viewport={"width": width, "height": 844})
        ctx.route("**/*", lambda r: r.continue_() if urlsplit(r.request.url).netloc == urlsplit(self.base).netloc else r.abort())
        page = ctx.new_page(); self.addCleanup(ctx.close)
        if clock: page.clock.install()
        if init: page.add_init_script(init)
        self.errors = []; page.on("pageerror", lambda e: self.errors.append(str(e)))
        page.route("**/data/nianlun.json", lambda r: r.fulfill(json=TIMELINE))
        self.bark_requests = 0
        def serve(r):
            self.bark_requests += 1
            if bark_handler: bark_handler(r)
            else: r.fulfill(json=bark())
        page.route("**/data/bark.json", serve)
        page.goto(self.base + "/nianlun.html" + query)
        page.locator(".nl-item").first.wait_for()
        if page.locator("#nlCalendar").get_attribute("open") is None:
            page.locator("#nlCalendar > summary").click()
        return page

    def test_region_date_member_intersection_and_shareable_url(self):
        page = self.open()
        self.assertEqual(page.locator(".nl-item").count(), 4)
        page.locator('[data-region="china"]').click()
        self.assertEqual(page.locator(".nl-item").count(), 2)
        page.locator("#nlDate").fill("2026-09-29"); page.locator("#nlDate").dispatch_event("change")
        self.assertEqual(page.locator(".nl-item").count(), 1); self.assertTrue(page.locator("#nl-early").is_visible())
        self.assertIn("r=china", page.url); self.assertIn("d=2026-09-29", page.url)
        page.locator('[data-m="openai"]').click()
        self.assertEqual(page.locator(".nl-item").count(), 0); self.assertIn("这组筛选", page.locator("#nlList").inner_text())
        page.locator('[data-m=""]').click(); page.locator("#nlAllDates").click()
        self.assertEqual(page.locator(".nl-item").count(), 2)
        self.assertEqual(self.errors, [])

    def test_calendar_skips_unrecorded_days_and_invalid_query_is_cleaned(self):
        page = self.open("?m=unknown&r=bad&d=2026-02-30")
        self.assertNotIn("?", page.url)
        page.locator("#nlLatest").click(); self.assertEqual(page.locator("#nlDate").input_value(), "2026-10-24")
        for expected in ["2026-10-23", "2026-10-22", "2026-09-29"]:
            page.locator("#nlEarlier").click(); self.assertEqual(page.locator("#nlDate").input_value(), expected)
        self.assertTrue(page.locator("#nlEarlier").is_disabled())
        page.locator("#nlLater").click(); self.assertEqual(page.locator("#nlDate").input_value(), "2026-10-22")
        page.reload(); page.locator(".nl-item").first.wait_for(); self.assertEqual(page.locator("#nlDate").input_value(), "2026-10-22")

    def test_bark_is_opt_in_separate_text_safe_and_cleared_on_close(self):
        page = self.open(); self.assertEqual(self.bark_requests, 0)
        self.assertEqual(page.locator("#barkToggle").get_attribute("aria-expanded"), "false")
        page.locator("#barkToggle").click(); page.locator(".bark-card").first.wait_for()
        self.assertEqual(page.locator(".bark-card").count(), 3); self.assertEqual(page.locator(".nl-item").count(), 4)
        self.assertEqual(page.locator(".bark-card img").count(), 0); self.assertIsNone(page.evaluate("window.bad"))
        self.assertIn("据报道引述", page.locator(".bark-card").nth(1).inner_text())
        self.assertEqual(page.locator(".bark-comment").count(), 3)
        page.locator("#barkToggle").click(); self.assertEqual(page.locator(".bark-card").count(), 0)
        self.assertTrue(page.locator("#barkItems").is_hidden()); self.assertEqual(self.errors, [])

    def test_bark_failure_is_not_empty_and_explicit_retry_recovers(self):
        attempts = []
        def handler(r):
            attempts.append(1); data = bark()
            if len(attempts) == 1: data["items"] = data["items"][:2]
            r.fulfill(json=data)
        page = self.open(bark_handler=handler); page.locator("#barkToggle").click()
        page.locator("#barkRetry").wait_for(state="visible")
        self.assertEqual(len(attempts), 1); self.assertEqual(page.locator(".nl-item").count(), 4)
        self.assertIn("暂时读不到", page.locator("#barkStatus").inner_text())
        page.locator("#barkRetry").click(); page.locator(".bark-card").first.wait_for()
        self.assertEqual(len(attempts), 2); self.assertEqual(page.locator(".bark-card").count(), 3)

    def test_late_bark_response_cannot_reopen_closed_panel(self):
        script = """(() => {let original=window.fetch;window.fetch=(url,opts)=>String(url).includes('data/bark.json')?new Promise(resolve=>setTimeout(()=>resolve(new Response(JSON.stringify(DATA),{status:200})),120)):original(url,opts);})()""".replace("DATA", json.dumps(bark()))
        page = self.open(init=script); page.locator("#barkToggle").click(); page.locator("#barkToggle").click()
        page.wait_for_timeout(180)
        self.assertEqual(page.locator(".bark-card").count(), 0); self.assertTrue(page.locator("#barkItems").is_hidden())

    def test_bark_header_deadline_and_controls_accessibility(self):
        pending = []
        page = self.open(bark_handler=pending.append, clock=True)
        page.locator("#barkToggle").click(); page.clock.fast_forward(11000)
        page.locator("#barkRetry").wait_for(state="visible")
        self.assertEqual(page.locator(".nl-item").count(), 4)
        for width in [390, 1100]:
            page.set_viewport_size({"width": width, "height": 844})
            self.assertFalse(page.evaluate("document.documentElement.scrollWidth>innerWidth"))
            self.assertEqual(page.evaluate("[...document.querySelectorAll('.nl-calendar button,.nl-calendar input,#barkToggle')].filter(e=>e.getClientRects().length&&!e.disabled).filter(e=>Math.min(e.getBoundingClientRect().width,e.getBoundingClientRect().height)<44).length"), 0)
        page.locator('[data-region=""]').focus(); page.keyboard.press("ArrowRight")
        self.assertEqual(page.locator('[data-region="china"]').get_attribute("aria-checked"), "true")
        for route in pending:
            with contextlib.suppress(PlaywrightError): route.abort()

if __name__ == "__main__": unittest.main()
