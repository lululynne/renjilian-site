#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""账号恢复界面的浏览器回归。假后端只提供API契约响应，验证真实页面DOM；不操作生产数据。"""
from __future__ import annotations

import functools
import http.server
import json
import threading
import unittest
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

from test_p25_machine_keys import MOCK, ROOT, VP390, FakeBackend, QuietHandler


# ── fixture：测试字串，不是真凭证；文案照抄 renji-api/src/account-recovery.js ──

CODE = "rjr-fakecodefakecodefakecode01"
NEW_CODE = "rjr-fakecodefakecodefakecode02"
TOKEN = "rrl_" + "abcdefgh" * 8   # 凑齐 rrl_ + 64 个 Crockford 字符的外形

STATUS_NOTICE = "关闭普通网页后会保持登录；每次成功使用都从当时起续满180天。主动退出、注销或更换恢复码会撤销会话。"
LEGACY_409 = "这个旧号还没有保存可查看的恢复码。用原码登录一次即可补存；原码忘了但还登录着，也可以明确换一串新码。"
TEMP_503 = "恢复码暂时打不开，稍后再试。"
REPLACE_NOTICE = "新码已生效，旧码、其他设备会话和你签出的机机钥匙已作废。当前设备仍登录着，响应丢失也可以点查看找回新码。"
CANCEL_NOTICE = "找回申请已撤回，旧恢复码继续有效。"
COMPLETE_NOTICE = "新恢复码已生成。旧码、旧登录会话和旧授权钥匙已作废；请收好新码，再回账号页登录。"
REREAD_NOTICE = "这次链接已经重设过，只重读同一串新码。收好后可以关闭这次交付。"
LINK_DEAD = "链接已经失效。"
ACK_NOTICE = "这次新码交付已关闭。"
READY_AT = "2031-01-02T03:04:05.000Z"


def real_errors(errors: list[str]) -> list[str]:
    """故意触发 HTTP 错误的用例里，浏览器自己会记一条资源加载失败；其余都不许有。"""
    return [e for e in errors if not e.startswith("Failed to load resource")]


def no_storage(page, *needles: str) -> None:
    keys = page.evaluate(
        "() => [Object.keys(localStorage).filter(k => !['rj_signed_in','rj_session_selector'].includes(k)).length, sessionStorage.length]")
    assert keys == [0, 0], keys
    blob = page.evaluate("() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage)")
    for n in needles:
        assert n not in blob, n


class SecurityBackend(FakeBackend):
    """账号页「恢复码与登录」面板的契约假后端。只回已定义的 API 边界。"""

    def __init__(self, kind: str = "human", saved: bool = True, pending: dict | None = None,
                 email_recovery: bool = False, reveal_error: tuple[int, str] | None = None):
        super().__init__(kind, [])
        self.saved = saved
        self.pending = pending
        self.email_recovery = email_recovery
        self.reveal_error = reveal_error

    def handle_route(self, route) -> None:
        req = route.request
        path, method = urlparse(req.url).path, req.method
        if method != "OPTIONS" and path in {"/api/config", "/api/me/recovery", "/api/me/recovery/reveal",
                                             "/api/me/recovery/replace-prepare", "/api/me/recovery/replace",
                                             "/api/me/recovery/cancel", "/api/recovery-requests"}:
            self.calls.append((method, path, json.loads(req.post_data) if req.post_data else None))
        if path == "/api/config":
            return self.reply(route, 200, {"ok": True, "account_recovery": True})
        if path == "/api/me/recovery" and method == "GET":
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "available": True, "saved": self.saved,
                                           "pending": self.pending, "notice": STATUS_NOTICE,
                                           "email_recovery_available": self.email_recovery})
        if path == "/api/me/recovery/reveal" and method == "POST":
            if self.reveal_error:
                return self.reply(route, self.reveal_error[0], {"ok": False, "error": self.reveal_error[1]})
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "recovery_code": CODE})
        if path == "/api/me/recovery/replace-prepare" and method == "POST":
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "prepared": True})
        if path == "/api/me/recovery/replace" and method == "POST":
            return self.reply(route, 200, {"ok": True, "handle": self.handle,
                                           "recovery_code": NEW_CODE, "notice": REPLACE_NOTICE})
        if path == "/api/me/recovery/cancel" and method == "POST":
            self.pending = None
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "notice": CANCEL_NOTICE})
        if path == "/api/recovery-requests" and method == "POST":
            if not self.email_recovery:
                return self.reply(route, 503, {"ok": False,
                                               "error": "邮箱找回还没有接通，请先保留已登录的设备和恢复码。"})
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "request_id": "rr_fake",
                                           "ready_at": READY_AT,
                                           "notice": "邮件已交给发信服务。24小时内原账号可撤回，之后点击邮件链接换新码。"})
        return super().handle_route(route)


