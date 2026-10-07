#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""配置账单：只把同档已核价格算进已知小计；自填金额与卡面缺价诚实呈现。"""
from __future__ import annotations

import functools
import http.server
import json
import threading
import unittest
import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


class CostCalculatorBrowserTests(unittest.TestCase):
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

    def open(self, width=390):
        context = self.browser.new_context(viewport={"width": width, "height": 844})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.base + "/cost.html", wait_until="networkidle")
        return context, page, errors

    def test_known_price_manual_annual_local_persistence_and_reset(self) -> None:
        context, page, errors = self.open()
        try:
            context.grant_permissions(["clipboard-read", "clipboard-write"], origin=self.base)
            page.locator("#costCalc").wait_for()
            page.locator("#calcRegionUsd").click()
            page.locator('button[data-calc-tag="sub-chatgpt-plus-monthly"]').click()
            page.locator('details[data-calc-vendor="anthropic"] > summary').click()
            page.locator('button[data-calc-tag="sub-claude-pro-yearly"]').click()
            result = page.locator("#calcResult")
            self.assertIn("$19.99", result.inner_text())
            self.assertIn("另 1 档待核价", result.inner_text(), "年费缺结构化价时不能悄悄当零")
            page.locator('input[data-manual-tag="sub-claude-pro-yearly"]').fill("200")
            self.assertIn("$36.66", result.inner_text(), "年费 $200 应折成每月 $16.67 左右再汇总")
            self.assertIn("200", page.locator("#calcLines").inner_text(), "不能只显示月均、藏掉一次预付金额")
            page.locator("#calcCopy").click()
            page.wait_for_function("document.getElementById('calcState').textContent.includes('已复制')")
            copied = page.evaluate("navigator.clipboard.readText()")
            self.assertIn("$200.00", copied)
            self.assertIn("年费", copied)
            page.reload(wait_until="networkidle")
            self.assertIn("$36.66", page.locator("#calcResult").inner_text(), "本机试算重开后丢了")
            page.locator('input[data-manual-tag="sub-claude-pro-yearly"]').fill("不确定")
            self.assertEqual(page.locator('input[data-manual-tag="sub-claude-pro-yearly"]').get_attribute("aria-invalid"), "true")
            self.assertIn("待核价", page.locator("#calcResult").inner_text(), "坏输入不能沿用旧金额")
            self.assertIn("金额填", page.locator("#calcLines").inner_text())
            page.locator("#calcReset").click()
            self.assertIn("还没选", page.locator("#calcResult").inner_text())
            page.locator('details[data-calc-vendor="zhipu"] > summary').click()
            page.locator('button[data-calc-tag="sub-glm-coding-lite-quarterly"]').click()
            self.assertIn("待核价", page.locator("#calcResult").inner_text(), "草稿代表价不能给季费档补数")
            page.locator('input[data-manual-tag="sub-glm-coding-lite-quarterly"]').fill("90")
            self.assertIn("$30.00", page.locator("#calcResult").inner_text(), "季费 $90 应按 3 个月摊开")
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_sample_cards_show_known_subtotal_and_missing_plans(self) -> None:
        context, page, errors = self.open()
        try:
            page.locator("#calcRegionUsd").click()
            cards = page.locator("#setupWall .setup-card")
            self.assertEqual(cards.count(), 3)
            a = cards.first.locator(".setup-estimate").inner_text()
            self.assertIn("$49.99", a)
            self.assertIn("另 1 档待核价", a, "Claude Pro 年付缺结构化价必须标成未计入")
            b = cards.nth(1).inner_text()
            self.assertNotIn("$20", b, "Cursor Pro+ 不能偷用 Cursor Pro 代表档价格")
            self.assertIn("待核价", b)
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_mobile_controls_and_layout(self) -> None:
        context, page, errors = self.open()
        try:
            page.locator("#costCalc").wait_for()
            widths = page.evaluate("[innerWidth,document.documentElement.scrollWidth,document.body.scrollWidth]")
            self.assertEqual(widths, [390, 390, 390])
            small = page.locator("#costCalc button, #costCalc input").evaluate_all("""els => els
              .filter(e => e.offsetParent !== null)
              .map(e => { const r=e.getBoundingClientRect(); return [r.width,r.height] })
              .filter(([w,h]) => w < 44 || h < 44)""")
            self.assertEqual(small, [])
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_english_currency_source_and_copy(self) -> None:
        context, page, errors = self.open()
        try:
            context.grant_permissions(["clipboard-read", "clipboard-write"], origin=self.base)
            page.locator("#langEn").click()
            page.locator("#calcRegionUsd").click()
            self.assertEqual(page.locator(".calc-region").get_attribute("aria-label"), "Estimate currency")
            self.assertEqual(page.locator("#calcCopy").inner_text(), "Copy estimate")
            self.assertEqual(page.locator("#calcReset").inner_text(), "Clear")
            self.assertIn("Xiaomi MiMo", page.locator('details[data-calc-vendor="xiaomi"] > summary').inner_text())
            page.locator('button[data-calc-tag="sub-chatgpt-plus-monthly"]').click()
            self.assertIn("Estimated per month $19.99/mo", page.locator("#calcResult").inner_text())
            self.assertIn("ChatGPT Plus monthly", page.locator("#calcLines").inner_text())
            self.assertIn("2026-09-25", page.locator("#calcLines").inner_text())
            self.assertTrue(page.locator("#calcLines a").first.get_attribute("href").startswith("https://"))
            page.locator("#calcCopy").click()
            page.wait_for_function("document.getElementById('calcState').textContent.includes('copied')")
            copied = page.evaluate("navigator.clipboard.readText()")
            self.assertIn("$19.99", copied)
            self.assertIn("ChatGPT Plus monthly", copied)
            self.assertIn("not your actual bill", copied)
            page.locator("#calcRegionCny").click()
            self.assertIn("≈¥134.18", page.locator("#calcResult").inner_text())
            self.assertIn("FX conversion", page.locator("#calcResult").inner_text())
            self.assertIn("Checked source price converted by FX", page.locator("#calcLines").inner_text())
            page.locator("#calcCopy").click()
            page.wait_for_function("document.getElementById('calcState').textContent.includes('copied')")
            self.assertIn("≈¥134.18", page.evaluate("navigator.clipboard.readText()"))
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_invalid_draft_survives_language_and_currency_switch(self) -> None:
        context, page, errors = self.open()
        try:
            page.locator("#calcRegionUsd").click()
            tag = "sub-chatgpt-plus-monthly"
            page.locator(f'button[data-calc-tag="{tag}"]').click()
            manual = page.locator(f'input[data-manual-tag="{tag}"]')
            manual.fill("12.")
            self.assertEqual(manual.get_attribute("aria-invalid"), "true")
            self.assertIn("待核价", page.locator("#calcResult").inner_text())
            page.locator("#langEn").click()
            manual = page.locator(f'input[data-manual-tag="{tag}"]')
            self.assertEqual(manual.input_value(), "12.")
            self.assertEqual(manual.get_attribute("aria-invalid"), "true")
            self.assertIn("still unpriced", page.locator("#calcResult").inner_text())
            page.locator("#calcRegionCny").click()
            self.assertIn("≈¥134.18", page.locator("#calcResult").inner_text())
            page.locator("#calcRegionUsd").click()
            self.assertEqual(page.locator(f'input[data-manual-tag="{tag}"]').input_value(), "12.")
            self.assertIn("still unpriced", page.locator("#calcResult").inner_text())
            page.locator(f'button[data-calc-tag="{tag}"]').click()
            page.locator(f'button[data-calc-tag="{tag}"]').click()
            self.assertEqual(page.locator(f'input[data-manual-tag="{tag}"]').input_value(), "")
            self.assertIn("$19.99", page.locator("#calcResult").inner_text())
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_bill_total_sums_displayed_monthly_lines(self) -> None:
        context, page, errors = self.open()
        try:
            page.locator("#langEn").click()
            page.locator("#calcRegionUsd").click()
            page.locator('details[data-calc-vendor="anthropic"] > summary').click()
            page.locator('button[data-calc-tag="sub-claude-pro-yearly"]').click()
            page.locator('details[data-calc-vendor="google"] > summary').click()
            page.locator('button[data-calc-tag="sub-google-ai-pro-yearly"]').click()
            page.locator('input[data-manual-tag="sub-claude-pro-yearly"]').fill("100")
            page.locator('input[data-manual-tag="sub-google-ai-pro-yearly"]').fill("100")
            self.assertEqual(page.locator("#calcLines .calc-line-head span").all_inner_texts(), ["$8.33/mo", "$8.33/mo"])
            self.assertIn("$16.66", page.locator("#calcResult").inner_text())
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_quote_rejects_unverified_wrong_currency_date_or_source(self) -> None:
        source = json.loads((ROOT / "data/llm-cost.json").read_text(encoding="utf-8"))
        for fault in ("status", "currency", "date", "source"):
            with self.subTest(fault=fault):
                fixture = json.loads(json.dumps(source))
                row = next(item for item in fixture["items"] if item["id"] == "chatgpt-plus")
                side = row["prices"]["us"]
                if fault == "status":
                    row["status"] = "draft"
                elif fault == "currency":
                    side["currency"] = "EUR"
                elif fault == "date":
                    side["as_of"] = "2020-01-01"
                else:
                    side["source_url"] = "http://example.invalid/unchecked"
                context = self.browser.new_context(viewport={"width": 390, "height": 844})
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                payload = json.dumps(fixture)
                def serve_price(route):
                    route.fulfill(status=200, content_type="application/json", body=payload)
                page.route("**/data/llm-cost.json", serve_price)
                try:
                    page.goto(self.base + "/cost.html", wait_until="networkidle")
                    page.locator("#calcRegionUsd").click()
                    page.locator('button[data-calc-tag="sub-chatgpt-plus-monthly"]').click()
                    self.assertIn("待核价", page.locator("#calcResult").inner_text())
                    self.assertEqual(errors, [])
                finally:
                    context.close()

    def test_real_wall_uses_public_checked_prices_only(self) -> None:
        def route_api(route) -> None:
            parsed = urllib.parse.urlsplit(route.request.url)
            if parsed.path == "/api/config":
                data = {"ok": True}
            elif parsed.path == "/api/me":
                data = {"ok": True, "signed_in": False}
            elif parsed.path == "/api/wall":
                data = {"ok": True, "items": [{
                    "handle": "wallreader", "kind": "human", "display_name": None,
                    "tags": {"subscription": ["sub-chatgpt-plus-monthly", "sub-claude-max-5x-monthly"],
                             "device": [], "route": []},
                    "bindings": [], "updated_on": "2026-10-08",
                }], "next_cursor": None}
            else:
                data = {"ok": True}
            route.fulfill(
                status=200, content_type="application/json",
                headers={"access-control-allow-origin": self.base,
                         "access-control-allow-credentials": "true"},
                body=json.dumps(data),
            )

        context = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("http://mock.test/**", route_api)
        try:
            page.goto(self.base + "/cost.html?api=http%3A%2F%2Fmock.test", wait_until="networkidle")
            card = page.locator("#setupWall a.setup-card.is-real")
            card.wait_for()
            self.assertIn("134.18", card.inner_text())
            self.assertIn("待核价", card.inner_text())
            page.evaluate("""() => {
                window.__costCard = document.querySelector('#setupWall a.setup-card.is-real');
                window.__costCard.focus();
                document.getElementById('calcRegionUsd').click();
            }""")
            self.assertIn("$19.99", card.inner_text())
            self.assertNotIn("$100", card.inner_text(), "Claude Max 5x 不能借 Claude Pro 或备注价")
            self.assertTrue(page.evaluate("""() => window.__costCard.isConnected &&
                window.__costCard === document.querySelector('#setupWall a.setup-card.is-real') &&
                document.activeElement === window.__costCard"""), "切换币种不应重建配置卡或丢失焦点")
            page.evaluate("""() => localStorage.setItem('renjilian-cost-calc-v1', JSON.stringify({
                region: 'us', selected: ['sub-chatgpt-plus-monthly'],
                manual: {us: {'sub-chatgpt-plus-monthly': '999'}, cn: {}}
            }))""")
            page.reload(wait_until="networkidle")
            card = page.locator("#setupWall a.setup-card.is-real")
            card.wait_for()
            self.assertIn("$999.00", page.locator("#calcResult").inner_text())
            self.assertIn("$19.99", card.locator(".setup-estimate").inner_text())
            self.assertNotIn("$999", card.inner_text(), "本机自填金额不能进入公开配置墙")
            self.assertEqual(errors, [])
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main()
