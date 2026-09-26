#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""P2-a 评论区的浏览器实测（2026-09-18）。

要求本机后端在跑：
    cd ~/renji-api && npx wrangler@latest dev --local --port 8798
后端不在就整组 skip —— 所以 `pytest admin/ -q` 在没有后端时照样全绿。

静态站固定起在 8800：后端的 CORS 白名单里写的就是 http://127.0.0.1:8800，
换端口就会被 Origin 校验挡掉（这本身也是一条被验到的行为）。
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

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path.home() / ".openclaw/backups/renjilian-p2a-20260918/shots"
# 默认连 8798；别的席位占着 8798 时，用 RJ_TEST_API 指到自己起的那一份（例如 http://127.0.0.1:8796）
API = os.environ.get("RJ_TEST_API", "http://127.0.0.1:8798")
SITE_PORT = 8800
SITE = f"http://127.0.0.1:{SITE_PORT}"
CARD = "kr-liu-shengyu-bury-talent"

VIEWPORTS = {"390": {"width": 390, "height": 844}, "1280": {"width": 1280, "height": 900}}


def admin_token() -> str | None:
    env = os.environ.get("RENJI_ADMIN_TOKEN")
    if env:
        return env
    f = Path.home() / "renji-api/.dev.vars"
    if not f.exists():
        return None
    m = re.search(r"^\s*ADMIN_TOKEN\s*=\s*(.+?)\s*$", f.read_text(encoding="utf-8"), re.M)
    return m.group(1) if m else None


def api_call(method: str, path: str, token: str | None = None, body: dict | None = None):
    req = urllib.request.Request(API + path, method=method)
    if token:
        req.add_header("authorization", f"Bearer {token}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("content-type", "application/json")
    # localhost 一律绕开代理
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, data, timeout=10) as r:
        return json.loads(r.read().decode())


def backend_up() -> bool:
    try:
        return bool(api_call("GET", "/api/health").get("ok"))
    except Exception:
        return False


