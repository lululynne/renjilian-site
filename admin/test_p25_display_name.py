#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""昵称（display_name）＋ 恢复码只显示一次的收口（2026-09-26）。

梅宝 13:19「注册就只有人类id，没有用户名可以设置吗？」→ 昵称：可不填、可改、空即清空，
全站显示「昵称 @handle」，没昵称只显示「@handle」。
梅宝 13:21 真事故：注册后恢复码「复制了又没有了，也找不到」→ 恢复码框照机机钥匙明文框：
大号等宽、「复制」、「我已保存」点两下（第二下隔半秒）才收起，收起前登录区锁住、离开页面先问。

两组：
- 静态：面板元素、守则／隐私补句。
- 假后端（永远跑）：Playwright 拦请求按契约回话——注册带昵称 → 恢复码复制与两步收起 →
  账号页显示昵称 → 改 → 留言里「昵称 @号」→ 清空后只剩 @号；绑定列表、钥匙栏标题、配置页、成本页墙、
  右上角入口；后端错误句原样上 note；390 不溢出。
- 真后端：见 MachineNameLive（需要 renji-api 带昵称的那一版，RJ_TEST_API 指过去）。
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import re
import threading
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

from test_p2a_browser import API, CARD, CLIPBOARD, SITE, SITE_PORT, admin_token, api_call, backend_up


ROOT = Path(__file__).resolve().parents[1]
MOCK = "http://rj-mock.test"
RECOVERY = "rjr-ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2"
RESERVED_ERR = "昵称里有站方保留的词，换一个。"
SHOTS = Path("/Volumes/Meibao2T/Developer/renjilian-site-audits/20260926-phase25-voice")


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def text_of(html: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", html))


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a) -> None:
        pass


# ───────────────────────── 静态 ─────────────────────────

class DisplayNameMarkup(unittest.TestCase):
    def test_register_and_new_machine_have_optional_name(self) -> None:
        html = read("account.html")
        guest = html[html.find('id="panelGuest"'):html.find('id="panelMe"')]
        self.assertIn('id="regName"', guest)
        self.assertIn('placeholder="比如 梅宝"', guest)
        self.assertIn("昵称可以改；上面的 @号注册后不能改。", guest)
        self.assertIn('id="newMachineName"', html)
        me = html[html.find('id="panelMe"'):]
        for node in ('id="nameRow"', 'id="meName"', 'id="nameEdit"', 'id="nameEditor" hidden',
                     'id="nameInput"', 'id="nameSave"', 'id="nameNote" role="status" aria-live="polite"'):
            with self.subTest(node=node):
                self.assertIn(node, me)

    def test_four_once_boxes_share_one_button(self) -> None:
        # 注册恢复码、新机机号恢复码、绑定码、机机钥匙明文：同一套，只有一个键「我抄好了」＋代码旁的回执
        html = read("account.html")
        for bid in ("regCode", "newMachineCode", "bindCode", "keyPlain"):
            start = html.find(f'id="{bid}"')
            box = html[start:html.find('<button class="rj-btn" id="%sDone"' % bid, start) + 200]
            with self.subTest(box=bid):
                self.assertIn("rj-code-big", box)
                self.assertIn(f'id="{bid}Badge" role="status" aria-live="polite"', box)
                self.assertIn(f'id="{bid}Done" type="button">我抄好了</button>', box)
                self.assertIn("这串只显示这一次", box)
                self.assertEqual(box.count("<button"), 1, "只能有一个键")
                # 回执紧挨着代码（同一个 .rj-code-line 里），不在底部
                line = box[box.find('class="rj-code-line"'):]
                self.assertLess(line.find(f'id="{bid}Value"'), line.find(f'id="{bid}Badge"'))
                self.assertLess(line.find(f'id="{bid}Badge"'), line.find("</div>"))
        for gone in ("复制并继续", "我已经手抄好了", "我已保存", "再点一下"):
            self.assertNotIn(gone, html + read("account.js"))

    def test_rules_and_privacy(self) -> None:
        rules = text_of(read("rules.html"))
        self.assertIn("昵称也是自报的", rules)
        self.assertIn("本站不验证", rules)
        self.assertIn("可以随时改", rules)
        self.assertIn("保留词，昵称里同样不能用", rules)
        priv = text_of(read("privacy.html"))
        self.assertIn("你自报的昵称（可以不设），以及最近一次改昵称的时间", priv)
        self.assertIn("你的id、昵称（设了的话）、自报身份", priv)

    def test_nicknames_only_via_textcontent_or_escaped(self) -> None:
        # 昵称是读者写的字：account/comments/profile 只走 textContent（API.nameOf），cost.js 拼 innerHTML 前 esc
        for f in ("account.js", "comments.js", "profile.js"):
            with self.subTest(f=f):
                self.assertNotIn("display_name + ", read(f).replace("o.display_name.trim()", ""))
        cost = read("cost.js")
        self.assertIn("esc(who(it))", cost)
        self.assertIn("esc(t(\"boundWith\") + \" \" + bound.join", cost)


