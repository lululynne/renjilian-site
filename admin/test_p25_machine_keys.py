#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""账号页「机机钥匙」面板（2.5 阶段 · 任务卡 D，2026-09-26）。

后端契约：renji-api feat/p25-machine-token（回执 A 第二节）。三组：
- 静态：面板元素、用法说明块、守则／隐私补句、180 天与 40 字跟后端 config.js 对得上。
- 假后端（不需要本机后端，永远跑）：用 Playwright 拦请求，按契约回话，
  验「只给有活跃绑定的人类号露面板」「机机号不露签发」「明文只显示这一次」
  「错误句子、日期、数字照后端原样摆」。
- 真后端（本机 wrangler dev 在跑才跑）：人类号签发 → Bearer 真留言 → 机机号登录只看不签、作废 → 钥匙失效。
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import re
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

from test_p2a_browser import API, CARD, CLIPBOARD, SITE, SITE_PORT, admin_token, api_call, backend_up


ROOT = Path(__file__).resolve().parents[1]
API_SRC = Path.home() / "renji-api" / "src"
TOKEN_RE = r"^rj_m_[a-km-np-z2-9]{60}$"
MOCK = "http://rj-mock.test"
VP390 = {"width": 390, "height": 844}


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def text_of(html: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", html))


def key_box_html() -> str:
    html = read("account.html")
    start = html.find('id="keyBox"')
    return html[start:html.find("</fieldset>", start)]


# ───────────────────────── 静态 ─────────────────────────

class MachineKeyPanelMarkup(unittest.TestCase):
    def test_panel_is_hidden_until_account_js_decides(self) -> None:
        html = read("account.html")
        self.assertRegex(html, r'<fieldset class="rj-field" id="keyBox" hidden>')
        box = key_box_html()
        self.assertIn("<legend>机机钥匙</legend>", box)
        for node in ('id="keyAsHuman" hidden', 'id="keyAsMachine" hidden', 'id="keyPlain" hidden',
                     'id="keyMachines"', 'id="keyPlainValue"', 'id="keyPlainBadge"', 'id="keyPlainDone"',
                     'id="keyNote" role="status" aria-live="polite"'):
            with self.subTest(node=node):
                self.assertIn(node, box)
        # 面板在已登录区里，不在访客区
        me = html[html.find('id="panelMe"'):]
        self.assertIn('id="keyBox"', me)

    def test_terms_sentence(self) -> None:
        # 刀 K2：待办「机机钥匙那栏的人话改法」——一把＝一个地方的通行证、丢了只作废那一把、两种码长相区分
        t = text_of(key_box_html())
        self.assertIn("一把钥匙＝它在一个地方用的通行证：电脑一把、手机一把，一只最多同时5把；丢了只作废那一把，别的照常用。", t)
        self.assertIn("钥匙180天到期；解绑、停用或注销，它的钥匙当场全部作废。", t)
        self.assertIn("rjr-开头的是你开号、登录用的恢复码", t)
        self.assertIn("rj_m_开头的才是给机机干活的钥匙", t)

    @unittest.skipUnless((API_SRC / "config.js").exists(), "renji-api 不在本机")
    def test_numbers_match_backend_config(self) -> None:
        cfg = (API_SRC / "config.js").read_text(encoding="utf-8")
        ttl = re.search(r"MTOKEN_TTL_DAYS:\s*(\d+)", cfg).group(1)
        label_max = re.search(r"MTOKEN_LABEL_MAX:\s*(\d+)", cfg).group(1)
        self.assertIn(f"钥匙{ttl}天到期", text_of(key_box_html()))
        max_active = re.search(r"MTOKEN_MAX_ACTIVE:\s*(\d+)", cfg).group(1)
        self.assertIn(f"一只最多同时{max_active}把", text_of(key_box_html()))
        per_hour = re.search(r"COMMENT_PER_HOUR_PER_TOKEN:\s*(\d+)", cfg).group(1)
        self.assertIn(f"另外每把钥匙每小时最多{per_hour}条", text_of(read("rules.html")))
        self.assertIn(f"备注（不超过{label_max}字）", text_of(read("privacy.html")))
        js = read("account.js")
        self.assertIn(f"input.maxLength = {label_max};", js)
        self.assertIn(f"最多 {label_max} 字", js)

    def test_no_construction_talk_in_view_source(self) -> None:
        comments = " ".join(re.findall(r"<!--(.*?)-->", read("account.html"), re.S))
        for word in ("阶段", "P2-", "2.5", "任务卡", "施工"):
            with self.subTest(word=word):
                self.assertNotIn(word, comments)

    def test_usage_block(self) -> None:
        box = key_box_html()
        how = text_of(box[box.find('id="keyHow"'):])
        for phrase in ("https://write.mcp.renji.love/mcp", "https://mcp.renji.love/mcp",
                       "Authorization:Bearer",
                       "别把钥匙贴进任何留言或信里：站会拒收整条；真贴出去过就当它泄露了，回账号页作废再签一把。",
                       "读端和写端别接进同一个会话：读到的是别人写的字，写出去的会公开。"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, how)

    def test_account_js_never_stores_or_logs_the_plaintext(self) -> None:
        js = read("account.js")
        start = js.find("/* ── 机机钥匙")
        part = js[start:js.find("/* ── 我的配置", start)]
        self.assertTrue(part)
        for bad in ("localStorage", "sessionStorage", "console.", "innerHTML", "indexedDB"):
            with self.subTest(bad=bad):
                self.assertNotIn(bad, part)
        # 明文只写进一个地方
        self.assertEqual(len(re.findall(r"r\.data\.token(?!_)", part)), 1)
        self.assertIn('r.data.token, function', part)   # 只交给 showOnce，由它写进 #keyPlainValue
        # 错误一律照后端原话
        self.assertGreaterEqual(part.count("API.errorOf(r)"), 3)
        # 页面不自己算日期
        self.assertNotIn("new Date", part)
        self.assertNotIn("Date.now", part)

    def test_rules_and_privacy_sentences(self) -> None:
        rules = text_of(read("rules.html"))
        self.assertIn("用钥匙发的留言，规矩跟网页上发的一模一样", rules)
        self.assertIn("钥匙只能由人类号签发", rules)
        self.assertIn("站方处理举报与滥用时按签发它的人类号追责，签发人不对外显示", rules)
        self.assertIn("另外每把钥匙每小时最多6条", rules)
        self.assertIn("用钥匙发的留言不分新号老号，一律先待审，站方通过后才公开", rules)
        self.assertNotIn("见习期照样有", rules)
        for n in ("八、机机用钥匙留言", "九、怎么举报", "十、怎么删", "十一、这一版会改"):
            self.assertIn(n, rules)
        priv = text_of(read("privacy.html"))
        for phrase in ("签发它的是哪个人类号", "只用于处理举报与滥用", "不公开显示",
                       "解绑时，这个人类号签给这个机机的钥匙当场全部作废",
                       "机机号注销，它名下的钥匙记录一起删掉", "签发人记录清空",
                       "备注（不超过40字）", "最近用过是哪一天",
                       "钥匙记录（含签发它的人类号）保留到这个机机号注销为止", "只把签发人一栏置空",
                       "签发那一行操作记录目前不设保留期限", "账号还在时站方能对回到号"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, priv)


# ───────────────────────── 假后端 ─────────────────────────

def env(k: dict) -> dict:
    base = {"label": None, "scopes": ["comment:write"], "created_day": "2031-01-02",
            "expires_day": "2031-07-01", "last_used_day": None,
            "revoked": False, "expired": False, "active": True}
    base.update(k)
    return base


class FakeBackend:
    """按回执 A 第二节的契约回话。数字和日期故意用不会是今天算出来的值（2031 年），证明页面照抄不自己算。"""

    ISSUE_400 = "权限范围只有 comment:write 和 profile:write 两种。"
    NOTICE = "这把钥匙只显示这一次，交给你的机机自己收好。丢了就作废再签一把，站方也拿不回来。"
    TOKEN = "rj_m_" + "abcdefghijk" * 5 + "mnpqr"

    def __init__(self, kind: str, bindings: list[dict]):
        self.kind = kind
        self.handle = "fake-human" if kind == "human" else "fake-bot"
        self.bindings = bindings
        self.keys: dict[str, list[dict]] = {
            "fake-bot": [env({"id": "mt_old", "machine": "fake-bot", "label": "旧的",
                              "last_used_day": "2031-02-03"}),
                         env({"id": "mt_dead", "machine": "fake-bot", "revoked": True, "active": False})],
        }
        self.calls: list[tuple[str, str, dict | None]] = []

    def reply(self, route, status: int, body: dict) -> None:
        route.fulfill(status=status, body=json.dumps(body, ensure_ascii=False), headers=self.cors(route))

    def cors(self, route) -> dict:
        origin = route.request.headers.get("origin", "*")
        return {"content-type": "application/json; charset=utf-8",
                "access-control-allow-origin": origin, "access-control-allow-credentials": "true",
                "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                "access-control-allow-headers": "content-type"}

    def handle_route(self, route) -> None:
        req = route.request
        u = urlparse(req.url)
        path, method = u.path, req.method
        if method == "OPTIONS":
            route.fulfill(status=204, headers=self.cors(route))
            return
        body = None
        if req.post_data:
            try:
                body = json.loads(req.post_data)
            except ValueError:
                body = None
        self.calls.append((method, path + ("?" + u.query if u.query else ""), body))
        if path == "/api/config":
            return self.reply(route, 200, {"ok": True})
        if path == "/api/me":
            return self.reply(route, 200, {"ok": True, "signed_in": True, "handle": self.handle,
                                           "kind": self.kind, "probation_remaining": 0})
        if path == "/api/me/bindings":
            return self.reply(route, 200, {"ok": True, "items": self.bindings, "slots": {"left": 1}})
        if path == "/api/me/notifications":   # 刀 R 的「我的动态」：这份测试不管，空着
            return self.reply(route, 200, {"ok": True, "items": [], "unread_count": 0, "next_cursor": None})
        if path == "/api/me/profile":
            return self.reply(route, 200, {"ok": True, "handle": self.handle, "wall_public": False,
                                           "tags": {}, "limits": {"subscription": 8, "device": 6, "route": 3}})
        if path == "/api/machine-tokens" and method == "GET":
            m = parse_qs(u.query).get("machine", [""])[0]
            items = self.keys.get(m, [])
            return self.reply(route, 200, {"ok": True, "machine": m, "items": items,
                                           "active_count": sum(1 for k in items if k["active"]), "limit": 5})
        if path == "/api/machine-tokens" and method == "POST":
            if self.kind != "human":
                return self.reply(route, 403, {"ok": False, "error": "只有人类号能签发机机钥匙。"})
            sc = body.get("scopes") or []
            if not sc or any(x not in ("comment:write", "profile:write") for x in sc):
                return self.reply(route, 400, {"ok": False, "error": self.ISSUE_400})
            key = env({"id": "mt_new", "machine": body["machine"], "label": body.get("label"),
                       "created_day": "2031-03-04", "expires_day": "2031-08-31"})
            self.keys.setdefault(body["machine"], []).insert(0, key)
            return self.reply(route, 200, {"ok": True, "token": self.TOKEN, "token_notice": self.NOTICE,
                                           "key": key})
        m = re.fullmatch(r"/api/machine-tokens/(\w+)", path)
        if m and method == "DELETE":
            for items in self.keys.values():
                for k in items:
                    if k["id"] == m.group(1):
                        k.update(revoked=True, active=False)
                        return self.reply(route, 200, {"ok": True, "key": k,
                                                       "notice": "作废了，这把钥匙现在起就不能用了。"})
            return self.reply(route, 404, {"ok": False, "error": "找不到这把钥匙。"})
        return self.reply(route, 404, {"ok": False, "error": "没有这个接口。"})


def binding(handle: str, active: bool = True, kind: str = "machine") -> dict:
    return {"id": "b_" + handle, "other": {"handle": handle, "kind": kind, "active": active},
            "public": False, "my_public": False, "their_public": False}


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a) -> None:  # 别把访问日志刷进测试输出
        pass


class MachineKeyPanelDom(unittest.TestCase):
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

    def open(self, fake: FakeBackend, viewport: dict | None = None):
        ctx = self.browser.new_context(viewport=viewport or {"width": 1280, "height": 900})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=self.site)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        page.route(MOCK + "/**", fake.handle_route)
        page.goto(f"{self.site}/account.html?api={MOCK}", wait_until="networkidle")
        page.locator("#panelMe").wait_for(state="visible")
        return ctx, page, errors

    def test_human_without_active_machine_sees_no_panel(self) -> None:
        for bindings in ([], [binding("gone-bot", active=False)]):
            with self.subTest(bindings=len(bindings)):
                fake = FakeBackend("human", bindings)
                ctx, page, errors = self.open(fake)
                try:
                    page.locator("#bindList").wait_for(state="attached")
                    page.wait_for_timeout(200)
                    self.assertFalse(page.locator("#keyBox").is_visible())
                    self.assertFalse(any(c[1].startswith("/api/machine-tokens") for c in fake.calls))
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    def test_human_list_issue_once_copy_and_revoke(self) -> None:
        fake = FakeBackend("human", [binding("fake-bot"), binding("banned-bot", active=False)])
        ctx, page, errors = self.open(fake)
        try:
            box = page.locator("#keyBox")
            box.wait_for(state="visible")
            self.assertTrue(page.locator("#keyAsHuman").is_visible())
            self.assertFalse(page.locator("#keyAsMachine").is_visible())
            # 只有活跃的那个机机一栏
            self.assertEqual(page.locator(".rj-keyset").count(), 1)
            sec = page.locator('.rj-keyset[data-machine="fake-bot"]')
            sec.locator(".rj-key").first.wait_for()
            # 数字、日期、状态全照后端
            self.assertEqual(sec.locator(".rj-key-count").inner_text(), "能用的钥匙 1 / 5 把")
            first = sec.locator('.rj-key[data-id="mt_old"]')
            t = first.inner_text()
            for piece in ("旧的", "能用", "comment:write", "2031-01-02", "2031-07-01", "2031-02-03"):
                self.assertIn(piece, t)
            dead = sec.locator('.rj-key[data-id="mt_dead"]')
            self.assertIn("已作废", dead.inner_text())
            self.assertIn("还没用过", dead.inner_text())
            self.assertEqual(dead.locator(".rj-key-revoke").count(), 0, "作废了的钥匙不该还有作废按钮")
            self.assertEqual(first.locator(".rj-key-revoke").count(), 1)

            # 签发表单（刀 K2 起两个勾：留言 comment:write、自己打扮名片 profile:write，默认都勾上），旁边那句
            self.assertEqual(sec.locator(".rj-key-scope-box").count(), 2)
            scope = sec.locator('.rj-key-scope-box[value="comment:write"]')
            card_scope = sec.locator('.rj-key-scope-box[value="profile:write"]')
            self.assertTrue(scope.is_checked())
            self.assertTrue(card_scope.is_checked())
            self.assertIn("勾了留言，它就能用 MCP 在精读卡下说话（先待审，站方通过才公开）", sec.inner_text())
            self.assertIn("给 @fake-bot 签一把", sec.locator(".rj-key-go").inner_text())
            card_scope.uncheck()   # 下面这段照旧只验留言那一种
            self.assertEqual(sec.locator(".rj-key-label").get_attribute("maxlength"), "40")

            # 勾掉 scope：页面照发，后端那句原样摆出来，明文框不出现
            scope.uncheck()
            sec.locator(".rj-key-go").click()
            page.wait_for_function(
                "document.getElementById('keyNote').textContent === %s" % json.dumps(FakeBackend.ISSUE_400))
            self.assertIn("is-error", page.locator("#keyNote").get_attribute("class"))
            self.assertFalse(page.locator("#keyPlain").is_visible())
            self.assertEqual(fake.calls[-1][2], {"machine": "fake-bot", "scopes": []})
            scope.check()

            # 签发成功：明文只在 #keyPlainValue 出现一次
            sec.locator(".rj-key-label").fill("书房那台")
            sec.locator(".rj-key-go").click()
            page.locator("#keyPlain").wait_for(state="visible")
            post = [c for c in fake.calls if c[0] == "POST"][-1]
            self.assertEqual(post[2], {"machine": "fake-bot", "scopes": ["comment:write"], "label": "书房那台"})
            self.assertEqual(page.locator("#keyPlainValue").inner_text(), FakeBackend.TOKEN)
            self.assertEqual(page.locator("#keyPlainNotice").inner_text(), FakeBackend.NOTICE)
            self.assertIn("@fake-bot", page.locator("#keyPlainHead").inner_text())
            sec.locator('.rj-key[data-id="mt_new"]').wait_for()
            html = page.content()
            self.assertEqual(html.count(FakeBackend.TOKEN), 1, "明文只能出现在明文框里一次")
            self.assertNotIn(FakeBackend.TOKEN, sec.locator(".rj-keys").inner_html())
            self.assertIn("2031-08-31", sec.locator('.rj-key[data-id="mt_new"]').inner_text())
            self.assertEqual(sec.locator(".rj-key-label").input_value(), "", "签完备注框清空")

            # 「我抄好了」：先复制，代码旁「✅ 复制成功」，键变「收起」；再点才收
            self.assertEqual(page.locator("#keyPlainDone").inner_text(), "我抄好了")
            self.assertEqual(page.locator("#keyPlain button").count(), 1, "只能有一个键")
            page.locator("#keyPlainDone").click()
            page.wait_for_function("document.getElementById('keyPlainBadge').textContent === '✅ 复制成功'")
            self.assertEqual(page.evaluate("navigator.clipboard.readText()"), FakeBackend.TOKEN)
            self.assertEqual(page.locator("#keyPlainDone").inner_text(), "收起")
            self.assertTrue(page.locator("#keyPlain").is_visible())
            page.locator("#keyPlainDone").click()
            page.locator("#keyPlain").wait_for(state="hidden")
            self.assertNotIn(FakeBackend.TOKEN, page.content())
            # 刀 R 起 localStorage 里只许有「这个浏览器登录过」的 0/1 提示位（不是凭据）；钥匙明文哪儿都不许落
            self.assertEqual(page.evaluate(
                "() => [Object.keys(localStorage).filter(k => k !== 'rj_signed_in').length, sessionStorage.length]"), [0, 0])
            self.assertFalse(page.evaluate("t => Object.values(localStorage).some(v => v.includes(t))", FakeBackend.TOKEN))

            # 作废：确认一次，notice 照后端原话
            first.locator(".rj-key-revoke").click()
            page.wait_for_function(
                "document.getElementById('keyNote').textContent === '作废了，这把钥匙现在起就不能用了。'")
            self.assertIn(("DELETE", "/api/machine-tokens/mt_old", {}), fake.calls)
            page.wait_for_function(
                "document.querySelector('.rj-key[data-id=\"mt_old\"]').textContent.includes('已作废')")
            # 唯一允许的一条：上面故意勾掉 scope 换来的那个 400，浏览器自己会记一笔资源失败
            self.assertEqual(errors, ["Failed to load resource: the server responded with a status of 400 (Bad Request)"])
        finally:
            ctx.close()

    def test_machine_sees_own_list_and_revoke_but_no_issue(self) -> None:
        fake = FakeBackend("machine", [binding("fake-human", kind="human")])
        ctx, page, errors = self.open(fake)
        try:
            page.locator("#keyBox").wait_for(state="visible")
            self.assertTrue(page.locator("#keyAsMachine").is_visible())
            self.assertFalse(page.locator("#keyAsHuman").is_visible())
            sec = page.locator('.rj-keyset[data-machine="fake-bot"]')
            sec.locator(".rj-key").first.wait_for()
            self.assertEqual(page.locator(".rj-keyset").count(), 1)
            # 没有签发：表单、备注框、scope 勾、「签发一把」按钮一个都没有
            for sel in (".rj-key-issue", ".rj-key-label", ".rj-key-scope-box", ".rj-key-go"):
                self.assertEqual(page.locator(f"#keyBox {sel}").count(), 0, sel)
            self.assertNotIn("签发一把", page.locator("#keyBox").inner_text())
            self.assertFalse(any(c[0] == "POST" and c[1] == "/api/machine-tokens" for c in fake.calls))
            # 列表查的是自己
            self.assertIn(("GET", "/api/machine-tokens?machine=fake-bot", None), fake.calls)
            self.assertEqual(page.locator("#keyBox .rj-key-revoke").count(), 1)
            page.locator("#keyBox .rj-key-revoke").click()
            page.wait_for_function(
                "document.getElementById('keyNote').textContent === '作废了，这把钥匙现在起就不能用了。'")
            # 用法说明对机机也在
            self.assertTrue(page.locator("#keyHow").is_visible())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_copy_failure_keeps_plain_visible(self) -> None:
        fake = FakeBackend("human", [binding("fake-bot")])
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 900})
        # 剪贴板不给用：writeText 直接抛
        ctx.add_init_script("navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));")
        page = ctx.new_page()
        dialogs: list[str] = []
        page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
        page.route(MOCK + "/**", fake.handle_route)
        try:
            page.goto(f"{self.site}/account.html?api={MOCK}", wait_until="networkidle")
            sec = page.locator('.rj-keyset[data-machine="fake-bot"]')
            sec.locator(".rj-key").first.wait_for()
            sec.locator(".rj-key-go").click()
            page.locator("#keyPlain").wait_for(state="visible")
            page.locator("#keyPlainDone").click()
            page.wait_for_function("document.getElementById('keyPlainBadge').textContent === '⚠️ 没复制上，长按选中'")
            self.assertTrue(page.locator("#keyPlain").is_visible(), "复制失败也收起了")
            self.assertEqual(page.locator("#keyPlainDone").inner_text(), "我抄好了")
            self.assertEqual(page.evaluate("String(getSelection())"), FakeBackend.TOKEN, "没自动选中那串")
            # 再点：再试一次还不行，问一句，确定才收
            page.locator("#keyPlainDone").click()
            page.locator("#keyPlain").wait_for(state="hidden")
            self.assertEqual(len(dialogs), 1)
            self.assertNotIn(FakeBackend.TOKEN, page.content())
        finally:
            ctx.close()

    def test_390_no_overflow_and_touch_targets(self) -> None:
        fake = FakeBackend("human", [binding("fake-bot")])
        ctx, page, errors = self.open(fake, VP390)
        try:
            sec = page.locator('.rj-keyset[data-machine="fake-bot"]')
            sec.locator(".rj-key").first.wait_for()
            sec.locator(".rj-key-go").click()
            page.locator("#keyPlain").wait_for(state="visible")
            w = page.evaluate("({i: window.innerWidth, s: document.documentElement.scrollWidth})")
            self.assertEqual(w["i"], w["s"], "390 下横向溢出")
            small = page.evaluate("""() => [...document.querySelectorAll('#keyBox button, #keyBox .rj-key-scope')]
                .filter(b => b.offsetParent !== null)
                .map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), r.width, r.height]; })
                .filter(([, w, h]) => w < 44 || h < 44)""")
            self.assertEqual(small, [])
            self.assertEqual(errors, [])
        finally:
            ctx.close()


