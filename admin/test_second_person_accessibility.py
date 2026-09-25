#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""第二人称交互可达性收口浏览器门（2026-08-31 source-only 授权包 §4）。

真 CSS viewport 390×844，Playwright 直接给 CSS 像素（无 CLI window-size 假 viewport）。
覆盖：游戏墙/详情浮层/原创认证浮层/百宝箱默认与展开态的
触控 44px、键盘路径、aria-pressed、dialog 命名/焦点进入/圈定/恢复、无横向溢出、console 零错误。
"""
from __future__ import annotations

import functools
import http.server
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
VIEWPORT_390 = {"width": 390, "height": 844}

# 所有可见、可用、指针可点的目标 ≥44×44；单选按关联 label 盒判定
TOUCH_JS = """
(() => {
  const bad = [];
  const seen = new Set();
  const push = (el, box) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (box.width < 44 || box.height < 44)
      bad.push({cls: String(el.className).slice(0, 40), text: (el.textContent || '').trim().slice(0, 14),
                w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10});
  };
  document.querySelectorAll('button, a, input').forEach(el => {
    if (el.disabled || el.offsetParent === null) return;
    if (el.type === 'radio') return;   // 单选按 label 盒
    push(el, el.getBoundingClientRect());
  });
  document.querySelectorAll('input[type=radio]').forEach(r => {
    const label = r.closest('label');
    if (label && label.offsetParent !== null) push(label, label.getBoundingClientRect());
  });
  return bad;
})()
"""

WIDTH_JS = """
(() => ({innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth,
         documentScrollWidth: document.documentElement.scrollWidth,
         bodyScrollWidth: document.body.scrollWidth}))()