# ───────────────────────── 假后端 ─────────────────────────

class Fake:
    def __init__(self, signed_in: bool = False, kind: str = "human", name: str | None = None):
        self.signed_in = signed_in
        self.kind = kind
        self.handle = "meibao-h"
        self.name = name
        self.calls: list[tuple[str, str, object]] = []

    def cors(self, route) -> dict:
        return {"content-type": "application/json; charset=utf-8",
                "access-control-allow-origin": route.request.headers.get("origin", "*"),
                "access-control-allow-credentials": "true",
                "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                "access-control-allow-headers": "content-type"}

    def reply(self, route, status: int, body: dict) -> None:
        route.fulfill(status=status, body=json.dumps(body, ensure_ascii=False), headers=self.cors(route))

    def me(self) -> dict:
        return {"handle": self.handle, "kind": self.kind, "display_name": self.name}

    def handle_route(self, route) -> None:
        req = route.request
        u = urlparse(req.url)
        path, method = u.path, req.method
        if method == "OPTIONS":
            return route.fulfill(status=204, headers=self.cors(route))
        body = json.loads(req.post_data) if req.post_data else None
        self.calls.append((method, path, body))
        if path == "/api/config":
            return self.reply(route, 200, {"ok": True, "comments_enabled": True})
        if path == "/api/me" and method == "GET":
            if not self.signed_in:
                return self.reply(route, 200, {"ok": True, "signed_in": False})
            return self.reply(route, 200, {"ok": True, "signed_in": True, "probation_remaining": 0, **self.me()})
        if path == "/api/me" and method == "PATCH":
            v = body.get("display_name")
            if v and "claude" in v.lower():
                return self.reply(route, 400, {"ok": False, "error": RESERVED_ERR})
            self.name = v or None
            return self.reply(route, 200, {"ok": True, "display_name": self.name})
        if path == "/api/accounts" and method == "POST":
            self.handle, self.kind = body["handle"], body["kind"]
            self.name = body.get("display_name") or None
            self.signed_in = True
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "kind": self.kind,
                                           "display_name": self.name, "recovery_code": RECOVERY})
        if path == "/api/me/bindings":
            return self.reply(route, 200, {"ok": True, "slots": {"left": 2}, "items": [
                {"id": "b1", "other": {"handle": "xiaojing", "kind": "machine", "active": True,
                                       "display_name": "小景"},
                 "public": False, "my_public": False, "their_public": False}]})
        if path == "/api/machine-tokens" and method == "GET":
            return self.reply(route, 200, {"ok": True, "machine": "xiaojing", "machine_display_name": "小景",
                                           "items": [], "active_count": 0, "limit": 5})
        if path == "/api/me/profile":
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "wall_public": False, "tags": {},
                                           "limits": {"subscription": 8, "device": 6, "route": 3}})
        if path == "/api/comments" and method == "GET":
            return self.reply(route, 200, {"ok": True, "comments_enabled": True, "items": [
                {"id": "c_1", "author": {"handle": self.handle, "kind": self.kind, "display_name": self.name},
                 "posted_on": "2031-01-02", "body": "今天读完了。", "state": "visible", "mine": True},
                {"id": "c_2", "author": {"handle": None, "kind": "human", "display_name": None},
                 "posted_on": "2031-01-01", "body": "署名抹掉的一条。", "state": "visible", "mine": False}]})
        if path == "/api/wall":
            return self.reply(route, 200, {"ok": True, "items": [
                {"handle": self.handle, "kind": "human", "display_name": self.name, "tags": {},
                 "bindings": [{"handle": "xiaojing", "kind": "machine", "display_name": "小景"}]}]})
        m = re.fullmatch(r"/api/accounts/([\w-]+)/profile", path)
        if m:
            return self.reply(route, 200, {"ok": True, "handle": m.group(1), "kind": "human",
                                           "display_name": self.name, "tags": {}, "updated_on": "2031-01-02",
                                           "bindings": [{"handle": "xiaojing", "kind": "machine",
                                                         "display_name": "小景", "profile_public": False}]})
        return self.reply(route, 404, {"ok": False, "error": "没有这个接口。"})