class RecoverBackend(FakeBackend):
    """找回页三条端点的契约假后端：check / complete / ack。"""

    def __init__(self, check: dict | tuple[int, str], complete: dict | tuple[int, str] | None = None):
        super().__init__("human", [])
        self.check = check
        self.complete = complete if complete is not None else {"recovery_code": CODE, "notice": COMPLETE_NOTICE}

    def _answer(self, route, spec) -> None:
        if isinstance(spec, tuple):
            return self.reply(route, spec[0], {"ok": False, "error": spec[1]})
        body = {"ok": True}
        body.update(spec)
        return self.reply(route, 200, body)

    def handle_route(self, route) -> None:
        path, method = urlparse(route.request.url).path, route.request.method
        if method != "OPTIONS" and path in {"/api/account-recovery/check", "/api/account-recovery/complete", "/api/account-recovery/ack"}:
            self.calls.append((method, path, json.loads(route.request.post_data) if route.request.post_data else None))
        if path == "/api/account-recovery/check" and method == "POST":
            return self._answer(route, self.check)
        if path == "/api/account-recovery/complete" and method == "POST":
            return self._answer(route, self.complete)
        if path == "/api/account-recovery/ack" and method == "POST":
            return self.reply(route, 200, {"ok": True, "notice": ACK_NOTICE})
        return super().handle_route(route)


class BrowserRig:
    """本机静态 server + Chromium；每个用例独立 context、390 宽、收 JS 异常。"""

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

    def open_account(self, fake: SecurityBackend, clipboard: bool = True,
                     deny_clipboard: bool = False, dialog_accept: list[bool] | None = None):
        ctx = self.browser.new_context(viewport=VP390)
        if deny_clipboard:
            ctx.add_init_script("navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));")
        elif clipboard:
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=self.site)
        page = ctx.new_page()
        errors: list[str] = []
        dialogs: list[str] = []
        accept = dialog_accept if dialog_accept is not None else [True]
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept() if accept[0] else d.dismiss()))
        page.route(MOCK + "/**", fake.handle_route)
        page.goto(f"{self.site}/account.html?api={MOCK}", wait_until="networkidle")
        page.locator("#panelMe").wait_for(state="visible")
        page.locator("#recoveryBox").wait_for(state="visible")
        return ctx, page, errors, dialogs

    def open_recover(self, fake: RecoverBackend, fragment: str | None = None,
                     deny_clipboard: bool = False):
        ctx = self.browser.new_context(viewport=VP390)
        if deny_clipboard:
            ctx.add_init_script("navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));")
        else:
            ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=self.site)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        page.route(MOCK + "/**", fake.handle_route)
        url = f"{self.site}/account-recover.html?api={MOCK}"
        if fragment:
            url += "#" + fragment
        page.goto(url, wait_until="networkidle")
        page.wait_for_function("document.getElementById('recoverNotice').textContent !== '正在核验链接。'")
        return ctx, page, errors


