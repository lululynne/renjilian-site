#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Long-form reading contract for the seven shared-style pages.

The assertions exercise rendered layout instead of matching CSS text: real 390px
and 1280px Chromium viewports, generated content, focus, touch height, local table
scrolling, hostile long content, and reduced motion.
"""
from __future__ import annotations

import functools
import http.server
import threading
import unittest
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
MOBILE = {"width": 390, "height": 844}
DESKTOP = {"width": 1280, "height": 900}

PAGES = {
    "kanread.html": ".kanread-card .kr-voice p, .kanread-card .kr-hook",
    "ainotes.html": ".bk-card .bk-text",
    "pulse.html": ".pulse-item .pl-line",
    "cost.html": ".cost-section .lede",
    "privacy.html": ".rj-rules p",
    "rules.html": ".rj-rules p",
    "changelog.html": ".release-entry li",
}

READY = {
    "kanread.html": ".kr-index-link",
    "ainotes.html": ".bk-card",
    "pulse.html": ".pulse-item",
    "cost.html": ".setup-card",
    "privacy.html": ".rj-rules",
    "rules.html": ".rj-rules",
    "changelog.html": ".release-entry",
    "baibao.html": ".treasure-card",
    "codex.html": "#codex-board",
    "nianlun.html": ".nl-item",
    "games.html": "#cards .card",
}

WIDTHS = """
() => ({inner: innerWidth, client: document.documentElement.clientWidth,
        doc: document.documentElement.scrollWidth, body: document.body.scrollWidth})
"""

TOUCH_TARGETS = """
() => [...document.querySelectorAll('header a, main a, main button, main input, main summary, footer a')]
  .filter(el => !el.disabled && el.offsetParent !== null)
  .map(el => ({el, r: el.getBoundingClientRect()}))
  .filter(x => x.r.width < 44 || x.r.height < 44)
  .map(x => ({tag: x.el.tagName, cls: String(x.el.className).slice(0, 45),
              text: (x.el.textContent || '').trim().slice(0, 18),
              w: x.r.width, h: x.r.height}))
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        return


class MobileReadingBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def open(self, name: str, viewport: dict[str, int], *, reduced_motion: bool = False):
        context = self.browser.new_context(
            viewport=viewport,
            reduced_motion="reduce" if reduced_motion else "no-preference",
        )
        page = context.new_page()
        errors: list[str] = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{self.base}/{name}", wait_until="networkidle")
        page.locator(READY[name]).first.wait_for()
        if name == "kanread.html":
            page.locator(".kr-index-link").first.click()
            page.locator(".kanread-card").wait_for()
        return context, page, errors

    def assert_page_width(self, page: Page, width: int) -> None:
        self.assertEqual(
            page.evaluate(WIDTHS),
            {"inner": width, "client": width, "doc": width, "body": width},
        )

    def test_390_reading_routes_are_legible_reachable_and_page_scroll_free(self) -> None:
        for name, prose_selector in PAGES.items():
            with self.subTest(page=name):
                context, page, errors = self.open(name, MOBILE)
                try:
                    self.assertTrue(page.locator("body").evaluate(
                        "el => el.classList.contains('reading-page')"
                    ))
                    self.assert_page_width(page, 390)

                    prose = page.locator(prose_selector).first
                    metrics = prose.evaluate("""el => {
                      const s = getComputedStyle(el), r = el.getBoundingClientRect();
                      return {font: parseFloat(s.fontSize), line: parseFloat(s.lineHeight),
                              width: r.width};
                    }""")
                    self.assertGreaterEqual(metrics["font"], 15.5, f"{name} body text is too small")
                    self.assertGreaterEqual(metrics["line"] / metrics["font"], 1.75,
                                            f"{name} body leading is too tight")
                    self.assertGreaterEqual(metrics["width"], 280,
                                            f"{name} padding leaves too little reading width")

                    self.assertEqual(page.evaluate(TOUCH_TARGETS), [], f"{name} has a target below 44x44px")

                    shell = page.evaluate("""() => {
                      const header = document.querySelector('header.site').getBoundingClientRect();
                      const main = document.querySelector('main.wrap').getBoundingClientRect();
                      const nav = document.querySelector('nav.boards').getBoundingClientRect();
                      return {headerBottom: header.bottom, mainTop: main.top,
                              navLeft: nav.left, navRight: nav.right};
                    }""")
                    self.assertLessEqual(shell["headerBottom"], shell["mainTop"] + 0.5)
                    self.assertGreaterEqual(shell["navLeft"], -0.5)
                    self.assertLessEqual(shell["navRight"], 390.5)

                    page.locator(".account-entry").focus()
                    page.keyboard.press("Tab")
                    page.keyboard.press("Shift+Tab")
                    self.assertTrue(page.locator(".account-entry").evaluate("el => el === document.activeElement"))
                    focus = page.locator(".account-entry").evaluate(
                        "el => ({style:getComputedStyle(el).outlineStyle, width:getComputedStyle(el).outlineWidth})"
                    )
                    self.assertNotEqual(focus["style"], "none")
                    self.assertNotEqual(focus["width"], "0px")

                    # A long URL and code line must not widen the page. Code keeps a local scrollbar;
                    # an oversized image must scale down inside the article.
                    host = page.locator(prose_selector).first
                    host.evaluate("""el => {
                      const box = el.parentElement;
                      const p = document.createElement('p');
                      p.id = 'hostile-url';
                      p.textContent = 'https://example.com/' + 'unbroken-token-'.repeat(45);
                      const pre = document.createElement('pre');
                      pre.id = 'hostile-code'; pre.textContent = 'x'.repeat(500);
                      const img = document.createElement('img');
                      img.id = 'hostile-image'; img.style.width = '2000px'; img.height = 80; img.alt = '';
                      box.append(p, pre, img);
                    }""")
                    self.assert_page_width(page, 390)
                    self.assertTrue(page.locator("#hostile-code").evaluate("el => el.scrollWidth > el.clientWidth"))
                    self.assertLessEqual(page.locator("#hostile-image").bounding_box()["width"],
                                         page.locator("main.wrap").bounding_box()["width"])
                    self.assertEqual(errors, [])
                finally:
                    context.close()

    def test_cost_tables_scroll_locally_with_visible_instruction(self) -> None:
        context, page, errors = self.open("cost.html", MOBILE)
        try:
            for region in page.locator(".cost-scroll").all():
                dims = region.evaluate("""el => ({client:el.clientWidth, scroll:el.scrollWidth,
                  hint:getComputedStyle(el, '::before').content, label:el.getAttribute('aria-label')})""")
                self.assertGreater(dims["scroll"], dims["client"])
                self.assertIn(dims["label"], dims["hint"])
                region.evaluate("el => { el.scrollLeft = el.scrollWidth; }")
                self.assertGreater(region.evaluate("el => el.scrollLeft"), 0)
            self.assert_page_width(page, 390)
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_1280_keeps_desktop_width_and_multicolumn_structures(self) -> None:
        for name in PAGES:
            with self.subTest(page=name):
                context, page, errors = self.open(name, DESKTOP)
                try:
                    self.assert_page_width(page, 1280)
                    main_width = page.locator("main.wrap").bounding_box()["width"]
                    self.assertGreaterEqual(main_width, 1100)
                    self.assertLessEqual(main_width, 1180.5)
                    self.assertEqual(errors, [])
                finally:
                    context.close()

        context, page, errors = self.open("changelog.html", DESKTOP)
        try:
            entry = page.locator(".release-entry").first
            header = entry.locator(":scope > header").bounding_box()
            changes = entry.locator(":scope > ul").bounding_box()
            self.assertGreater(changes["x"], header["x"] + header["width"])
            self.assertEqual(errors, [])
        finally:
            context.close()

        context, page, errors = self.open("cost.html", DESKTOP)
        try:
            cards = page.locator(".setup-wall .setup-card")
            self.assertGreaterEqual(cards.count(), 3)
            ys = [round(cards.nth(i).bounding_box()["y"]) for i in range(3)]
            self.assertEqual(len(set(ys)), 1, "desktop setup wall must remain three columns")
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_non_reading_pages_remain_outside_the_contract(self) -> None:
        for name in ("baibao.html", "codex.html", "nianlun.html", "games.html"):
            for viewport in (MOBILE, DESKTOP):
                with self.subTest(page=name, width=viewport["width"]):
                    context, page, errors = self.open(name, viewport)
                    try:
                        self.assert_page_width(page, viewport["width"])
                        self.assertFalse(page.locator("body").evaluate(
                            "el => el.classList.contains('reading-page')"
                        ))
                        self.assertEqual(errors, [])
                    finally:
                        context.close()

    def test_reduced_motion_still_zeroes_animation_and_transition(self) -> None:
        context, page, errors = self.open("kanread.html", MOBILE, reduced_motion=True)
        try:
            values = page.locator(".kanread-card").evaluate("""el => ({
              animation:getComputedStyle(el).animationDuration,
              transition:getComputedStyle(el).transitionDuration,
              matches:matchMedia('(prefers-reduced-motion: reduce)').matches
            })""")
            self.assertEqual(values["animation"], "0s")
            self.assertEqual(values["transition"], "0s")
            self.assertTrue(values["matches"])
            self.assertEqual(errors, [])
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main()
