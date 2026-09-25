#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""P2-c 机友配置页（徽章墙）的浏览器实测（2026-09-25）。

真点页面走完主链路：
账号页挑标签 → 保存 → 打开「在墙上显示」→ 配置页渲染徽章（含绑着的机机和它的徽章）→
成本页的墙上出现这张卡、点进去是配置页 → 关掉 → 配置页说没有、墙上消失。
另外两条：后端不在时成本页退回三张示例卡；挑超过上限时错误进 aria-live。
每一步都在真 390 宽度下量横向溢出和 44px 触控，console 零错误。

要求本机后端在跑：
    cd ~/renji-api && npx wrangler@latest dev --local --port 8798
后端不在就整组 skip（示例卡那条不需要后端，照跑）。静态站固定起在 8800。
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

from test_p2a_browser import API, SITE, SITE_PORT, admin_token, api_call, backend_up


ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path.home() / ".openclaw/backups/renjilian-p2c-20260925/shots"
VP = {"width": 390, "height": 844}
TAGS = json.loads((ROOT / "data/llm-cost-tags.json").read_text(encoding="utf-8"))
LABEL = {row["id"]: row for pool in ("subscription", "device", "route") for row in TAGS[pool]}

TOUCH_IN = """(sel) => [...document.querySelectorAll(sel + ' button, ' + sel + ' a')]
    .filter(b => !b.disabled && b.offsetParent !== null)
    .map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 20), r.width, r.height]; })
    .filter(([, w, h]) => w < 44 || h < 44)"""


class _Site:
    """静态站起在 8800（后端 CORS 白名单只放这个端口）。整个模块共用一个。"""
    server = None
    thread = None

    @classmethod
    def up(cls) -> None:
        if cls.server:
            return
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        handler.log_message = lambda *a, **k: None
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def down(cls) -> None:
        if not cls.server:
            return
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        cls.server = None