class AccountSecurityBrowser(BrowserRig, unittest.TestCase):
    """account.html 的「恢复码与登录」面板（account-security.js）。"""

    def test_mask_reveal_display_hide_and_no_persistence(self) -> None:
        fake = SecurityBackend()
        ctx, page, errors, _ = self.open_account(fake)
        try:
            # 默认遮罩，不预取：进页面只查状态，不碰 reveal
            self.assertEqual(page.locator("#recoveryValue").get_attribute("type"), "password")
            self.assertEqual(page.locator("#recoveryValue").input_value(), "")
            self.assertTrue(page.locator("#recoveryCopy").is_hidden())
            self.assertEqual(page.locator("#recoverySession").inner_text(), STATUS_NOTICE)
            self.assertFalse(any(c[1] == "/api/me/recovery/reveal" for c in fake.calls),
                             "没点查看就发了 reveal")
            self.assertIn(("GET", "/api/me/recovery", None), fake.calls)

            # 点击才 POST reveal，空 body；码显示出来
            page.locator("#recoveryEye").click()
            page.wait_for_function("document.getElementById('recoveryValue').value === %s" % json.dumps(CODE))
            reveal = [c for c in fake.calls if c[1] == "/api/me/recovery/reveal"]
            self.assertEqual(reveal, [("POST", "/api/me/recovery/reveal", {"expected_handle": fake.handle})])
            self.assertEqual(page.locator("#recoveryValue").get_attribute("type"), "text")
            self.assertEqual(page.locator("#recoveryEye").inner_text(), "收起")
            self.assertEqual(page.locator("#recoveryEye").get_attribute("aria-expanded"), "true")
            self.assertTrue(page.locator("#recoveryCopy").is_visible())
            self.assertIn("60秒", page.locator("#recoveryNote").inner_text())

            # 复制成功有明示
            page.locator("#recoveryCopy").click()
            page.wait_for_function("document.getElementById('recoveryNote').textContent.includes('复制成功')")
            self.assertEqual(page.evaluate("navigator.clipboard.readText()"), CODE)

            # 收起：DOM 清空、遮罩还原，页面任何角落不留码
            page.locator("#recoveryEye").click()
            page.wait_for_function("document.getElementById('recoveryValue').value === ''")
            self.assertEqual(page.locator("#recoveryValue").get_attribute("type"), "password")
            self.assertEqual(page.locator("#recoveryEye").inner_text(), "查看")
            self.assertTrue(page.locator("#recoveryCopy").is_hidden())
            self.assertNotIn(CODE, page.content())

            # 本机持久存储零残留（rj_signed_in 的 0/1 提示位不算凭据）
            no_storage(page, CODE)

            # 390 宽零横向溢出、零 JS 异常
            self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), 390)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_copy_failure_selects_code_for_manual_save(self) -> None:
        fake = SecurityBackend()
        ctx, page, errors, _ = self.open_account(fake, deny_clipboard=True)
        try:
            page.locator("#recoveryEye").click()
            page.wait_for_function("document.getElementById('recoveryValue').value === %s" % json.dumps(CODE))
            page.locator("#recoveryCopy").click()
            page.wait_for_function("document.getElementById('recoveryNote').textContent.includes('没有复制上')")
            # 码不收起、已全选，可以手动抄
            self.assertEqual(page.locator("#recoveryValue").input_value(), CODE)
            self.assertTrue(page.locator("#recoveryCopy").is_visible())
            sel = page.evaluate(
                "() => { const i = document.getElementById('recoveryValue');"
                " return [i.selectionStart, i.selectionEnd, i.value.length]; }")
            self.assertEqual(sel, [0, len(CODE), len(CODE)])
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_legacy_409_and_temp_503_show_their_own_words(self) -> None:
        for saved, failure in ((False, (409, LEGACY_409)), (True, (503, TEMP_503))):
            with self.subTest(status=failure[0]):
                fake = SecurityBackend(saved=saved, reveal_error=failure)
                ctx, page, errors, _ = self.open_account(fake)
                try:
                    if not saved:
                        self.assertTrue(page.locator("#recoveryLegacy").is_visible())
                    page.locator("#recoveryEye").click()
                    page.wait_for_function(
                        "document.getElementById('recoveryNote').textContent === %s" % json.dumps(failure[1]))
                    # 不显示码、按钮恢复可点、页面仍然是已登录形态（不误报退出）
                    self.assertEqual(page.locator("#recoveryValue").input_value(), "")
                    self.assertEqual(page.locator("#recoveryValue").get_attribute("type"), "password")
                    self.assertFalse(page.locator("#recoveryEye").is_disabled())
                    self.assertTrue(page.locator("#panelMe").is_visible())
                    self.assertTrue(page.locator("#panelGuest").is_hidden())
                    self.assertNotIn(CODE, page.content())
                    self.assertEqual(real_errors(errors), [])
                finally:
                    ctx.close()

    def test_replace_needs_confirm_and_posts_confirm_true(self) -> None:
        fake = SecurityBackend()
        accept = [False]   # 第一次点换码：拒绝确认
        ctx, page, errors, dialogs = self.open_account(fake, dialog_accept=accept)
        try:
            page.locator("#recoveryReplace").click()
            page.wait_for_timeout(150)
            self.assertEqual(len(dialogs), 1)
            self.assertIn("换一串新的恢复码", dialogs[0])
            self.assertFalse(any(c[1] == "/api/me/recovery/replace" for c in fake.calls),
                             "没确认就发了换码请求")

            accept[0] = True
            page.locator("#recoveryReplace").click()
            page.wait_for_function("document.getElementById('recoveryValue').value === %s" % json.dumps(NEW_CODE))
            replace = [c for c in fake.calls if c[1] == "/api/me/recovery/replace"]
            self.assertEqual(replace, [("POST", "/api/me/recovery/replace", {"confirm": True, "expected_handle": fake.handle})])
            prepare = [c for c in fake.calls if c[1] == "/api/me/recovery/replace-prepare"]
            self.assertEqual(prepare, [("POST", "/api/me/recovery/replace-prepare", {"expected_handle": fake.handle})])
            self.assertEqual(page.locator("#recoveryNote").inner_text(), REPLACE_NOTICE)
            self.assertTrue(page.locator("#panelMe").is_visible(), "换码后当前设备不应被画成退出")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_late_reveal_response_cannot_paint_into_other_account(self) -> None:
        fake = SecurityBackend()
        ctx, page, errors, _ = self.open_account(fake)
        held = []
        page.route(MOCK + "/api/me/recovery/reveal", lambda route: held.append(route))
        try:
            page.locator("#recoveryEye").click()
            for _ in range(40):
                if held:
                    break
                page.wait_for_timeout(25)
            self.assertTrue(held, "reveal 请求没有进入延迟窗口")
            # 等待期间账号模块已把页面 paint 成另一个号（公开边界，不调内部函数）
            page.evaluate("window.RJ_ACCOUNT_SECURITY.paint("
                          "{handle: 'fake-human-b', kind: 'human'}, {account_recovery: true})")
            held[0].fulfill(status=200, body=json.dumps({"ok": True, "recovery_code": CODE}),
                            headers=fake.cors(held[0]))
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoveryValue").input_value(), "")
            self.assertNotIn(CODE, page.content())
            self.assertNotIn(CODE, page.locator("#recoveryNote").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_late_replace_response_cannot_paint_into_other_account(self) -> None:
        fake = SecurityBackend()
        ctx, page, errors, _ = self.open_account(fake)
        held = []
        page.route(MOCK + "/api/me/recovery/replace", lambda route: held.append(route))
        try:
            page.locator("#recoveryReplace").click()
            for _ in range(40):
                if held:
                    break
                page.wait_for_timeout(25)
            self.assertTrue(held, "replace 请求没有进入延迟窗口")
            page.evaluate("window.RJ_ACCOUNT_SECURITY.paint("
                          "{handle: 'fake-human-b', kind: 'human'}, {account_recovery: true})")
            held[0].fulfill(status=200,
                            body=json.dumps({"ok": True, "recovery_code": NEW_CODE, "notice": REPLACE_NOTICE}),
                            headers=fake.cors(held[0]))
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#recoveryValue").input_value(), "")
            self.assertNotIn(NEW_CODE, page.content())
            self.assertNotIn(REPLACE_NOTICE, page.locator("#recoveryNote").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_email_channel_false_disables_and_explains(self) -> None:
        # 机机号看得到「替绑定机友找回」入口，但邮箱服务没开通：禁用 + 明说
        fake = SecurityBackend(kind="machine", email_recovery=False)
        ctx, page, errors, _ = self.open_account(fake)
        try:
            self.assertTrue(page.locator("#recoveryDelegate").is_visible())
            self.assertTrue(page.locator("#recoverySend").is_disabled())
            self.assertEqual(page.locator("#recoveryEmailStatus").inner_text(),
                             "邮箱发送服务尚未开通，此入口暂时不能发起找回。")
            self.assertFalse(any(c[1] == "/api/recovery-requests" for c in fake.calls))
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 人类号不露代找回入口
        fake2 = SecurityBackend(kind="human", email_recovery=False)
        ctx2, page2, errors2, _ = self.open_account(fake2)
        try:
            self.assertTrue(page2.locator("#recoveryDelegate").is_hidden())
            self.assertEqual(errors2, [])
        finally:
            ctx2.close()

    def test_pending_notice_and_cancel(self) -> None:
        for state, words in (("pending", "不是你请求的，就在这里撤回"),
                             ("mail_failed", "有一笔邮件发送失败的找回申请。可以撤回后重新发起。")):
            with self.subTest(state=state):
                fake = SecurityBackend(pending={"state": state})
                ctx, page, errors, _ = self.open_account(fake)
                try:
                    self.assertIn(words, page.locator("#recoveryPending").inner_text())
                    self.assertTrue(page.locator("#recoveryCancel").is_visible())
                    page.locator("#recoveryCancel").click()
                    page.wait_for_function(
                        "document.getElementById('recoveryNote').textContent === %s" % json.dumps(CANCEL_NOTICE))
                    self.assertIn(("POST", "/api/me/recovery/cancel", {"expected_handle": fake.handle}), fake.calls)
                    page.wait_for_function("document.getElementById('recoveryPending').hidden === true")
                    self.assertTrue(page.locator("#recoveryCancel").is_hidden())
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    def test_me_outage_shows_retry_state_not_guest(self) -> None:
        fake = SecurityBackend()
        ctx = self.browser.new_context(viewport=VP390)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route(MOCK + "/**", fake.handle_route)
        page.route(MOCK + "/api/me", lambda route: route.abort())   # 后注册，盖过通用路由
        try:
            page.goto(f"{self.site}/account.html?api={MOCK}", wait_until="networkidle")
            page.locator("#panelOffline").wait_for(state="visible")
            self.assertIn("不会主动退出", page.locator("#offlineSessionNote").inner_text())
            self.assertTrue(page.locator("#offlineRetry").is_visible())
            self.assertTrue(page.locator("#panelGuest").is_hidden(), "断线把账号页画成了未登录")
            self.assertTrue(page.locator("#panelMe").is_hidden())
            # 恢复后点重试，同一会话照常画出来
            page.unroute(MOCK + "/api/me")
            page.locator("#offlineRetry").click()
            page.locator("#panelMe").wait_for(state="visible")
            page.locator("#recoveryBox").wait_for(state="visible")
            self.assertEqual(real_errors(errors), [])
        finally:
            ctx.close()


class AccountRecoverBrowser(BrowserRig, unittest.TestCase):
    """account-recover.html 邮件链接页（account-recover.js）。"""

    def test_fragment_cleared_and_cooldown_hides_generate(self) -> None:
        fake = RecoverBackend(check={"ready": False, "ready_at": READY_AT})
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN)
        try:
            # fragment 读完立刻从 URL 抹掉
            self.assertEqual(page.evaluate("location.hash"), "")
            self.assertNotIn("token=", page.evaluate("location.href"))
            # check 把 token 原样交了上去
            self.assertIn(("POST", "/api/account-recovery/check", {"token": TOKEN}), fake.calls)
            # 冷静期：不露生成钮，提示里照摆后端的 ready_at
            self.assertTrue(page.locator("#recoverComplete").is_hidden())
            notice = page.locator("#recoverNotice").inner_text()
            self.assertIn("可撤回期", notice)
            self.assertIn(READY_AT, notice)
            self.assertFalse(any(c[1] == "/api/account-recovery/complete" for c in fake.calls))
            self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), 390)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_ready_complete_shows_new_code(self) -> None:
        fake = RecoverBackend(check={"ready": True})
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN)
        try:
            go = page.locator("#recoverComplete")
            self.assertTrue(go.is_visible())
            self.assertEqual(go.inner_text(), "生成新的恢复码")
            go.click()
            page.locator("#recoverResult").wait_for(state="visible")
            self.assertEqual(page.locator("#recoverCode").input_value(), CODE)
            self.assertEqual(page.locator("#recoverNotice").inner_text(), COMPLETE_NOTICE)
            self.assertTrue(go.is_hidden())
            self.assertIn(("POST", "/api/account-recovery/complete", {"token": TOKEN}), fake.calls)
            no_storage(page, CODE, TOKEN)
            self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), 390)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_completed_link_rereads_same_code(self) -> None:
        # 新契约：complete 过一次的链接在 ack 前、有效期内重读同一串码，不是必定 400
        fake = RecoverBackend(check={"ready": True, "completed": True},
                              complete={"recovery_code": CODE, "notice": REREAD_NOTICE})
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN)
        try:
            go = page.locator("#recoverComplete")
            self.assertEqual(go.inner_text(), "读取这次的新恢复码")
            self.assertIn("已重设过", page.locator("#recoverNotice").inner_text())
            go.click()
            page.locator("#recoverResult").wait_for(state="visible")
            self.assertEqual(page.locator("#recoverCode").input_value(), CODE)
            self.assertEqual(page.locator("#recoverNotice").inner_text(), REREAD_NOTICE)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_invalid_link_shows_error_and_no_code(self) -> None:
        fake = RecoverBackend(check=(400, LINK_DEAD))
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN)
        try:
            self.assertEqual(page.locator("#recoverNotice").inner_text(), LINK_DEAD)
            self.assertTrue(page.locator("#recoverComplete").is_hidden())
            self.assertTrue(page.locator("#recoverResult").is_hidden())
            self.assertEqual(page.locator("#recoverCode").input_value(), "")
            self.assertFalse(any(c[1] == "/api/account-recovery/complete" for c in fake.calls))
            self.assertEqual(real_errors(errors), [])
        finally:
            ctx.close()

    def test_complete_failure_keeps_code_hidden(self) -> None:
        fake = RecoverBackend(check={"ready": True}, complete=(400, LINK_DEAD))
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN)
        try:
            page.locator("#recoverComplete").click()
            page.wait_for_function(
                "document.getElementById('recoverNotice').textContent === %s" % json.dumps(LINK_DEAD))
            self.assertTrue(page.locator("#recoverResult").is_hidden())
            self.assertEqual(page.locator("#recoverCode").input_value(), "")
            self.assertFalse(page.locator("#recoverComplete").is_disabled(), "失败后按钮应恢复可点")
            self.assertNotIn(CODE, page.content())
            self.assertEqual(real_errors(errors), [])
        finally:
            ctx.close()

    def test_copy_failure_offers_manual_save(self) -> None:
        fake = RecoverBackend(check={"ready": True})
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN, deny_clipboard=True)
        try:
            page.locator("#recoverComplete").click()
            page.locator("#recoverResult").wait_for(state="visible")
            page.locator("#recoverCopy").click()
            page.wait_for_function(
                "document.getElementById('recoverNotice').textContent.includes('没有复制上')")
            # 码还在、已全选，结果不收起
            self.assertEqual(page.locator("#recoverCode").input_value(), CODE)
            self.assertTrue(page.locator("#recoverResult").is_visible())
            sel = page.evaluate(
                "() => { const i = document.getElementById('recoverCode');"
                " return [i.selectionStart, i.selectionEnd, i.value.length]; }")
            self.assertEqual(sel, [0, len(CODE), len(CODE)])
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_ack_closes_delivery(self) -> None:
        fake = RecoverBackend(check={"ready": True})
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN)
        try:
            page.locator("#recoverComplete").click()
            page.locator("#recoverResult").wait_for(state="visible")
            page.locator("#recoverAck").click()
            page.wait_for_function(
                "document.getElementById('recoverNotice').textContent === %s" % json.dumps(ACK_NOTICE))
            self.assertIn(("POST", "/api/account-recovery/ack", {"token": TOKEN}), fake.calls)
            self.assertTrue(page.locator("#recoverResult").is_hidden())
            self.assertEqual(page.locator("#recoverCode").input_value(), "")
            self.assertNotIn(CODE, page.content())
            no_storage(page, CODE, TOKEN)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_pagehide_clears_code(self) -> None:
        fake = RecoverBackend(check={"ready": True})
        ctx, page, errors = self.open_recover(fake, fragment="token=" + TOKEN)
        try:
            page.locator("#recoverComplete").click()
            page.locator("#recoverResult").wait_for(state="visible")
            self.assertEqual(page.locator("#recoverCode").input_value(), CODE)
            page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
            self.assertEqual(page.locator("#recoverCode").input_value(), "")
            self.assertNotIn(CODE, page.content())
            self.assertEqual(errors, [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