"""


class AccessibilityClosureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
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

    def open_page(self, name: str, *, reduced_motion: bool = False):
        context = self.browser.new_context(
            viewport=VIEWPORT_390,
            permissions=["clipboard-read", "clipboard-write"],
            reduced_motion="reduce" if reduced_motion else "no-preference",
        )
        page = context.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{self.base_url}/{name}", wait_until="networkidle")
        return context, page, errors

    def open_games(self, **kw):
        context, page, errors = self.open_page("games.html", **kw)
        page.locator(".card").first.wait_for()
        return context, page, errors

    def open_baibao(self, **kw):
        context, page, errors = self.open_page("baibao.html", **kw)
        page.locator(".treasure-card").first.wait_for()
        return context, page, errors

    def assert_widths_390(self, page) -> None:
        w = page.evaluate(WIDTH_JS)
        self.assertEqual(w, {"innerWidth": 390, "clientWidth": 390,
                             "documentScrollWidth": 390, "bodyScrollWidth": 390})

    def assert_touch_ok(self, page) -> None:
        # 浮层 rj-pop 是 0.16s 缩放动画，先收干净再量，避免把动画中途帧当触控尺寸
        page.evaluate("document.getAnimations().forEach(a => a.finish())")
        page.wait_for_timeout(50)
        self.assertEqual(page.evaluate(TOUCH_JS), [])

    def tab_until(self, page, predicate_js: str, max_tabs: int = 40) -> bool:
        for _ in range(max_tabs):
            if page.evaluate(predicate_js):
                return True
            page.keyboard.press("Tab")
        return page.evaluate(predicate_js)

    # ── 语义：不存在假 span 控件 ──
    def test_no_fake_span_controls(self) -> None:
        context, page, errors = self.open_games()
        try:
            self.assertEqual(page.locator("span.seg-tab").count(), 0)
            self.assertEqual(page.locator("span.tag").count(), 0)
            self.assertEqual(page.locator("span.chip").count(), 0)
            self.assertEqual(page.locator("span#fav-chip").count(), 0)
            self.assertEqual(page.locator("#board-tabs button.seg-tab").count(), 3)
            self.assertEqual(page.locator("#lv-chips button.chip").count(), 4)
            self.assertEqual(page.locator("button#fav-chip").count(), 1)
            self.assertGreaterEqual(page.locator(".card .btn-detail").count(), 100)
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 真390：默认墙触控与宽度 ──
    def test_games_default_390(self) -> None:
        context, page, errors = self.open_games()
        try:
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 版面/分级/收藏：键盘可达 + aria-pressed 同步 + 筛选结果不变 ──
    def test_board_lv_fav_keyboard_and_pressed(self) -> None:
        context, page, errors = self.open_games()
        try:
            ok = self.tab_until(page, "document.activeElement && document.activeElement.dataset && document.activeElement.dataset.board === 'human'")
            self.assertTrue(ok, "Tab 无法到达人类版面按钮")
            page.keyboard.press("Enter")
            self.assertEqual(page.locator('#board-tabs [aria-pressed="true"]').get_attribute("data-board"), "human")
            cards = page.locator(".card")
            self.assertGreater(cards.count(), 0)
            for i in range(cards.count()):
                self.assertEqual(cards.nth(i).get_attribute("data-at"), "human")
            page.locator('[data-lv="r18"]').click()
            self.assertEqual(page.locator('#lv-chips [aria-pressed="true"]').get_attribute("data-lv"), "r18")
            fav = page.locator("#fav-chip")
            fav.click()
            self.assertEqual(fav.get_attribute("aria-pressed"), "true")
            fav.click()
            self.assertEqual(fav.get_attribute("aria-pressed"), "false")
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 标签筛选：按钮化 + 清除原生按钮 + 展示文本不可点 ──
    def test_tag_filter_flow(self) -> None:
        context, page, errors = self.open_games()
        try:
            first_tag = page.locator(".card .meta .tag").first
            tag_name = first_tag.get_attribute("data-tag")
            first_tag.click()
            tf = page.locator("#tag-filter")
            self.assertTrue(tf.is_visible())
            self.assertIn("#" + tag_name, tf.locator(".chip-static").inner_text())
            clear = page.locator("#tag-clear")
            self.assertEqual(clear.evaluate("el => el.tagName"), "BUTTON")
            clear.focus()
            page.keyboard.press("Enter")
            self.assertTrue(page.locator("#tag-filter").is_hidden())
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 详情浮层：命名、焦点进入、圈定、Escape 恢复 ──
    def test_detail_dialog_focus_cycle(self) -> None:
        context, page, errors = self.open_games()
        try:
            trigger = page.locator(".card .btn-detail").first
            self.assertTrue((trigger.get_attribute("aria-label") or "").startswith("查看详情："))
            trigger.focus()
            page.keyboard.press("Enter")
            page.wait_for_selector("#rj-overlay:not([hidden])")
            dialog = page.locator("#rj-overlay .rj-modal")
            self.assertEqual(dialog.get_attribute("aria-labelledby"), "rj-modal-title")
            self.assertEqual(page.evaluate("document.activeElement.className"), "rj-m-close")
            # Tab 连续 12 步不出浮层
            for _ in range(12):
                page.keyboard.press("Tab")
                self.assertTrue(page.evaluate(
                    "document.querySelector('#rj-overlay .rj-modal').contains(document.activeElement)"))
            # 从关闭按钮 Shift+Tab 跳尾部
            page.evaluate("document.querySelector('#rj-overlay .rj-m-close').focus()")
            page.keyboard.press("Shift+Tab")
            self.assertTrue(page.evaluate(
                "document.querySelector('#rj-overlay .rj-modal').contains(document.activeElement)"))
            self.assertNotEqual(page.evaluate("document.activeElement.className"), "rj-m-close")
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            page.keyboard.press("Escape")
            page.wait_for_selector("#rj-overlay[hidden]", state="attached")
            self.assertTrue(page.evaluate(
                "document.activeElement && document.activeElement.classList.contains('btn-detail')"))
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 详情内动作：点赞/收藏/复制/标签键盘可执行 ──
    def test_detail_actions_keyboard(self) -> None:
        context, page, errors = self.open_games()
        try:
            page.locator(".card .btn-detail").first.focus()
            page.keyboard.press("Enter")
            page.wait_for_selector("#rj-overlay:not([hidden])")
            like = page.locator(".rj-like")
            like.focus()
            page.keyboard.press("Enter")
            self.assertEqual(like.get_attribute("aria-pressed"), "true")
            like.focus()
            page.keyboard.press("Enter")
            self.assertEqual(like.get_attribute("aria-pressed"), "false")
            fav = page.locator(".rj-fav")
            fav.focus()
            page.keyboard.press("Enter")
            self.assertEqual(fav.get_attribute("aria-pressed"), "true")
            page.locator(".rj-m-copy").focus()
            page.keyboard.press("Enter")
            page.wait_for_selector("#rj-toast.show")
            self.assertEqual(page.locator("#rj-toast").get_attribute("role"), "status")
            # 浮层标签：键盘激活 → 关闭浮层并按标签筛选
            tag = page.locator(".rj-m-meta .tag").first
            name = tag.get_attribute("data-tag")
            tag.focus()
            page.keyboard.press("Enter")
            page.wait_for_selector("#rj-overlay[hidden]", state="attached")
            self.assertIn("#" + name, page.locator("#tag-filter").inner_text())
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 原创认证浮层：焦点进入/圈定/恢复到卡片入口，触控与宽度 ──
    def test_claim_dialog_focus_cycle(self) -> None:
        context, page, errors = self.open_games()
        try:
            page.locator(".card .btn-detail").first.focus()
            page.keyboard.press("Enter")
            page.wait_for_selector("#rj-overlay:not([hidden])")
            ok = self.tab_until(page, "document.activeElement && document.activeElement.classList.contains('rj-m-claim')")
            self.assertTrue(ok, "Tab 无法到达原创认证按钮")
            page.keyboard.press("Enter")
            page.wait_for_selector("#claim-overlay:not([hidden])")
            dialog = page.locator("#claim-overlay .rj-modal")
            self.assertEqual(dialog.get_attribute("aria-labelledby"), "claim-title")
            self.assertEqual(page.evaluate(
                "document.activeElement.className"), "rj-m-close")
            for _ in range(10):
                page.keyboard.press("Tab")
                self.assertTrue(page.evaluate(
                    "document.querySelector('#claim-overlay .rj-modal').contains(document.activeElement)"))
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(page.locator(".claim-hint").get_attribute("aria-live"), "polite")
            page.keyboard.press("Escape")
            page.wait_for_selector("#claim-overlay[hidden]", state="attached")
            self.assertTrue(page.evaluate(
                "document.activeElement && document.activeElement.classList.contains('btn-detail')"))
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 百宝箱：搜索框 44px 收口，默认/展开态宽度与触控 ──
    def test_baibao_search_and_expand_390(self) -> None:
        context, page, errors = self.open_baibao()
        try:
            box = page.locator("#treasure-query").bounding_box()
            self.assertGreaterEqual(box["height"], 44)
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            bring = page.locator('.treasure-card [data-action="bring"]').first
            bring.click()
            panel = page.locator('.treasure-card [data-panel="bring"]').first
            self.assertFalse(panel.is_hidden())
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 公开更新日志：真读 Markdown、390 无溢出、footer 入口可点 ──
    def test_changelog_390(self) -> None:
        context, page, errors = self.open_page("changelog.html")
        try:
            page.locator(".release-entry").first.wait_for()
            self.assertGreaterEqual(page.locator(".release-entry").count(), 4)
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(page.locator('footer a[href="https://mymomentsmaker.com/"]').count(), 1)
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_kanread_390(self) -> None:
        context, page, errors = self.open_page("kanread.html")
        try:
            page.locator(".board-head h2").wait_for()
            # 空态也要是一句人话，不是报错
            state = page.locator(".kanread-list .log-state")
            if state.count():
                self.assertNotIn("读不出来", state.inner_text())
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(page.locator('footer a[href="https://mymomentsmaker.com/"]').count(), 1)
            # 刊读已开放，进顶栏；脉搏只走子栏
            self.assertEqual(page.locator('nav.boards a[href="kanread.html"]').count(), 1)
            self.assertEqual(page.locator('nav.boards a[href="pulse.html"]').count(), 0)
            self.assertEqual(page.locator('nav.subnav a').count(), 2)
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_pulse_390(self) -> None:
        context, page, errors = self.open_page("pulse.html")
        try:
            page.locator(".pulse-item").first.wait_for()
            self.assertGreaterEqual(page.locator(".pulse-item").count(), 3)
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(page.locator("iframe").count(), 0)
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── P2-a 新页（2026-09-18）。注意：committed 状态下 apiBase 为空，
    #    所以这两页和刊读页都不会发任何网络请求，走的是「没有后端」那条静态路径。──
    def test_account_390(self) -> None:
        context, page, errors = self.open_page("account.html")
        try:
            page.locator(".board-head h2").wait_for()
            # 后端没接上 → 只显示「账号还没开」，不报错、不出半截表单
            self.assertTrue(page.locator("#panelOffline").is_visible())
            self.assertFalse(page.locator("#panelGuest").is_visible())
            self.assertFalse(page.locator("#panelMe").is_visible())
            # 站内立场必须写在页面上
            body = page.locator("body").inner_text()
            self.assertIn("本站不验证任何人是谁", body)
            self.assertIn("本站没有任何官方模型账号", body)
            # 不进顶栏，入口在页脚
            self.assertEqual(page.locator('nav.boards a[href="account.html"]').count(), 0)
            self.assertEqual(page.locator('footer a[href="rules.html"]').count(), 1)
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_rules_390(self) -> None:
        context, page, errors = self.open_page("rules.html")
        try:
            page.locator(".rj-rules").wait_for()
            body = page.locator("body").inner_text()
            self.assertIn("你在这里写下的话，会被别的 AI 读走", body)
            self.assertIn("只看账号新旧，跟你是机机还是人类无关", body)
            self.assertEqual(page.locator('nav.boards a[href="rules.html"]').count(), 0)
            self.assertEqual(page.locator('footer a[href="account.html"]').count(), 1)
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_kanread_comment_placeholder_survives_without_backend_390(self) -> None:
        """apiBase 为空时，评论区必须还是那句占位文案，且一个网络请求都不发。"""
        context, page, errors = self.open_page("kanread.html")
        try:
            page.locator(".kanread-card").first.wait_for()
            calls: list[str] = []
            page.on("request", lambda r: calls.append(r.url))
            page.wait_for_timeout(300)
            self.assertEqual(page.evaluate("window.RJ_CONFIG.apiBase"), "")
            self.assertEqual(page.evaluate("window.RJ_API.enabled"), False)
            box = page.locator(".kr-comments").first
            self.assertIn("评论区还没开放", box.inner_text())
            self.assertEqual(page.locator(".rjc-input").count(), 0, "没有后端时不许出现发表框")
            self.assertEqual(page.locator(".rjc-item").count(), 0)
            self.assertEqual([u for u in calls if "/api/" in u], [], "没有后端时不该发 API 请求")
            self.assert_widths_390(page)
            self.assert_touch_ok(page)
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 1-核（2026-09-26）：games 按 id 深链、跨板块「相关」一行 ──
    def test_games_deep_link_opens_the_card_390(self) -> None:
        qid = "q-ms6cixkx-37qaff"
        context, page, errors = self.open_page(f"games.html#{qid}")
        try:
            page.locator("#rj-overlay:not([hidden])").wait_for()
            self.assertEqual(page.locator("#rj-modal-title").inner_text(), "如果服务器马上要关闭")
            self.assertTrue(page.evaluate("document.activeElement.classList.contains('rj-m-close')"))
            self.assert_widths_390(page)
            page.keyboard.press("Escape")
            self.assertTrue(page.locator("#rj-overlay").is_hidden())
            # 焦点回到那张卡自己的「查看详情」
            self.assertEqual(page.evaluate(
                "document.activeElement.closest('article.card') && document.activeElement.closest('article.card').dataset.qid"), qid)
            self.assertTrue(page.evaluate("document.activeElement.classList.contains('btn-detail')"))
            # 换一个 hash 也能开（页内跳转）
            page.evaluate("location.hash = '#q-20260729-20367594'")
            page.locator("#rj-overlay:not([hidden])").wait_for()
            self.assertEqual(page.locator("#rj-modal-title").inner_text(), "小机问答系列")
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_games_ignores_unknown_hash(self) -> None:
        context, page, errors = self.open_page("games.html#q-does-not-exist")
        try:
            page.locator(".card").first.wait_for()
            page.wait_for_timeout(200)
            self.assertTrue(page.locator("#rj-overlay").is_hidden())
            self.assertEqual(errors, [])
        finally:
            context.close()

    def related_hrefs(self, page, scope: str) -> list[str]:
        page.locator(f"{scope} .rj-related:not([hidden]) a").first.wait_for()
        return page.eval_on_selector_all(f"{scope} .rj-related a", "els => els.map(e => e.getAttribute('href'))")

    def test_related_rows_render_on_all_four_boards_390(self) -> None:
        cases = (
            ("kanread.html", "#kr-liu-shengyu-bury-talent",
             ["pulse.html#pl-20260914-liu-farewell", "games.html#q-ms6cixkx-37qaff", "games.html#q-20260729-20367594"]),
            ("pulse.html", "#pl-20260910-deepseek-v41-flash", ["kanread.html#kr-liu-shengyu-bury-talent"]),
            ("baibao.html", "#renji-love-mcp", ["kanread.html#kr-liu-shengyu-bury-talent", "cost.html#claude-pro"]),
            ("cost.html", "#claude-pro", ["baibao.html#renji-love-mcp"]),
        )
        for name, scope, hrefs in cases:
            with self.subTest(page=name):
                context, page, errors = self.open_page(name)
                try:
                    self.assertEqual(self.related_hrefs(page, scope), hrefs)
                    self.assert_widths_390(page)
                    self.assert_touch_ok(page)
                    self.assertEqual(errors, [])
                finally:
                    context.close()

    def test_cost_wall_button_speaks_to_people_without_an_account(self) -> None:
        context, page, errors = self.open_page("cost.html")
        try:
            cta = page.locator("#wallCta")
            cta.wait_for()
            self.assertIn("没号？注册后挑好配置就能上墙", cta.inner_text())
            self.assertGreaterEqual(cta.bounding_box()["height"], 44)
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── reduced-motion 运行时归零 ──
    def test_reduced_motion_runtime(self) -> None:
        context, page, errors = self.open_games(reduced_motion=True)
        try:
            dur = page.evaluate("getComputedStyle(document.getElementById('rj-toast')).transitionDuration")
            self.assertEqual(dur, "0s")
            self.assertTrue(page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"))
            self.assertEqual(errors, [])
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main()
