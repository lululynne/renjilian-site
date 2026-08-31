#!/opt/homebrew/opt/python@3.14/bin/python3.14
from __future__ import annotations

import functools
import http.server
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class BaibaoBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(
            http.server.SimpleHTTPRequestHandler,
            directory=str(ROOT),
        )
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def open_page(self, *, width: int = 1100, height: int = 900):
        page = self.browser.new_page(viewport={"width": width, "height": height})
        errors: list[str] = []
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(f"{self.base_url}/baibao.html", wait_until="networkidle")
        page.locator(".treasure-card").first.wait_for()
        return page, errors

    def test_catalog_renders_counts_and_filters(self) -> None:
        page, errors = self.open_page()
        try:
            self.assertEqual(page.locator(".treasure-card").count(), 8)
            self.assertEqual(page.locator("#count-all").inner_text(), "8")
            page.get_by_role("button", name="互动娱乐", exact=True).click()
            self.assertEqual(page.locator(".treasure-card").count(), 4)
            page.get_by_role("button", name="全部", exact=True).click()
            page.locator("#treasure-query").fill("麦当劳")
            self.assertEqual(page.locator(".treasure-card").count(), 1)
            self.assertIn("麦当劳 MCP", page.locator(".treasure-card h3").inner_text())
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_candidate_cards_have_no_install_link(self) -> None:
        page, _errors = self.open_page()
        try:
            candidates = page.locator('.treasure-status[data-status="candidate"]')
            self.assertEqual(candidates.count(), 2)
            self.assertEqual(page.locator(".treasure-link").count(), 7)
            self.assertEqual(page.get_by_text("来源尚未核验，暂不提供安装入口").count(), 4)
        finally:
            page.close()

    def test_access_filter_and_aria_pressed_state(self) -> None:
        page, errors = self.open_page()
        try:
            button = page.get_by_role("button", name="关键动作确认", exact=True)
            button.click()
            self.assertEqual(page.locator(".treasure-card").count(), 5)
            self.assertEqual(button.get_attribute("aria-pressed"), "true")
            self.assertEqual(
                page.get_by_role("button", name="全部方式", exact=True).get_attribute("aria-pressed"),
                "false",
            )
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_verified_cards_have_dual_actions_candidates_have_none(self) -> None:
        page, errors = self.open_page()
        try:
            self.assertEqual(page.locator(".treasure-actions").count(), 3)
            self.assertEqual(page.locator('[data-action="bring"]').count(), 3)
            self.assertEqual(page.locator('[data-action="try"]').count(), 3)
            for card_id in ("candidate-mcdonalds", "candidate-alipay", "planned-renji-love", "planned-lutopia-entry"):
                card = page.locator(f'.treasure-card[data-card-id="{card_id}"]')
                self.assertEqual(card.locator("[data-action]").count(), 0)
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_adult_gate_lock_unlock_and_relock_on_reload(self) -> None:
        page, errors = self.open_page()
        try:
            spicy = page.locator('.treasure-card[data-card-id="spicy-monopoly"]')
            self.assertEqual(spicy.locator(".treasure-lock").count(), 1)
            self.assertEqual(spicy.locator("[data-action]").count(), 0)
            spicy.get_by_role("button", name="我已成年，查看项目").click()
            self.assertEqual(page.locator(".treasure-lock").count(), 0)
            self.assertEqual(spicy.locator("[data-action]").count(), 2)
            self.assertTrue(page.locator("#treasure-toast.show").count() == 1)
            page.reload(wait_until="networkidle")
            page.locator(".treasure-card").first.wait_for()
            spicy_after = page.locator('.treasure-card[data-card-id="spicy-monopoly"]')
            self.assertEqual(spicy_after.locator(".treasure-lock").count(), 1)
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_r18_filter_keeps_cards_locked(self) -> None:
        page, errors = self.open_page()
        try:
            page.get_by_role("button", name="18+", exact=True).click()
            self.assertEqual(page.locator(".treasure-card").count(), 1)
            locked = page.locator('.treasure-card[data-card-id="spicy-monopoly"]')
            self.assertEqual(locked.locator(".treasure-lock").count(), 1)
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_bring_panel_shows_copy_text_and_safe_outbound(self) -> None:
        page, errors = self.open_page()
        try:
            sound = page.locator('.treasure-card[data-card-id="sound-apple-music"]')
            panel = sound.locator('.treasure-panel[data-panel="bring"]')
            self.assertFalse(panel.is_visible())
            sound.get_by_role("button", name="安装与配置").click()
            self.assertTrue(panel.is_visible())
            self.assertIn("brew install seayniclabs/tap/sound", panel.locator('[data-install-view="0"] code').inner_text())
            copy_button = panel.locator('[data-install-view="0"] .treasure-copy')
            self.assertIn(
                "claude mcp add sound",
                copy_button.get_attribute("data-copy"),
            )
            copy_button.click()
            page.wait_for_function(
                "document.getElementById('treasure-toast').textContent.length > 0"
            )
            self.assertNotEqual(page.locator("#treasure-toast").inner_text(), "")
            outbound = panel.locator(".treasure-outbound a")
            self.assertEqual(outbound.get_attribute("href"), "https://github.com/seayniclabs/sound")
            self.assertEqual(outbound.get_attribute("target"), "_blank")
            self.assertIn("noopener", outbound.get_attribute("rel"))
            self.assertIn("noreferrer", outbound.get_attribute("rel"))
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_try_panel_levels_and_secret_note(self) -> None:
        page, errors = self.open_page()
        try:
            mixcraft = page.locator('.treasure-card[data-card-id="mixcraft"]')
            try_panel = mixcraft.locator('.treasure-panel[data-panel="try"]')
            self.assertFalse(try_panel.is_visible())
            mixcraft.get_by_role("button", name="在线体验").click()
            self.assertTrue(try_panel.is_visible())
            self.assertIn("L1", try_panel.locator(".treasure-level").first.inner_text())
            remote_link = try_panel.locator(".treasure-experience.remote a")
            self.assertEqual(remote_link.get_attribute("href"), "https://mixcraft.app/")
            self.assertEqual(remote_link.get_attribute("target"), "_blank")
            self.assertIn("noopener", remote_link.get_attribute("rel"))

            mixcraft.get_by_role("button", name="安装与配置").click()
            bring_panel = mixcraft.locator('.treasure-panel[data-panel="bring"]')
            self.assertTrue(bring_panel.is_visible())
            self.assertIn("<YOUR_KEY>", bring_panel.locator(".treasure-secret-note").inner_text())

            sound = page.locator('.treasure-card[data-card-id="sound-apple-music"]')
            sound.get_by_role("button", name="在线体验").click()
            sound_try = sound.locator('.treasure-panel[data-panel="try"]')
            self.assertIn("L1 · 安装后效果回放", sound_try.inner_text())
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_reduced_motion_disables_toast_transition(self) -> None:
        page, errors = self.open_page()
        try:
            page.emulate_media(reduced_motion="reduce")
            duration = page.locator("#treasure-toast").evaluate(
                "element => getComputedStyle(element).transitionDuration"
            )
            self.assertIn(duration, {"0s", "0s, 0s"})
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_install_tabs_switch_view_and_aria_state(self) -> None:
        page, errors = self.open_page()
        try:
            sound = page.locator('.treasure-card[data-card-id="sound-apple-music"]')
            bring = sound.get_by_role("button", name="安装与配置")
            self.assertEqual(bring.get_attribute("aria-expanded"), "false")
            self.assertEqual(bring.get_attribute("aria-controls"), "panel-sound-apple-music-bring")
            bring.click()
            self.assertEqual(bring.get_attribute("aria-expanded"), "true")

            tabs = sound.locator("[data-install-tab]")
            self.assertEqual(tabs.count(), 2)
            first_view = sound.locator('[data-install-view="0"]')
            second_view = sound.locator('[data-install-view="1"]')
            self.assertTrue(first_view.is_visible())
            self.assertFalse(second_view.is_visible())
            self.assertEqual(tabs.nth(0).get_attribute("aria-pressed"), "true")
            self.assertEqual(tabs.nth(1).get_attribute("aria-pressed"), "false")

            tabs.nth(1).click()
            self.assertFalse(first_view.is_visible())
            self.assertTrue(second_view.is_visible())
            self.assertIn("mcpServers", second_view.locator("code").inner_text())
            self.assertEqual(tabs.nth(0).get_attribute("aria-pressed"), "false")
            self.assertEqual(tabs.nth(1).get_attribute("aria-pressed"), "true")

            tabs.nth(0).click()
            self.assertTrue(first_view.is_visible())
            self.assertFalse(second_view.is_visible())

            sound.get_by_role("button", name="在线体验").click()
            self.assertEqual(bring.get_attribute("aria-expanded"), "false")
            try_button = sound.get_by_role("button", name="在线体验")
            self.assertEqual(try_button.get_attribute("aria-expanded"), "true")
            self.assertEqual(try_button.get_attribute("aria-controls"), "panel-sound-apple-music-try")
            self.assertTrue(sound.locator("#panel-sound-apple-music-try").is_visible())
            self.assertEqual(errors, [])
        finally:
            page.close()

    def test_mobile_is_single_column_without_horizontal_overflow(self) -> None:
        page, errors = self.open_page(width=390, height=844)
        try:
            columns = page.locator("#treasure-grid").evaluate(
                "element => getComputedStyle(element).gridTemplateColumns.split(' ').length"
            )
            overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            self.assertEqual(columns, 1)
            self.assertFalse(overflow)
            self.assertEqual(errors, [])
        finally:
            page.close()


if __name__ == "__main__":
    unittest.main()