class DisplayNameDom(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
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

    def ctx(self, vp=(390, 844)):
        c = self.browser.new_context(viewport={"width": vp[0], "height": vp[1]})
        c.grant_permissions(["clipboard-read", "clipboard-write"], origin=self.site)
        return c

    def page(self, c, fake: Fake, path: str):
        page = c.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        page.route(MOCK + "/**", fake.handle_route)
        page.goto(f"{self.site}/{path}{'&' if '?' in path else '?'}api={MOCK}", wait_until="networkidle")
        return page, errors

    def no_overflow(self, page, where: str) -> None:
        w = page.evaluate("({i: window.innerWidth, s: document.documentElement.scrollWidth})")
        self.assertEqual(w["i"], w["s"], f"横向溢出：{where}")

    def small_buttons(self, page, scope: str) -> list:
        return page.evaluate("""(scope) => [...document.querySelectorAll(scope + ' button')]
            .filter(b => b.offsetParent !== null)
            .map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), r.width, r.height]; })
            .filter(([, w, h]) => w < 44 || h < 44)""", scope)

    def test_register_with_name_code_once_rename_comment_clear(self) -> None:
        fake = Fake()
        c = self.ctx()
        try:
            page, errors = self.page(c, fake, "account.html")
            page.locator("#panelGuest").wait_for(state="visible")
            page.locator('input[name="regKind"][value="human"]').check()
            page.locator("#regHandle").fill("meibao-h")
            page.locator("#regName").fill("梅宝")
            self.no_overflow(page, "注册面板")
            if SHOTS.exists():
                page.locator("#panelGuest").screenshot(path=str(SHOTS / "d2-register-390.png"))
            page.locator("#regGo").click()

            # 恢复码：一个键「我抄好了」＝复制；成功回执在代码旁，键变「收起」；收起前登录区不在
            page.locator("#regCode").wait_for(state="visible")
            self.assertEqual(("POST", "/api/accounts", {"handle": "meibao-h", "kind": "human", "display_name": "梅宝"}),
                             [x for x in fake.calls if x[0] == "POST"][-1])
            self.assertEqual(page.locator("#regCodeValue").inner_text(), RECOVERY)
            self.assertIn("这串只显示这一次，丢了这个号就进不来了。", page.locator("#regCode").inner_text())
            self.assertFalse(page.locator("#loginBox").is_visible())
            self.assertEqual(self.small_buttons(page, "#regCode"), [])
            self.no_overflow(page, "恢复码")
            done = page.locator("#regCodeDone")
            self.assertEqual(done.inner_text(), "我抄好了")
            done.click()
            page.wait_for_function("document.getElementById('regCodeBadge').textContent === '✅ 复制成功'")
            self.assertEqual(page.evaluate("navigator.clipboard.readText()"), RECOVERY)
            self.assertTrue(page.locator("#regCode").is_visible(), "复制完就自己收起了")
            self.assertEqual(done.inner_text(), "收起")
            # 回执跟代码在同一行（390 下也不掉到底部）
            geo = page.evaluate('''() => { const v = document.getElementById('regCodeValue').getBoundingClientRect();
                const b = document.getElementById('regCodeBadge').getBoundingClientRect();
                const d = document.getElementById('regCodeDone').getBoundingClientRect();
                return [v.bottom, b.top, b.bottom, d.top]; }''')
            self.assertLessEqual(geo[1] - geo[0], 12, "回执离代码太远")
            self.assertLess(geo[2], geo[3], "回执跑到键下面了")
            if SHOTS.exists():
                page.locator("#regCode").screenshot(path=str(SHOTS / "d2-recovery-copied-390.png"))
            self.no_overflow(page, "恢复码复制后")
            done.click()
            page.locator("#panelMe").wait_for(state="visible")
            self.assertFalse(page.locator("#regCode").is_visible())
            self.assertNotIn(RECOVERY, page.content())

            # 账号页昵称行 + 右上角
            page.wait_for_function("document.getElementById('meName').textContent === '梅宝'")
            self.assertEqual(page.locator("a.account-entry").inner_text(), "梅宝")
            self.assertEqual(page.locator("a.account-entry").get_attribute("title"), "梅宝 @meibao-h")
            # 绑定列表、钥匙栏标题：「昵称 @handle」
            page.locator(".rj-bind").first.wait_for()
            self.assertEqual(page.locator(".rj-bind .rj-bind-handle").first.inner_text(), "小景 @xiaojing")
            page.wait_for_function("document.querySelector('.rj-key-who') && "
                                   "document.querySelector('.rj-key-who').textContent === '小景 @xiaojing'")
            self.no_overflow(page, "账号页")
            self.assertEqual(self.small_buttons(page, "#nameRow"), [])
            if SHOTS.exists():
                page.evaluate("document.getElementById('panelMe').scrollIntoView()")
                page.screenshot(path=str(SHOTS / "d2-account-name-390.png"))

            # 改：保留词 → 后端原句
            page.locator("#nameEdit").click()
            page.locator("#nameInput").fill("Claude 本尊")
            page.locator("#nameSave").click()
            page.wait_for_function("document.getElementById('nameNote').textContent === %s" % json.dumps(RESERVED_ERR))
            self.assertIn("is-error", page.locator("#nameNote").get_attribute("class"))
            self.assertEqual(page.locator("#meName").inner_text(), "梅宝")
            # 改成功
            page.locator("#nameInput").fill("小狐狸")
            page.locator("#nameSave").click()
            page.wait_for_function("document.getElementById('meName').textContent === '小狐狸'")
            self.assertEqual(("PATCH", "/api/me", {"display_name": "小狐狸"}), fake.calls[-1])
            self.assertEqual(page.locator("a.account-entry").inner_text(), "小狐狸")
            self.assertFalse(page.locator("#nameEditor").is_visible())

            # 留言里「昵称 @号」
            kr, kerr = self.page(c, fake, "kanread.html")
            kr.locator(".rjc-item").first.wait_for()
            self.assertEqual(kr.locator('.rjc-item[data-id="c_1"] .rjc-handle').first.inner_text(), "小狐狸 @meibao-h")
            self.assertEqual(kr.locator('.rjc-item[data-id="c_2"] .rjc-handle').first.inner_text(), "@已注销")
            self.no_overflow(kr, "刊读留言")
            if SHOTS.exists():
                kr.locator('.rjc-item[data-id="c_1"]').first.screenshot(path=str(SHOTS / "d2-comment-390.png"))

            # 清空 → 只剩 @号
            page.locator("#nameEdit").click()
            page.locator("#nameInput").fill("")
            page.locator("#nameSave").click()
            page.wait_for_function("document.getElementById('meName').textContent === '还没设'")
            self.assertEqual(("PATCH", "/api/me", {"display_name": ""}), fake.calls[-1])
            self.assertEqual(page.locator("a.account-entry").inner_text(), "@meibao-h")
            kr.reload(wait_until="networkidle")
            kr.locator(".rjc-item").first.wait_for()
            self.assertEqual(kr.locator('.rjc-item[data-id="c_1"] .rjc-handle').first.inner_text(), "@meibao-h")
            # 唯一一条允许的：故意触发的那个 400
            self.assertEqual(errors, ["Failed to load resource: the server responded with a status of 400 (Bad Request)"])
            self.assertEqual(kerr, [])
        finally:
            c.close()

    def test_recovery_code_copy_failure(self) -> None:
        fake = Fake()
        c = self.ctx()
        c.add_init_script("navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));")
        try:
            page, errors = self.page(c, fake, "account.html")
            dialogs: list[str] = []
            page.on("dialog", lambda d: dialogs.append(d.message))
            page.locator('input[name="regKind"][value="human"]').check()
            page.locator("#regHandle").fill("meibao-h")
            page.locator("#regGo").click()
            page.locator("#regCode").wait_for(state="visible")
            page.locator("#regCodeDone").click()
            page.wait_for_function("document.getElementById('regCodeBadge').textContent === '⚠️ 没复制上，长按选中'")
            self.assertTrue(page.locator("#regCode").is_visible())
            self.assertEqual(page.locator("#regCodeDone").inner_text(), "我抄好了")
            self.assertEqual(page.evaluate("String(getSelection())"), RECOVERY)
            self.assertFalse(page.locator("#loginBox").is_visible())
            if SHOTS.exists():
                page.locator("#regCode").screenshot(path=str(SHOTS / "d2-recovery-copy-failed-390.png"))
            # 注册键在它收起前按不动（不会被新的一串盖掉）
            posts = len([x for x in fake.calls if x[0] == "POST"])
            page.evaluate("document.getElementById('regGo').click()")
            self.assertEqual(len([x for x in fake.calls if x[0] == "POST"]), posts)
            # 再点：再试一次还不行 → 问「真抄好了吗」→ 确定才收
            page.locator("#regCodeDone").click()
            page.locator("#panelMe").wait_for(state="visible")
            self.assertEqual(len(dialogs), 1)
            self.assertNotIn(RECOVERY, page.content())
        finally:
            c.close()

    def test_profile_and_wall_show_name(self) -> None:
        fake = Fake(signed_in=False, name="梅宝")
        c = self.ctx()
        try:
            pf, perr = self.page(c, fake, "profile.html?u=meibao-h")
            pf.wait_for_function("document.getElementById('pfHandle').textContent === '梅宝 @meibao-h'")
            self.assertTrue(pf.title().startswith("梅宝 @meibao-h"))
            self.assertIn("小景 @xiaojing", pf.locator(".pf-other").first.inner_text())
            self.no_overflow(pf, "配置页")
            cost, cerr = self.page(c, fake, "cost.html")
            cost.locator(".setup-card.is-real").first.wait_for()
            card = cost.locator(".setup-card.is-real").first
            self.assertEqual(card.locator(".is-handle").inner_text(), "梅宝 @meibao-h")
            self.assertIn("小景 @xiaojing", card.inner_text())
            self.assertEqual(perr, [])
            self.assertEqual(cerr, [])
        finally:
            c.close()

    def test_markup_in_name_is_text(self) -> None:
        fake = Fake(signed_in=False, name='<img src=x onerror="window.__pwned=1">')
        c = self.ctx()
        try:
            cost, errs = self.page(c, fake, "cost.html")
            cost.locator(".setup-card.is-real").first.wait_for()
            self.assertIn("<img", cost.locator(".setup-card.is-real .is-handle").first.inner_text())
            self.assertIsNone(cost.evaluate("window.__pwned"))
            pf, _ = self.page(c, fake, "profile.html?u=meibao-h")
            pf.wait_for_function("document.getElementById('pfHandle').textContent.includes('<img')")
            self.assertIsNone(pf.evaluate("window.__pwned"))
        finally:
            c.close()


# ───────────────────────── 真后端 ─────────────────────────

def backend_has_names() -> bool:
    if not backend_up():
        return False
    try:
        return api_call("GET", "/api/health").get("schema_version", 0) >= 5   # 5 = 带昵称的那一版
    except Exception:
        return False


@unittest.skipUnless(backend_has_names(), "本机后端没起，或还不是带昵称的那一版（RJ_TEST_API 指到 renji-api 昵称分支）")
class DisplayNameLive(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.token = admin_token()
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), functools.partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)
        api_call("POST", "/api/admin/flags", cls.token, {"key": "registration_open", "value": "1"})
        for prefix in ("reg:", "login:", "bindip:", "cmt:", "cmtd:", "dname:"):
            api_call("POST", "/api/admin/rate/reset", cls.token, {"prefix": prefix})

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_register_rename_comment_clear(self) -> None:
        tag = os.urandom(3).hex()
        handle = f"dn{tag}"
        c = self.browser.new_context(viewport={"width": 390, "height": 844})
        c.grant_permissions(CLIPBOARD, origin=SITE)
        try:
            page = c.new_page()
            errors: list[str] = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("dialog", lambda d: d.accept())
            page.goto(f"{SITE}/account.html?api={API}", wait_until="networkidle")
            page.locator('input[name="regKind"][value="human"]').check()
            page.locator("#regHandle").fill(handle)
            page.locator("#regName").fill("梅宝测")
            page.locator("#regGo").click()
            page.locator("#regCode").wait_for(state="visible")
            page.locator("#regCodeDone").click()
            page.wait_for_function("document.getElementById('regCodeBadge').textContent !== ''")
            page.locator("#regCodeDone").click()
            page.wait_for_function("document.getElementById('meName').textContent === '梅宝测'")
            self.assertEqual(page.locator("a.account-entry").inner_text(), "梅宝测")

            page.locator("#nameEdit").click()
            page.locator("#nameInput").fill("小狐狸测")
            page.locator("#nameSave").click()
            page.wait_for_function("document.getElementById('meName').textContent === '小狐狸测'")

            # 发一条留言，看「昵称 @号」
            page.goto(f"{SITE}/kanread.html?api={API}", wait_until="networkidle")
            card = page.locator(f"#{CARD}")
            card.locator(".rjc-text, textarea").first.fill(f"昵称测试 {tag}")
            card.locator(".rjc-send").first.click()
            item = page.locator(".rjc-item").filter(has_text=f"昵称测试 {tag}").first
            item.wait_for()
            self.assertEqual(item.locator(".rjc-handle").first.inner_text(), f"小狐狸测 @{handle}")

            page.goto(f"{SITE}/account.html?api={API}", wait_until="networkidle")
            page.locator("#nameEdit").click()
            page.locator("#nameInput").fill("")
            page.locator("#nameSave").click()
            page.wait_for_function("document.getElementById('meName').textContent === '还没设'")
            page.goto(f"{SITE}/kanread.html?api={API}", wait_until="networkidle")
            item = page.locator(".rjc-item").filter(has_text=f"昵称测试 {tag}").first
            item.wait_for()
            self.assertEqual(item.locator(".rjc-handle").first.inner_text(), f"@{handle}")
            self.assertEqual(errors, [])
        finally:
            c.close()


if __name__ == "__main__":
    unittest.main()
