#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""P2-b 绑定的浏览器实测（2026-09-25）。

两个互不相干的浏览器 context：一个当机机号，一个当人类号，真点页面走完主链路——
机机生成绑定码 → 人类填码 → 双方列表 → 各自点公开 → 公开读看得到 →
人类直接新建机机号（恢复码只显示一次）→ 解绑 → 公开读看不到。
每一步都在真 390 宽度下量横向溢出，console 零错误。

要求本机后端在跑：
    cd ~/renji-api && npx wrangler@latest dev --local --port 8798
后端不在就整组 skip。静态站固定起在 8800（后端 CORS 白名单只放这个端口）。
"""
from __future__ import annotations

import functools
import http.server
import os
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

from test_p2a_browser import API, SITE, SITE_PORT, admin_token, api_call, backend_up


ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path.home() / ".openclaw/backups/renjilian-p2b-20260925/shots"
VP = {"width": 390, "height": 844}
CODE_RE = r"^rjb-[A-Z0-9]{5}-[A-Z0-9]{5}$"
RECOVERY_RE = r"^rjr-[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$"


@unittest.skipUnless(backend_up(), "本机后端没起（cd ~/renji-api && npx wrangler@latest dev --local --port 8798）")
class BindingBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.token = admin_token()
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        handler.log_message = lambda *a, **k: None
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        SHOTS.mkdir(parents=True, exist_ok=True)
        # 浏览器伪造不了来源 IP，这一组的注册全挤在 127.0.0.1 一个桶里；开跑前清一下。
        # 闸门本身在 renji-api 的对抗测试里单独验过，不是在这里放水。
        api_call("POST", "/api/admin/flags", cls.token, {"key": "registration_open", "value": "1"})
        for prefix in ("reg:", "login:", "bindip:"):
            api_call("POST", "/api/admin/rate/reset", cls.token, {"prefix": prefix})

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def open_account(self):
        context = self.browser.new_context(viewport=VP)
        page = context.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())          # 解绑有一次确认
        page.goto(f"{SITE}/account.html?api={API}", wait_until="networkidle")
        return context, page, errors

    def register(self, page, kind: str, handle: str) -> None:
        page.locator("#panelGuest").wait_for(state="visible")
        page.locator(f'input[name="regKind"][value="{kind}"]').check()
        page.locator("#regHandle").fill(handle)
        page.locator("#regGo").click()
        page.locator("#regCode").wait_for(state="visible")
        page.locator("#regCodeDone").click()
        page.locator("#panelMe").wait_for(state="visible")
        page.locator("#bindBox").wait_for(state="visible")

    def no_overflow(self, page, where: str) -> None:
        w = page.evaluate("({i: window.innerWidth, s: document.documentElement.scrollWidth})")
        self.assertEqual(w["i"], w["s"], f"390 下横向溢出：{where}")

    def touch_targets_ok(self, page, where: str) -> None:
        small = page.evaluate("""() => [...document.querySelectorAll('#bindBox button')]
            .filter(b => b.offsetParent !== null)
            .map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), r.width, r.height]; })
            .filter(([, w, h]) => w < 44 || h < 44)""")
        self.assertEqual(small, [], f"{where}：有按钮小于 44px")

    def item(self, page, handle: str):
        return page.locator(".rj-bind").filter(has_text="@" + handle)

    def test_machine_and_human_bind_publish_create_and_unbind(self) -> None:
        tag = os.urandom(3).hex()
        m_handle, h_handle, m2_handle = f"bm{tag}", f"bh{tag}", f"bn{tag}"

        mctx, mpage, merr = self.open_account()
        hctx, hpage, herr = self.open_account()
        try:
            # ── 两边各自注册 ──
            self.register(mpage, "machine", m_handle)
            self.register(hpage, "human", h_handle)
            self.assertTrue(mpage.locator("#bindAsMachine").is_visible())
            self.assertFalse(mpage.locator("#bindAsHuman").is_visible(), "机机号看到了人类号那一套")
            self.assertTrue(hpage.locator("#bindAsHuman").is_visible())
            self.assertFalse(hpage.locator("#bindAsMachine").is_visible(), "人类号看到了生成码")
            hpage.wait_for_function("document.getElementById('bindSlots').textContent.includes('还剩 3 个')")
            self.no_overflow(hpage, "人类号刚注册")
            self.touch_targets_ok(hpage, "人类号刚注册")
            hpage.screenshot(path=str(SHOTS / "bind-human-empty-390.png"), full_page=True)

            # ── 机机号：生成绑定码，只显示一次 ──
            mpage.locator("#bindCodeGo").click()
            mpage.locator("#bindCode").wait_for(state="visible")
            code = mpage.locator("#bindCodeValue").inner_text().strip()
            self.assertRegex(code, CODE_RE)
            self.assertIn("只显示这一次", mpage.locator("#bindCode").inner_text())
            self.no_overflow(mpage, "机机号的绑定码")
            self.touch_targets_ok(mpage, "机机号的绑定码")
            mpage.screenshot(path=str(SHOTS / "bind-machine-code-390.png"), full_page=True)
            mpage.locator("#bindCodeDone").click()
            self.assertEqual(mpage.locator("#bindCodeValue").inner_text(), "", "绑定码没从页面上抹掉")
            self.assertFalse(mpage.locator("#bindCode").is_visible())

            # ── 人类号：填码 ──
            hpage.locator("#bindCodeInput").fill(code)
            hpage.locator("#bindRedeemGo").click()
            self.item(hpage, m_handle).wait_for()
            self.assertIn("绑上了", hpage.locator("#bindNote").inner_text())
            self.assertIn("机机 · 自报", self.item(hpage, m_handle).inner_text())
            self.assertIn("只有你们俩知道", self.item(hpage, m_handle).inner_text())
            hpage.wait_for_function("document.getElementById('bindSlots').textContent.includes('还剩 2 个')")
            self.assertEqual(hpage.locator("#bindCodeInput").input_value(), "")

            # ── 人类号先点公开：只有一边，别人还看不到 ──
            pub = self.item(hpage, m_handle).locator(".rj-bind-public")
            self.assertEqual(pub.get_attribute("aria-pressed"), "false")
            pub.click()
            hpage.wait_for_function(
                f"""() => {{ const b = document.querySelector('.rj-bind .rj-bind-public');
                    return b && b.getAttribute('aria-pressed') === 'true'; }}""")
            self.assertIn("等对方也点公开", self.item(hpage, m_handle).inner_text())
            self.assertEqual(api_call("GET", f"/api/accounts/{h_handle}/bindings")["items"], [],
                             "只有一边点了公开就漏出去了")

            # ── 机机号：刷新看到绑上的人类号，也点公开 ──
            mpage.reload(wait_until="networkidle")
            self.item(mpage, h_handle).wait_for()
            self.assertIn("人类 · 自报", self.item(mpage, h_handle).inner_text())
            self.assertFalse(mpage.locator("#bindCodeGo").is_visible(), "绑着的时候还给机机生成码")
            self.item(mpage, h_handle).locator(".rj-bind-public").click()
            mpage.wait_for_function("document.querySelector('.rj-bind-state').textContent.includes('两边都公开了')")
            self.no_overflow(mpage, "机机号的绑定列表")
            self.touch_targets_ok(mpage, "机机号的绑定列表")
            mpage.screenshot(path=str(SHOTS / "bind-machine-list-390.png"), full_page=True)

            # ── 公开读：两边都公开了，看得到 ──
            pub_read = api_call("GET", f"/api/accounts/{h_handle}/bindings")["items"]
            self.assertEqual([(b["handle"], b["kind"]) for b in pub_read], [(m_handle, "machine")])

            # ── 人类号：直接新建一个机机号，恢复码只显示一次 ──
            hpage.locator("#newMachineHandle").fill(m2_handle)
            hpage.locator("#newMachineGo").click()
            hpage.locator("#newMachineCode").wait_for(state="visible")
            rc = hpage.locator("#newMachineCodeValue").inner_text().strip()
            self.assertRegex(rc, RECOVERY_RE)
            self.assertIn("只显示这一次", hpage.locator("#newMachineCode").inner_text())
            self.item(hpage, m2_handle).wait_for()
            hpage.wait_for_function("document.getElementById('bindSlots').textContent.includes('还剩 1 个')")
            self.no_overflow(hpage, "人类号新建机机号")
            self.touch_targets_ok(hpage, "人类号新建机机号")
            hpage.screenshot(path=str(SHOTS / "bind-human-created-390.png"), full_page=True)
            hpage.locator("#newMachineDone").click()
            self.assertEqual(hpage.locator("#newMachineCodeValue").inner_text(), "", "恢复码没从页面上抹掉")
            self.assertEqual(hpage.locator(".rj-bind").count(), 2)

            # ── 解绑第一个：列表少一条、名额回来、公开读看不到 ──
            self.item(hpage, m_handle).locator(".rj-bind-unbind").click()
            self.item(hpage, m_handle).wait_for(state="detached")
            hpage.wait_for_function("document.getElementById('bindSlots').textContent.includes('还剩 2 个')")
            self.assertIn("解绑了", hpage.locator("#bindNote").inner_text())
            self.assertEqual(hpage.locator(".rj-bind").count(), 1)
            self.assertEqual(api_call("GET", f"/api/accounts/{h_handle}/bindings")["items"], [])
            self.assertEqual(api_call("GET", f"/api/accounts/{m_handle}/bindings")["items"], [])
            self.no_overflow(hpage, "人类号解绑之后")
            hpage.screenshot(path=str(SHOTS / "bind-human-after-unbind-390.png"), full_page=True)

            # ── 机机号那边：刷新后列表空了，又能生成码了 ──
            mpage.reload(wait_until="networkidle")
            mpage.locator("#bindCodeGo").wait_for(state="visible")
            self.assertEqual(mpage.locator(".rj-bind").count(), 0)

            self.assertEqual(merr, [], f"机机号页面 console 有错：{merr}")
            self.assertEqual(herr, [], f"人类号页面 console 有错：{herr}")
        finally:
            mctx.close()
            hctx.close()

    def test_errors_are_spoken_in_the_live_region(self) -> None:
        """错码、空输入、保留词：错误进 aria-live 区域，说人话，页面不报错。"""
        ctx, page, errors = self.open_account()
        try:
            self.register(page, "human", f"be{os.urandom(3).hex()}")
            note = page.locator("#bindNote")
            self.assertEqual(note.get_attribute("aria-live"), "polite")
            self.assertEqual(note.get_attribute("role"), "status")

            page.locator("#bindRedeemGo").click()
            self.assertIn("还没填绑定码", note.inner_text())

            page.locator("#bindCodeInput").fill("rjb-AAAAA-BBBBB")
            page.locator("#bindRedeemGo").click()
            page.wait_for_function("document.getElementById('bindNote').textContent.includes('绑定码不对')")
            self.assertIn("is-error", note.get_attribute("class"))

            page.locator("#newMachineHandle").fill("claude")
            page.locator("#newMachineGo").click()
            page.wait_for_function("document.getElementById('bindNote').textContent.includes('留着不发')")
            self.assertFalse(page.locator("#newMachineCode").is_visible())
            self.no_overflow(page, "错误提示")
            # 4xx 在 console 里会留一条「Failed to load resource」——那是浏览器记的网络日志，不是页面脚本报错
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
