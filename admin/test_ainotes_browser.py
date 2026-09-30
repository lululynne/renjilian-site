#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""小纸条（刊读词下注）的浏览器实测（2026-09-30，刀 1）。

照 RoundtableRenderTests 的办法：本机起静态服务 + 无头 Chromium，不需要后端。
- 线上模式：DevDay 卡只有 6 个已核对词条对应的 8 处带标记，其余 44 处是纯文字；
  开关关掉后页面里没有任何可见的 .an-t 装饰和 .an-foot，标记不可聚焦、点了不开弹层；
- 预览模式（?preview=1，并入本机草稿词条）：52 处全部可点；点词开弹层、含该词条一句话、
  草稿词条带【草稿】；Esc 关闭后焦点回到刚才点的词；360 宽不横向滚动；
- 开关状态写 localStorage，刷新后保持；
- 恶意词条字符串（<img src=x onerror=…>）只显示成字面文字，不生成元素、不执行。
"""
from __future__ import annotations

import functools
import http.server
import json
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = "kanread.html"
CARD = "kr-openai-devday-2026-plan-sharing"
VERIFIED = {"bk-tibo", "bk-chatgpt-plans", "bk-api", "bk-gpt6-astra", "bk-devday", "bk-gpt61-sol"}
DRAFTS = ROOT / "data" / "ainotes.drafts.json"
OVERFLOW = "document.documentElement.scrollWidth - window.innerWidth"


def notes() -> dict:
    return json.loads((ROOT / "data/ainotes.json").read_text(encoding="utf-8"))


class AinotesBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        handler.log_message = lambda *a, **k: None
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

    def open(self, query: str = "", width: int = 1100):
        page = self.browser.new_page(viewport={"width": width, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{self.base}/{PAGE}{query}", wait_until="networkidle")
        page.locator(".kanread-card").first.wait_for()
        return page, errors

    # ── 1. 线上模式：只有已核对词条带标记，其余位置是纯文字 ──
    def test_live_only_verified_terms_are_marked(self) -> None:
        page, errors = self.open()
        try:
            card = page.locator(f"#{CARD}")
            ts = card.locator(".an-t")
            self.assertEqual(ts.count(), 8, "线上只该有 8 处可显示标记（6 词条：人声 6 处 + 机声 2 处）")
            ks = {ts.nth(i).get_attribute("data-k") for i in range(ts.count())}
            self.assertEqual(ks, VERIFIED)
            # 未核对的词毫无痕迹：没有按钮，字还在原地
            self.assertEqual(card.locator(".an-t[data-k='bk-openai']").count(), 0)
            hv = card.locator(".kr-human")
            self.assertIn("OpenAI", hv.inner_text())
            self.assertIn("用量", hv.inner_text())
            # 开关只在有标记的卡上出现，全页就 DevDay 一张卡有
            self.assertEqual(page.locator(".an-toggle").count(), 1)
            tog = page.locator(".an-toggle")
            self.assertIn("小纸条：开", tog.inner_text())
            self.assertEqual(tog.get_attribute("aria-pressed"), "true")
            # 每个声部末尾各一块页下注，编号各自从 1 起
            self.assertEqual(card.locator(".an-foot").count(), 2)
            self.assertTrue(card.locator(".an-foot").first.is_visible())
            self.assertEqual(card.locator(".kr-human .an-t sup").first.inner_text(), "1")
            self.assertEqual(card.locator(".kr-machine .an-t sup").first.inner_text(), "1")
            first_foot = card.locator(".kr-human .an-foot li").first.inner_text()
            self.assertIn("Tibo", first_foot)
            # 人声 6 处编号 1..6 顺次
            nums = [t.inner_text() for t in card.locator(".kr-human .an-t sup").all()]
            self.assertEqual(nums, ["1", "2", "3", "4", "5", "6"])
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 2. 关掉开关：装饰全消失、不可聚焦、点了没反应 ──
    def test_toggle_off_leaves_no_trace(self) -> None:
        page, errors = self.open()
        try:
            card = page.locator(f"#{CARD}")
            page.locator(".an-toggle").click()
            self.assertEqual(page.locator(".an-toggle").inner_text().replace("\n", "").strip(), "小纸条：关")
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.on')"), "0")
            self.assertFalse(page.locator("body.an-on").count())
            # 页下注整块消失
            for i in range(card.locator(".an-foot").count()):
                self.assertFalse(card.locator(".an-foot").nth(i).is_visible())
            # 点线、上标都没有
            style = card.locator(".an-t .an-w").first.evaluate(
                "el => { const s = getComputedStyle(el); return s.borderBottomStyle + '/' + s.borderBottomWidth; }")
            self.assertIn("none", style.split("/")[0])
            self.assertFalse(card.locator(".an-t sup").first.is_visible())
            # 不可聚焦，点了不开弹层
            self.assertEqual(card.locator(".an-t").first.get_attribute("tabindex"), "-1")
            card.locator(".an-t").first.click(force=True)
            self.assertTrue(page.locator("#anSheet").is_hidden())
            # 字和原来一字不差：开→关→开→关一个来回，关态文字稳定，且标记处只剩词本身
            off_text = card.locator(".kr-human").inner_text()
            self.assertEqual(card.locator(".an-t").first.inner_text(), "Codex 负责人")
            self.assertNotIn("负责人1", off_text)
            page.locator(".an-toggle").click()
            self.assertIn("负责人1", card.locator(".kr-human").inner_text())
            page.locator(".an-toggle").click()
            self.assertEqual(card.locator(".kr-human").inner_text(), off_text)
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 3. 预览模式：52 处全部可点；弹层内容、【草稿】、Esc 焦点回程 ──
    def test_preview_all_marks_clickable_and_sheet(self) -> None:
        if not DRAFTS.exists():
            self.skipTest("本机没有草稿文件")
        drafts = {e["id"]: e for e in json.loads(DRAFTS.read_text(encoding="utf-8"))["items"]}
        page, errors = self.open("?preview=1")
        try:
            card = page.locator(f"#{CARD}")
            ts = card.locator(".an-t")
            self.assertEqual(ts.count(), 52, "预览并入了草稿词条，52 处标记应全部可点")
            # 点一个草稿词条（bk-openai 只在草稿里）
            btn = card.locator(".an-t[data-k='bk-openai']").first
            btn.click()
            sheet = page.locator("#anSheet")
            self.assertTrue(sheet.is_visible())
            self.assertEqual(sheet.get_attribute("role"), "dialog")
            self.assertEqual(sheet.get_attribute("aria-modal"), "true")
            zh = page.locator("#anZh").inner_text()
            self.assertTrue(zh.startswith("【草稿】"), "草稿词条要标【草稿】")
            self.assertIn(drafts["bk-openai"]["zh"], zh)
            self.assertEqual(page.locator("#anLine").inner_text(), drafts["bk-openai"]["line"])
            # 这条草稿没有 more：不出现「展开」
            self.assertTrue(page.locator("#anMoreWrap").is_hidden())
            # 来源链接全部 https + 新标签 + noopener
            links = page.locator("#anSrcs a")
            self.assertGreaterEqual(links.count(), 1)
            for i in range(links.count()):
                self.assertTrue(links.nth(i).get_attribute("href").startswith("https://"))
                self.assertEqual(links.nth(i).get_attribute("target"), "_blank")
                self.assertEqual(links.nth(i).get_attribute("rel"), "noopener noreferrer")
            self.assertIn("最后核对 2026-09-30", page.locator("#anVerified").inner_text())
            # 打开时焦点进弹层；关闭键 ≥44×44
            self.assertTrue(page.evaluate("document.getElementById('anSheet').contains(document.activeElement)"))
            box = page.locator("#anX").bounding_box()
            self.assertGreaterEqual(box["width"], 44)
            self.assertGreaterEqual(box["height"], 44)
            # Esc 关闭，焦点回到刚才点的那个词
            page.keyboard.press("Escape")
            self.assertTrue(sheet.is_hidden())
            self.assertTrue(page.evaluate(
                "el => document.activeElement === el", btn.element_handle()))
            # 点遮罩也能关
            btn.click()
            self.assertTrue(sheet.is_visible())
            page.locator("#anBack").click(position={"x": 20, "y": 20}, force=True)
            self.assertTrue(sheet.is_hidden())
            # 有 more 的词条（已核对 bk-tibo）：「展开」在弹层内展开，不跳页
            card.locator(".an-t[data-k='bk-tibo']").first.click()
            self.assertTrue(page.locator("#anMoreWrap").is_visible())
            page.locator("#anMoreBtn").click()
            more = page.locator("#anMore")
            self.assertTrue(more.is_visible())
            self.assertIn("thsottiaux", more.inner_text())
            self.assertTrue(page.url.endswith(PAGE) or page.url.endswith(PAGE + "?preview=1"))
            page.locator("#anX").click()
            self.assertTrue(sheet.is_hidden())
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 4. 开关状态刷新后保持（同一 browser context 即同一 localStorage） ──
    def test_toggle_state_survives_reload(self) -> None:
        ctx = self.browser.new_context(viewport={"width": 1100, "height": 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            page.goto(f"{self.base}/{PAGE}", wait_until="networkidle")
            page.locator(".an-toggle").wait_for()
            page.locator(".an-toggle").click()
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.on')"), "0")
            page.reload(wait_until="networkidle")
            page.locator(".an-toggle").wait_for()
            self.assertEqual(page.locator(".an-toggle").inner_text().replace("\n", "").strip(), "小纸条：关")
            self.assertFalse(page.locator(".an-foot").first.is_visible())
            self.assertEqual(page.locator(".an-t").first.get_attribute("tabindex"), "-1")
            page.locator(".an-toggle").click()
            page.reload(wait_until="networkidle")
            page.locator(".an-toggle").wait_for()
            self.assertEqual(page.locator(".an-toggle").inner_text().replace("\n", "").strip(), "小纸条：开")
            self.assertTrue(page.locator(".an-foot").first.is_visible())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 5. 恶意词条字符串：只显示成字面文字，不生成元素、不执行 ──
    def test_hostile_entry_strings_render_as_text(self) -> None:
        payload = notes()
        for e in payload["items"]:
            if e["id"] == "bk-tibo":
                e["zh"] = '<img src=x onerror="window.__pwn=1">'
                e["line"] = '"><svg onload="window.__pwn2=1">'
                e["for_us"] = "<b>bold</b>"
                e["more"] = "<i>more</i>"
                e["sources"] = [{"name": "<u>坏来源</u>", "url": "javascript:alert(1)"},
                                {"name": "正常来源", "url": "https://example.com/x"}]
        page = self.browser.new_page(viewport={"width": 1100, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/ainotes.json", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps(payload, ensure_ascii=False)))
        try:
            page.goto(f"{self.base}/{PAGE}", wait_until="networkidle")
            page.locator(f"#{CARD} .an-t[data-k='bk-tibo']").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertIsNone(page.evaluate("window.__pwn"))
            self.assertIsNone(page.evaluate("window.__pwn2"))
            shown = page.locator("#anSheet").inner_text()
            self.assertIn("<img src=x", shown, "恶意字符串应原样显示成文字")
            self.assertIn("<svg", shown)
            self.assertIn("<b>bold</b>", shown)
            self.assertEqual(page.locator("#anSheet img, #anSheet svg, #anSheet b, #anSheet i, #anSheet u").count(), 0,
                             "弹层里多出了标签")
            # 页下注里的 zh 也一样只是文字
            self.assertIn("<img src=x", page.locator(f"#{CARD} .kr-human .an-foot").inner_text())
            self.assertEqual(page.locator(f"#{CARD} .an-foot img").count(), 0)
            # 非 https 来源只显示名字不做链接
            self.assertEqual(page.locator("#anSrcs a").count(), 1)
            self.assertEqual(page.locator("#anSrcs a").first.get_attribute("href"), "https://example.com/x")
            self.assertIn("<u>坏来源</u>", page.locator("#anSrcs").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            page.close()

    # ── 6. 360 宽：不横向滚动，弹层贴底 ──
    def test_mobile_360_no_horizontal_scroll(self) -> None:
        page, errors = self.open(width=360)
        try:
            self.assertLessEqual(page.evaluate(OVERFLOW), 0, "360 宽横向溢出")
            page.locator(f"#{CARD} .an-t").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertLessEqual(page.evaluate(OVERFLOW), 0, "弹层打开后 360 宽横向溢出")
            box = page.locator("#anSheet").bounding_box()
            self.assertEqual(round(box["x"]), 0)
            self.assertEqual(round(box["width"]), 360, "手机上弹层应贴满底宽")
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 7. 词条数据整个取不到：静默退回没有小纸条的样子，页面照常渲染 ──
    def test_missing_notes_data_degrades_silently(self) -> None:
        page = self.browser.new_page(viewport={"width": 1100, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/ainotes.marks.json", lambda route: route.fulfill(status=404, body=""))
        try:
            page.goto(f"{self.base}/{PAGE}", wait_until="networkidle")
            page.locator(".kanread-card").first.wait_for()
            self.assertEqual(page.locator(".an-t").count(), 0)
            self.assertEqual(page.locator(".an-toggle").count(), 0)
            self.assertEqual(page.locator(".an-foot").count(), 0)
            self.assertIn("人声 · 摘要", page.locator(f"#{CARD}").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            page.close()


if __name__ == "__main__":
    unittest.main()