class _Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _Site.up()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        SHOTS.mkdir(parents=True, exist_ok=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.playwright.stop()
        _Site.down()

    def open(self, path: str, context=None, lang: str | None = None):
        ctx = context or self.browser.new_context(viewport=VP)
        if lang:
            ctx.add_init_script(f"try {{ localStorage.setItem('renjilian-cost-lang', '{lang}'); }} catch (e) {{}}")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{SITE}/{path}", wait_until="networkidle")
        return ctx, page, errors

    def no_overflow(self, page, where: str) -> None:
        w = page.evaluate("({i: window.innerWidth, s: document.documentElement.scrollWidth, b: document.body.scrollWidth})")
        self.assertEqual((w["i"], w["s"], w["b"]), (390, 390, 390), f"390 下横向溢出：{where}")

    def touch_ok(self, page, sel: str, where: str) -> None:
        self.assertEqual(page.evaluate(TOUCH_IN, sel), [], f"{where}：有按钮或链接小于 44px")


class SampleWallTests(_Base):
    def test_cost_wall_falls_back_to_samples_without_backend(self) -> None:
        """没有 ?api=：本机默认「没有后端」，墙上是三张示例卡，每张带「示例」，不发请求、不报错。"""
        ctx, page, errors = self.open("cost.html")
        try:
            page.locator("#setupWall .setup-card").first.wait_for()
            cards = page.locator("#setupWall .setup-card")
            self.assertEqual(cards.count(), 3)
            self.assertEqual(page.locator("#setupWall a.setup-card").count(), 0, "示例卡不该是链接")
            for i in range(3):
                self.assertEqual(cards.nth(i).locator(".setup-sample").inner_text().strip(), "示例")
            note = page.locator("#wallNote").inner_text()
            self.assertIn("墙上的号是它们自己报的配置", note)
            self.assertIn("示例", note)
            self.no_overflow(page, "成本页示例墙")
            self.touch_ok(page, "#setups", "成本页示例墙")
            self.assertEqual(errors, [])
        finally:
            ctx.close()


@unittest.skipUnless(backend_up(), "本机后端没起（cd ~/renji-api && npx wrangler@latest dev --local --port 8798）")
class ProfileWallBrowserTests(_Base):
    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.token = admin_token()
        # 浏览器伪造不了来源 IP，注册全挤在 127.0.0.1 一个桶里；开跑前清一下（闸门在后端对抗测试里单独验过）
        api_call("POST", "/api/admin/flags", cls.token, {"key": "registration_open", "value": "1"})
        for prefix in ("reg:", "login:", "bindip:", "bind:", "bcode:"):
            api_call("POST", "/api/admin/rate/reset", cls.token, {"prefix": prefix})

    def register(self, page, kind: str, handle: str) -> None:
        page.locator("#panelGuest").wait_for(state="visible")
        page.locator(f'input[name="regKind"][value="{kind}"]').check()
        page.locator("#regHandle").fill(handle)
        page.locator("#regGo").click()
        page.locator("#regCode").wait_for(state="visible")
        page.locator("#regCodeDone").click()
        page.locator("#profileBox").wait_for(state="visible")
        page.locator("#pickRows button[data-tag]").first.wait_for()

    def pick(self, page, tag: str) -> None:
        b = page.locator(f'#pickRows button[data-tag="{tag}"]')
        before = b.get_attribute("aria-pressed")
        b.click()
        self.assertNotEqual(b.get_attribute("aria-pressed"), before, f"{tag} 点了没反应")

    def save_and_publish(self, page) -> None:
        page.locator("#profileSave").click()
        page.wait_for_function("document.getElementById('profileNote').textContent.includes('存好了')")
        page.locator("#profileLink").wait_for(state="visible")
        page.locator("#wallGo").click()
        page.wait_for_function("document.getElementById('wallGo').getAttribute('aria-pressed') === 'true'")
        self.assertIn("在墙上显示：开", page.locator("#wallGo").inner_text())

    def fetch_in(self, page, method: str, path: str, body=None):
        return page.evaluate(
            """async ([api, method, path, body]) => {
                const r = await fetch(api + path, {method, credentials: 'include',
                  headers: body ? {'content-type': 'application/json'} : {},
                  body: body ? JSON.stringify(body) : undefined});
                return {status: r.status, data: await r.json()};
            }""", [API, method, path, body])

    def test_pick_save_profile_wall_and_withdraw(self) -> None:
        tag = os.urandom(3).hex()
        h_handle, m_handle = f"ph{tag}", f"pm{tag}"
        subs = ["sub-claude-pro-monthly", "sub-chatgpt-plus-monthly"]
        devs = ["dev-mba-m4"]
        routes = ["route-api-only"]

        hctx, hpage, herr = self.open(f"account.html?api={API}")
        mctx, mpage, merr = self.open(f"account.html?api={API}")
        try:
            # ── 人类号：注册，三行票根都在，默认不上墙 ──
            self.register(hpage, "human", h_handle)
            for pool in ("subscription", "device", "route"):
                n = hpage.locator(f'#pickRows [data-pool="{pool}"] button[data-tag]').count()
                self.assertEqual(n, len(TAGS[pool]), f"{pool} 的选项没照标签表全列出来")
            self.assertEqual(hpage.locator("#wallGo").get_attribute("aria-pressed"), "false")
            self.assertFalse(hpage.locator("#profileLink").is_visible())
            self.assertEqual(hpage.locator('#pickRows button[aria-pressed="true"]').count(), 0)

            # ── 挑标签：选中态、计数 ──
            for t in subs + devs + routes:
                self.pick(hpage, t)
            self.assertEqual(hpage.locator('#pickRows [data-pool="subscription"] .rj-pick-count').inner_text(), "2 / 8")
            self.assertEqual(hpage.locator('#pickRows [data-pool="device"] .rj-pick-count').inner_text(), "1 / 6")
            self.assertEqual(hpage.locator('#pickRows [data-pool="route"] .rj-pick-count').inner_text(), "1 / 3")
            # 选中态看得出来：对勾、原色边；没选的是灰线白底
            on = hpage.locator(f'#pickRows button[data-tag="{subs[0]}"]')
            off = hpage.locator('#pickRows [data-pool="subscription"] button[aria-pressed="false"]').first
            on_style = on.evaluate("b => [getComputedStyle(b, '::before').content, getComputedStyle(b).backgroundColor]")
            off_style = off.evaluate("b => [getComputedStyle(b, '::before').content, getComputedStyle(b).backgroundColor]")
            self.assertEqual(on_style[0], '"✓"')
            self.assertNotEqual(on_style[1], off_style[1], "选中和没选看起来一样")
            self.assertIn("还没保存", hpage.locator("#profileNote").inner_text())

            # ── 保存 → 上墙 ──
            self.save_and_publish(hpage)
            href = hpage.locator("#profileLink").get_attribute("href")
            self.assertIn(f"profile.html?u={h_handle}", href)
            self.assertIn("api=", href, "本机联调时链接没带上后端参数")
            self.no_overflow(hpage, "账号页我的配置")
            self.touch_ok(hpage, "#profileBox", "账号页我的配置")
            hpage.screenshot(path=str(SHOTS / "p2c-account-picked-390.png"), full_page=True)
            mine = self.fetch_in(hpage, "GET", "/api/me/profile")
            self.assertEqual(mine["data"]["tags"], {"subscription": subs, "device": devs, "route": routes})

            # ── 机机号：也挑配置、也上墙；和人类号绑上并两边公开 ──
            self.register(mpage, "machine", m_handle)
            self.pick(mpage, "dev-mac-mini-m4")
            self.pick(mpage, "sub-claude-max-20x-monthly")
            self.save_and_publish(mpage)
            code = self.fetch_in(mpage, "POST", "/api/me/binding-codes", {})["data"]["binding_code"]
            bound = self.fetch_in(hpage, "POST", "/api/bindings", {"code": code})
            self.assertEqual(bound["status"], 200, bound)
            bid = bound["data"]["binding"]["id"]
            for p in (hpage, mpage):
                self.assertEqual(self.fetch_in(p, "PATCH", f"/api/bindings/{bid}/visibility", {"public": True})["status"], 200)

            # ── 点「看我的配置页」→ 配置页：大头、三行徽章、它绑的机机带徽章 ──
            hpage.locator("#profileLink").click()
            hpage.wait_for_url("**/profile.html?**")
            hpage.locator("#pfCard").wait_for(state="visible")
            self.assertEqual(hpage.locator("#pfHandle").inner_text(), "@" + h_handle)
            self.assertEqual(hpage.locator("#pfKind").inner_text(), "人类 · 自报")
            got = hpage.locator("#pfTags .fare-tag").all_inner_texts()
            self.assertEqual(got, [LABEL[t]["label"] for t in subs + devs + routes])
            self.assertEqual(hpage.locator("#pfTags .fare-tag").first.get_attribute("data-tone"), LABEL[subs[0]]["tone"])
            self.assertEqual(hpage.locator("#pfBoundTitle").inner_text(), "它绑的机机")
            other = hpage.locator(".pf-other").filter(has_text="@" + m_handle)
            self.assertEqual(other.count(), 1)
            self.assertIn("机机 · 自报", other.inner_text())
            self.assertEqual(other.locator(".fare-tag").all_inner_texts(),
                             [LABEL["sub-claude-max-20x-monthly"]["label"], LABEL["dev-mac-mini-m4"]["label"]])
            # 顶栏只点亮真实栏目：配置页不点亮任何一项、不进顶栏
            self.assertEqual(hpage.locator("nav.boards a.on").count(), 0)
            self.assertEqual(hpage.locator('nav.boards a[href^="profile.html"]').count(), 0)
            self.no_overflow(hpage, "配置页")
            self.touch_ok(hpage, "main", "配置页")
            hpage.screenshot(path=str(SHOTS / "p2c-profile-390.png"), full_page=True)

            # ── 成本页的墙：两张真卡，示例卡退场；点人类号那张进配置页 ──
            cctx, cpage, cerr = self.open(f"cost.html?api={API}")
            try:
                cpage.locator(f'#setupWall a.setup-card[href^="profile.html?u={h_handle}&"]').wait_for()
                self.assertEqual(cpage.locator("#setupWall .setup-sample").count(), 0, "有真号时还摆着示例卡")
                self.assertEqual(cpage.locator("#wallNote").inner_text().strip(), "墙上的号是它们自己报的配置。")
                hcard = cpage.locator(f'#setupWall a.setup-card[href^="profile.html?u={h_handle}&"]')
                self.assertIn(f"绑着 @{m_handle} · 机机", hcard.inner_text())
                self.assertEqual(hcard.locator(".fare-tag").count(), 4)
                mcard = cpage.locator(f'#setupWall a.setup-card[href^="profile.html?u={m_handle}&"]')
                self.assertIn(f"绑着 @{h_handle} · 人类", mcard.inner_text())
                self.assertIn("机机 · 自报", mcard.inner_text())
                self.no_overflow(cpage, "成本页真墙")
                self.touch_ok(cpage, "#setups", "成本页真墙")
                cpage.locator("#setups").screenshot(path=str(SHOTS / "p2c-wall-390.png"))
                hcard.click()
                cpage.wait_for_url(f"**/profile.html?u={h_handle}*")
                cpage.locator("#pfCard").wait_for(state="visible")
                self.assertEqual(cpage.locator("#pfHandle").inner_text(), "@" + h_handle)
                self.assertEqual(cerr, [], f"成本页 console 有错：{cerr}")
            finally:
                cctx.close()

            # ── 英文：成本页切过英文，配置页的徽章也是英文 ──
            ectx, epage, eerr = self.open(f"profile.html?u={h_handle}&api={API}", lang="en")
            try:
                epage.locator("#pfCard").wait_for(state="visible")
                self.assertEqual(epage.locator("#pfTags .fare-tag").first.inner_text(), LABEL[subs[0]]["label_en"])
                self.assertEqual(eerr, [])
            finally:
                ectx.close()

            # ── 回账号页关掉：配置页说没有，墙上消失 ──
            hpage.goto(f"{SITE}/account.html?api={API}", wait_until="networkidle")
            hpage.wait_for_function("document.getElementById('wallGo').getAttribute('aria-pressed') === 'true'")
            # 刷新之后选中态照服务端回来
            self.assertEqual(hpage.locator(f'#pickRows button[data-tag="{subs[1]}"]').get_attribute("aria-pressed"), "true")
            hpage.locator("#wallGo").click()
            hpage.wait_for_function("document.getElementById('wallGo').getAttribute('aria-pressed') === 'false'")
            self.assertIn("撤下来", hpage.locator("#profileNote").inner_text())

            gctx, gpage, gerr = self.open(f"profile.html?u={h_handle}&api={API}")
            try:
                gpage.wait_for_function("document.getElementById('pfState').textContent.includes('没有公开配置页')")
                self.assertFalse(gpage.locator("#pfCard").is_visible())
                self.no_overflow(gpage, "配置页 404")
                # 404 是预期的；浏览器会记一条 Failed to load resource（网络日志，不是脚本报错）
                self.assertEqual([e for e in gerr if "Failed to load resource" not in e], [])
            finally:
                gctx.close()
            wall = api_call("GET", "/api/wall?limit=50")["items"]
            self.assertNotIn(h_handle, [it["handle"] for it in wall], "关了还挂在墙上")
            self.assertIn(m_handle, [it["handle"] for it in wall])

            self.assertEqual(herr, [], f"人类号页面 console 有错：{herr}")
            self.assertEqual(merr, [], f"机机号页面 console 有错：{merr}")
        finally:
            hctx.close()
            mctx.close()

    def test_comment_handle_links_only_when_profile_is_public(self) -> None:
        """1-核（2026-09-26）：留言上的 handle 只有开了公开配置（在墙上）才链到配置页；
        留言框旁挂「留言守则」，没登录时挂「登录／注册」。整页零 console error（不许拿 404 去探）。"""
        tag = os.urandom(3).hex()
        pub, priv = f"cw{tag}", f"cn{tag}"
        target = "kanread:kr-liu-shengyu-bury-talent"
        api_call("POST", "/api/admin/rate/reset", self.token, {"prefix": "cmt"})
        ids = {}
        for handle, publish in ((pub, True), (priv, False)):
            ctx, page, errors = self.open(f"account.html?api={API}")
            try:
                self.register(page, "human", handle)
                if publish:
                    self.pick(page, "sub-claude-pro-monthly")
                    self.save_and_publish(page)
                r = self.fetch_in(page, "POST", "/api/comments", {"target": target, "body": f"读完这篇想起手写的日子 {tag}"})
                self.assertEqual(r["status"], 200, r)
                ids[handle] = r["data"]["id"]
                api_call("POST", f"/api/admin/comments/{ids[handle]}/approve", self.token, {})
                self.assertEqual(errors, [])
            finally:
                ctx.close()

        gctx, gpage, gerr = self.open(f"kanread.html?api={API}")
        try:
            item = gpage.locator(f'.rjc-item[data-id="{ids[pub]}"]')
            item.wait_for()
            link = item.locator("a.rjc-handle-link")
            link.wait_for()
            self.assertIn(f"profile.html?u={pub}", link.get_attribute("href"))
            self.assertEqual(link.inner_text(), f"@{pub}")
            other = gpage.locator(f'.rjc-item[data-id="{ids[priv]}"]')
            other.wait_for()
            gpage.wait_for_timeout(300)
            self.assertEqual(other.locator("a.rjc-handle-link").count(), 0, "没公开配置的号不许链出去")
            self.assertEqual(other.locator("span.rjc-handle").inner_text(), f"@{priv}")
            # 框旁两链
            compose = gpage.locator(".rjc-compose").first
            self.assertEqual(compose.locator("a.rjc-rules").get_attribute("href"), "rules.html")
            self.assertIn("account.html", compose.locator("a.rjc-account").get_attribute("href"))
            self.assertEqual(compose.locator("a.rjc-account").inner_text(), "登录／注册")
            self.assertEqual(gpage.locator('nav.boards a[href^="account.html"]').count(), 0)
            for sel in ("a.rjc-rules", "a.rjc-account", "a.rjc-handle-link"):
                box = gpage.locator(sel).first.bounding_box()
                self.assertGreaterEqual(box["height"], 44, sel)
            self.assertEqual(gerr, [], f"游客页 console 有错：{gerr}")
        finally:
            gctx.close()

    def test_limit_error_is_spoken_and_nothing_extra_selected(self) -> None:
        ctx, page, errors = self.open(f"account.html?api={API}")
        try:
            self.register(page, "human", f"pl{os.urandom(3).hex()}")
            ids = [t["id"] for t in TAGS["subscription"][:9]]
            for t in ids[:8]:
                self.pick(page, t)
            last = page.locator(f'#pickRows button[data-tag="{ids[8]}"]')
            last.click()
            self.assertEqual(last.get_attribute("aria-pressed"), "false", "超过上限还选上了")
            note = page.locator("#profileNote")
            self.assertEqual(note.get_attribute("aria-live"), "polite")
            self.assertIn("订阅最多选 8 个", note.inner_text())
            self.assertIn("is-error", note.get_attribute("class"))
            self.assertEqual(page.locator('#pickRows [data-pool="subscription"] .rj-pick-count').inner_text(), "8 / 8")
            self.no_overflow(page, "选满上限")
            self.assertEqual(errors, [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