@unittest.skipUnless(backend_up(), "本机后端没起（cd ~/renji-api && npx wrangler@latest dev --local --port 8798）")
class CommentsBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.token = admin_token()
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        handler.log_message = lambda *a, **k: None          # 别把访问日志刷进测试输出
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        SHOTS.mkdir(parents=True, exist_ok=True)
        api_call("POST", "/api/admin/flags", cls.token, {"key": "comments_enabled", "value": "1"})
        # 浏览器伪造不了来源 IP，所以这一组测试的注册全挤在 127.0.0.1 这一个限速桶里，
        # 跑两轮就会撞上「同一 IP 每天 5 个号」。开跑前把注册桶清一下。
        # （闸门本身在 renji-api 的对抗测试里单独验过，不是在这里放水。）
        api_call("POST", "/api/admin/rate/reset", cls.token, {"prefix": "reg:"})
        # 登录桶同理，而且更隐蔽：_flow 每个视宽登录一次＝每跑一遍烧 2 次，
        # 上限是「同一 IP 每小时 20 次」的滑动窗口。一小时内跑到第 11 遍，
        # 第 21 次登录就会 429，#panelMe 永远不出来——看着像偶发，其实是把
        # 上一遍的计数带进了这一遍。桶不清，测试就不是独立的。
        api_call("POST", "/api/admin/rate/reset", cls.token, {"prefix": "login:"})

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def open(self, name: str, viewport: str, *, live: bool):
        context = self.browser.new_context(viewport=VIEWPORTS[viewport])
        page = context.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        q = f"?api={API}" if live else ""
        page.goto(f"{SITE}/{name}{q}", wait_until="networkidle")
        return context, page, errors

    def shot(self, page, name: str) -> None:
        page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)

    def assert_mounted_once(self, page) -> None:
        """每张卡的评论区只许挂一次。

        挂两次的时候页面看着是好的（列表和发表框都在），但先挂的那次的列表已经被
        后挂的那次从文档里摘掉了，而它的发表框还留着——按「发表」评论真的存进库、
        回执也出来，列表却永远不动。所以这里不看「有没有」，看「是不是正好一个」。"""
        counts = page.evaluate("""() => [...document.querySelectorAll('.kr-comments')].map(h => ({
            notes: h.querySelectorAll('.rjc-note').length,
            lists: h.querySelectorAll('.rjc-list').length,
            composes: h.querySelectorAll('.rjc-compose').length,
        }))""")
        self.assertTrue(counts, "页面上一张精读卡都没有")
        for i, c in enumerate(counts):
            self.assertEqual(c, {"notes": 1, "lists": 1, "composes": 1},
                             f"第 {i + 1} 张卡的评论区挂了不止一次：{c}")

    # ── 没有后端：跟现在一模一样 ──
    def test_without_backend_the_page_is_unchanged(self) -> None:
        for vp in VIEWPORTS:
            with self.subTest(viewport=vp):
                context, page, errors = self.open("kanread.html", vp, live=False)
                try:
                    page.locator(".kanread-card").first.wait_for()
                    self.assertIn("评论区还没开放", page.locator(".kr-comments").first.inner_text())
                    self.assertEqual(page.locator(".rjc-input").count(), 0)
                    self.shot(page, f"kanread-no-api-{vp}")
                    self.assertEqual(errors, [])
                finally:
                    context.close()

    # ── start() 的两个入口同时点着，也只许挂一次 ──
    def test_double_start_mounts_the_comment_box_only_once(self) -> None:
        """comments.js 里 start() 有两个入口：DOMContentLoaded 之后的 setTimeout，
        和 kanread.html 铺完卡片派的 rj:kanread-rendered。谁先到是不定的，两个都得留着；
        而 data/kanread.json 恰好落在两者之间的那一次，两个入口会在同一次加载里都点着
        （实测 80 次加载撞上 1 次，所以靠自然概率守不住）。

        这里把那一跳排成必然：事件触发时，再排一个 setTimeout 把事件补派一次——
        任务次序跟真实竞态一模一样。挂第二次会把先挂那次的 .rjc-list 从文档里摘掉，
        而它的发表框要等自己的 refresh() 落地才追加、于是留在页面上连着一个脱离文档的列表：
        读者按「发表」，评论真的进了库、回执也出来，列表却永远不动。"""
        context = self.browser.new_context(viewport=VIEWPORTS["1280"])
        context.add_init_script(
            "document.addEventListener('rj:kanread-rendered', () => {"
            "  if (window.__rjAgain) return;"
            "  window.__rjAgain = true;"
            "  setTimeout(() => document.dispatchEvent(new CustomEvent('rj:kanread-rendered')), 0);"
            "}, true);"
        )
        page = context.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            page.goto(f"{SITE}/kanread.html?api={API}", wait_until="networkidle")
            page.locator(".rjc-list").first.wait_for()
            self.assertTrue(page.evaluate("window.__rjAgain === true"), "补派那一次没跑到")
            self.assert_mounted_once(page)
            # 而且留在页面上的那个列表必须真的在文档里（不是被摘掉的那个）
            self.assertTrue(page.evaluate(
                "[...document.querySelectorAll('.rjc-list')]"
                ".every(n => document.contains(n))"), "有列表被挂第二次时摘出了文档")
            self.assertEqual(errors, [])
        finally:
            context.close()

    # ── 接上后端：注册 → 留言（待审）→ 通过 → 公开 ──
    def test_full_flow_register_then_comment(self) -> None:
        for vp in VIEWPORTS:
            with self.subTest(viewport=vp):
                self._flow(vp)

    def _flow(self, vp: str) -> None:
        handle = f"br{vp}{os.urandom(3).hex()}"
        context, page, errors = self.open("account.html", vp, live=True)
        try:
            # 注册：先选身份，第二步才出来
            page.locator("#panelGuest").wait_for(state="visible")
            self.assertFalse(page.locator("#regStep2").is_visible(), "还没选身份就露出了第二步")
            page.locator('input[name="regKind"][value="human"]').check()
            page.locator("#regStep2").wait_for(state="visible")
            page.locator("#regHandle").fill(handle)
            self.shot(page, f"account-register-{vp}")
            page.locator("#regGo").click()

            # 恢复码只显示一次
            page.locator("#regCode").wait_for(state="visible")
            code = page.locator("#regCodeValue").inner_text().strip()
            self.assertRegex(code, r"^rjr-[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$")
            self.assertIn("只显示这一次", page.locator("#regCode").inner_text())
            self.shot(page, f"account-recovery-code-{vp}")
            page.locator("#regCodeDone").click()

            # 登录态面板
            page.locator("#panelMe").wait_for(state="visible")
            self.assertEqual(page.locator("#meHandle").inner_text(), "@" + handle)
            self.assertIn("· 自报", page.locator("#meKind").inner_text())
            self.assertEqual(page.locator("#regCodeValue").inner_text(), "", "恢复码没从页面上抹掉")
            self.shot(page, f"account-signed-in-{vp}")
            self.assertEqual(errors, [])
        finally:
            context.close()

        # 同一个 context 关掉了，但会话在 cookie 里；换新 context 要重新登录，
        # 所以这一段接着用一个带登录态的新页面：直接用恢复码登进去
        context, page, errors = self.open("account.html", vp, live=True)
        try:
            page.locator("#panelGuest").wait_for(state="visible")
            page.locator("#loginHandle").fill(handle)
            page.locator("#loginCode").fill(code)
            page.locator("#loginGo").click()
            page.locator("#panelMe").wait_for(state="visible")

            # 去刊读发一条
            page.goto(f"{SITE}/kanread.html?api={API}", wait_until="networkidle")
            page.locator(".rjc-input").first.wait_for()
            self.assert_mounted_once(page)

            # 那句话必须在发表框正上方
            warn = page.locator(".rjc-warn").first
            self.assertIn("会被别的 AI 读走", warn.inner_text())
            box = warn.bounding_box()
            ta = page.locator(".rjc-input").first.bounding_box()
            self.assertLess(box["y"], ta["y"], "那句话必须在发表框上方")

            # 本机 D1 是攒着的，列表里本来就有别轮测试留下的评论，
            # 所以按内容定位自己这一条，不按「第一条」
            body = f"在 {vp} 宽度下写的一条真留言（{handle}）：读完原文回来看这两段，落差比结论更值得想。"
            page.locator(".rjc-input").first.fill(body)
            page.locator(".rjc-send").first.click()

            # 见习期 → 待审，只有作者自己看得到
            item = page.locator(".rjc-item").filter(has_text=handle).first
            item.wait_for(timeout=15000)
            self.assertIn("待审", item.inner_text())
            self.assertIn("人类 · 自报", item.inner_text())
            self.assertIn(body, item.inner_text())
            self.assertEqual(page.locator(".rjc-body").first.inner_text(), body)
            self.shot(page, f"kanread-comment-pending-{vp}")

            # 管理端通过
            cid = item.get_attribute("data-id")
            api_call("POST", f"/api/admin/comments/{cid}/approve", self.token, {})

            # 刷新 → 公开可见，不再是待审
            page.reload(wait_until="networkidle")
            page.locator(".rjc-item").first.wait_for()
            shown = page.locator(f'.rjc-item[data-id="{cid}"]')
            self.assertEqual(shown.count(), 1)
            self.assertNotIn("待审", shown.inner_text())
            self.assertIn("人类 · 自报", shown.inner_text())
            self.shot(page, f"kanread-comment-public-{vp}")

            # 匿名读者也看得到，而且看不到发表框
            anon = self.browser.new_context(viewport=VIEWPORTS[vp])
            anon_page = anon.new_page()
            anon_page.goto(f"{SITE}/kanread.html?api={API}", wait_until="networkidle")
            anon_page.locator(".rjc-item").first.wait_for()
            self.assertIn(body, anon_page.locator(".kr-comments").first.inner_text())
            self.assertEqual(anon_page.locator(".rjc-input").count(), 0, "没登录不该有发表框")
            self.assertIn("登录／注册", anon_page.locator(".rjc-signin").first.inner_text())
            anon_page.screenshot(path=str(SHOTS / f"kanread-anonymous-{vp}.png"), full_page=True)
            anon.close()

            # 真 390 下不许横向溢出
            if vp == "390":
                w = page.evaluate("({i: window.innerWidth, s: document.documentElement.scrollWidth})")
                self.assertEqual(w["i"], w["s"], "390 下评论区把页面撑宽了")

            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_keyboard_path_reaches_and_submits_the_compose_box(self) -> None:
        """键盘路径：Tab 能走到输入框、能提交、焦点不丢；错误提示走 aria-live。"""
        api_call("POST", "/api/admin/rate/reset", self.token, {"prefix": "reg:"})
        handle = f"kb{os.urandom(3).hex()}"
        context, page, errors = self.open("account.html", "390", live=True)
        try:
            page.locator("#panelGuest").wait_for(state="visible")
            page.locator('input[name="regKind"][value="machine"]').check()
            page.locator("#regHandle").fill(handle)
            page.locator("#regGo").click()
            page.locator("#regCode").wait_for(state="visible")
            page.locator("#regCodeDone").click()
            page.locator("#panelMe").wait_for(state="visible")

            page.goto(f"{SITE}/kanread.html?api={API}", wait_until="networkidle")
            page.locator(".rjc-input").first.wait_for()
            self.assert_mounted_once(page)

            # 回执／错误提示必须是 aria-live 区域
            note = page.locator(".rjc-note").first
            self.assertEqual(note.get_attribute("aria-live"), "polite")
            self.assertEqual(note.get_attribute("role"), "status")

            # 只用键盘：Tab 走到输入框
            page.locator("body").click(position={"x": 5, "y": 5})
            reached = False
            for _ in range(60):
                page.keyboard.press("Tab")
                if page.evaluate("document.activeElement && document.activeElement.classList.contains('rjc-input')"):
                    reached = True
                    break
            self.assertTrue(reached, "Tab 走不到发表框")

            body = f"只用键盘发的一条留言（{handle}）。"
            page.keyboard.type(body)
            # 再 Tab 一下就是「发表」，回车提交
            page.keyboard.press("Tab")
            self.assertTrue(
                page.evaluate("document.activeElement && document.activeElement.classList.contains('rjc-send')"),
                "输入框后面紧跟着的应该是发表按钮",
            )
            page.keyboard.press("Enter")

            item = page.locator(".rjc-item").filter(has_text=handle).first
            item.wait_for(timeout=15000)
            self.assertIn(body, item.inner_text())
            # 焦点不许丢回 body
            self.assertNotEqual(page.evaluate("document.activeElement.tagName"), "BODY", "提交之后焦点丢了")
            self.assertNotEqual(note.inner_text().strip(), "", "提交回执没进 aria-live 区域")
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_kill_switch_degrades_the_page_gracefully(self) -> None:
        api_call("POST", "/api/admin/flags", self.token, {"key": "comments_enabled", "value": "0"})
        try:
            context, page, errors = self.open("kanread.html", "390", live=True)
            try:
                page.locator(".kanread-card").first.wait_for()
                page.wait_for_timeout(400)
                text = page.locator(".kr-comments").first.inner_text()
                self.assertIn("只能看不能写", text)
                self.assertEqual(page.locator(".rjc-input").count(), 0, "总闸关了还给发表框")
                self.shot(page, "kanread-comments-off-390")
                self.assertEqual(errors, [], "总闸关了页面不许报错")
            finally:
                context.close()
        finally:
            api_call("POST", "/api/admin/flags", self.token, {"key": "comments_enabled", "value": "1"})


if __name__ == "__main__":
    unittest.main()