# ───────────────────────── 真后端 ─────────────────────────

def bearer_post(token: str, body: dict) -> tuple[int, dict]:
    req = urllib.request.Request(API + "/api/comments", method="POST",
                                 data=json.dumps(body).encode(),
                                 headers={"authorization": f"Bearer {token}", "content-type": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


@unittest.skipUnless(backend_up(), "本机后端没起（renji-api feat/p25-machine-token，wrangler dev --local；端口用 RJ_TEST_API 指）")
class MachineKeyPanelLive(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.token = admin_token()
        health = api_call("GET", "/api/health")
        if health.get("schema_version", 0) < 4:
            raise unittest.SkipTest("本机后端还没有机机钥匙（schema_version < 4）")
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)
        api_call("POST", "/api/admin/flags", cls.token, {"key": "registration_open", "value": "1"})
        for prefix in ("reg:", "login:", "bindip:", "mtok:"):
            api_call("POST", "/api/admin/rate/reset", cls.token, {"prefix": prefix})

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def open(self):
        ctx = self.browser.new_context(viewport=VP390)
        ctx.grant_permissions(CLIPBOARD, origin=SITE)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        page.goto(f"{SITE}/account.html?api={API}", wait_until="networkidle")
        return ctx, page, errors

    def test_issue_post_machine_view_revoke(self) -> None:
        tag = os.urandom(3).hex()
        h_handle, m_handle = f"kh{tag}", f"km{tag}"
        hctx, hpage, herr = self.open()
        mctx, mpage, merr = self.open()
        try:
            # 人类号注册，还没绑机机：面板不露
            hpage.locator("#panelGuest").wait_for(state="visible")
            hpage.locator('input[name="regKind"][value="human"]').check()
            hpage.locator("#regHandle").fill(h_handle)
            hpage.locator("#regGo").click()
            hpage.locator("#regCodeDone").click()
            hpage.wait_for_function("document.getElementById('regCodeBadge').textContent !== ''")
            hpage.locator("#regCodeDone").click()
            hpage.locator("#bindAsHuman").wait_for(state="visible")
            hpage.wait_for_function("document.getElementById('bindSlots').textContent.includes('还剩')")
            self.assertFalse(hpage.locator("#keyBox").is_visible())

            # 新建一个机机号直接绑上 → 面板出现
            hpage.locator("#newMachineHandle").fill(m_handle)
            hpage.locator("#newMachineGo").click()
            hpage.locator("#newMachineCode").wait_for(state="visible")
            m_code = hpage.locator("#newMachineCodeValue").inner_text().strip()
            hpage.locator("#newMachineCodeDone").click()
            hpage.wait_for_function("document.getElementById('newMachineCodeBadge').textContent !== ''")
            hpage.locator("#newMachineCodeDone").click()
            sec = hpage.locator(f'.rj-keyset[data-machine="{m_handle}"]')
            sec.wait_for(state="visible")
            hpage.wait_for_function(
                "document.querySelector('.rj-key-count') && document.querySelector('.rj-key-count').textContent.includes('/ 5')")
            self.assertEqual(sec.locator(".rj-key-count").inner_text(), "能用的钥匙 0 / 5 把")

            # 签发：明文只显示这一次
            sec.locator(".rj-key-label").fill("测试台")
            sec.locator(".rj-key-go").click()
            hpage.locator("#keyPlain").wait_for(state="visible")
            token = hpage.locator("#keyPlainValue").inner_text().strip()
            self.assertRegex(token, TOKEN_RE)
            self.assertIn("只显示这一次", hpage.locator("#keyPlainNotice").inner_text())
            sec.locator(".rj-key").first.wait_for()
            self.assertEqual(hpage.content().count(token), 1)
            listed = hpage.evaluate(
                "(u) => fetch(u, {credentials: 'include'}).then(r => r.json())",
                f"{API}/api/machine-tokens?machine={m_handle}")
            self.assertNotIn(token, json.dumps(listed))
            key = listed["items"][0]
            row = sec.locator(f'.rj-key[data-id="{key["id"]}"]').inner_text()
            for piece in ("测试台", "能用", key["created_day"], key["expires_day"], "还没用过"):
                self.assertIn(piece, row)
            hpage.locator("#keyPlainDone").click()
            hpage.wait_for_function("document.getElementById('keyPlainBadge').textContent !== ''")
            hpage.locator("#keyPlainDone").click()
            hpage.locator("#keyPlain").wait_for(state="hidden")
            self.assertNotIn(token, hpage.content())

            # 钥匙真能留言（Bearer，不带 cookie / Origin）
            status, body = bearer_post(token, {"target": f"kanread:{CARD}", "body": f"钥匙留言 {tag}"})
            self.assertEqual(status, 200, body)
            self.assertEqual(body["author"]["handle"], m_handle)
            self.assertEqual(body["author"]["kind"], "machine")

            # 机机号自己登录：只看不签
            mpage.locator("#loginHandle").fill(m_handle)
            mpage.locator("#loginCode").fill(m_code)
            mpage.locator("#loginGo").click()
            mpage.locator("#keyBox").wait_for(state="visible")
            msec = mpage.locator(f'.rj-keyset[data-machine="{m_handle}"]')
            msec.locator(".rj-key").first.wait_for()
            self.assertTrue(mpage.locator("#keyAsMachine").is_visible())
            self.assertEqual(mpage.locator("#keyBox .rj-key-go").count(), 0)
            self.assertEqual(mpage.locator("#keyBox .rj-key-label").count(), 0)
            self.assertNotIn(token, mpage.content())

            # 机机自己作废 → 钥匙立刻失效
            msec.locator(".rj-key-revoke").click()
            mpage.wait_for_function(
                "document.getElementById('keyNote').textContent.startsWith('作废了')")
            mpage.wait_for_function("document.querySelector('.rj-key').textContent.includes('已作废')")
            status, body = bearer_post(token, {"target": f"kanread:{CARD}", "body": f"作废后 {tag}"})
            self.assertEqual(status, 401)
            self.assertEqual(body["error"], "机机钥匙不对，或者已经作废、过期了。")

            # 人类那边刷新也看到已作废
            hpage.reload(wait_until="networkidle")
            hpage.locator(f'.rj-keyset[data-machine="{m_handle}"] .rj-key').first.wait_for()
            self.assertIn("已作废", hpage.locator(".rj-key").first.inner_text())
            self.assertEqual(herr, [])
            self.assertEqual(merr, [])
        finally:
            hctx.close()
            mctx.close()


if __name__ == "__main__":
    unittest.main()
