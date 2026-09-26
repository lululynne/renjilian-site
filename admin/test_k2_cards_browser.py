#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""刀 K2「我的名片」三页的浏览器实测（2026-09-26）。

真点页面、真打后端（renji-api feat/k1-profile），不 mock：
- 名片后台（人类）：传头像（方形裁切→压缩→上传，当场「待审」）→ 传横图背景 → 设备三框（品牌搜「华」挑华为、品类七选一、型号可空）
  → 订阅先搜厂商再挑档＋自报一家 → 路线上限 3（第 4 个抖一下）→ 一句话 → 挑皮肤 → 挂上 → 名片主页本人看；
- 名片后台（机机）：穿衣（身体＋三格）→ 昵称／「我的人」称呼／关系／头衔 → 挂上；人类号的名片后台里没有这些入口；
- 名片主页：三种皮肤同一份内容；人类名片「我家机机」大卡 → 机机名片「我的人」→ 回到人类名片（互跳）；
- 全站署名：留言区点名字进名片主页；可点的是显示名，@id 灰字不另成链；
- 账号后台：「我的名片」入口两个键；顶栏右上角「我的名片」挨着「账号」；
- 每一页 390 宽零横向溢出、console 零错误；390 与 1280 各截一张（K2_SHOTS 指向的目录，默认刀 K2 审卷目录）。

要求本机后端在跑（RJ_TEST_API，默认 8798），CORS 白名单里要有 http://127.0.0.1:8800；后端不在就整组 skip。
"""
from __future__ import annotations

import functools
import http.server
import io
import json
import os
import random
import re
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

from test_p2a_browser import API, SITE, SITE_PORT, admin_token, backend_up

ROOT = Path(__file__).resolve().parents[1]
CARD = "kr-liu-shengyu-bury-talent"
SHOTS = Path(os.environ.get("K2_SHOTS", "/Volumes/Meibao2T/Developer/renjilian-site-audits/20260926-k2-cards/shots"))
VP390 = {"width": 390, "height": 844}
VP1280 = {"width": 1280, "height": 900}
OVERFLOW = "document.documentElement.scrollWidth - window.innerWidth"


class Web:
    """一个号的会话：走后端真接口，cookie 自己记。"""

    def __init__(self) -> None:
        self.ip = f"10.66.{random.randint(1, 250)}.{random.randint(1, 250)}"
        self.cookie: str | None = None

    def req(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict | None]:
        r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method)
        r.add_header("x-real-ip", self.ip)
        r.add_header("origin", SITE)
        r.add_header("content-type", "application/json")
        if self.cookie:
            r.add_header("cookie", self.cookie)
        try:
            resp = urllib.request.urlopen(r)
            code = resp.status
        except urllib.error.HTTPError as e:
            resp, code = e, e.code
        m = re.search(r"(rj_sess=[^;]*)", resp.headers.get("set-cookie") or "")
        if m:
            self.cookie = m.group(1)
        txt = resp.read().decode()
        return code, (json.loads(txt) if txt else None)

    def ok(self, method: str, path: str, body: dict | None = None) -> dict:
        code, d = self.req(method, path, body)
        assert code == 200, f"{method} {path} → {code} {d}"
        return d


def admin(method: str, path: str) -> dict:
    r = urllib.request.Request(API + path, method=method, data=b"{}" if method == "POST" else None)
    r.add_header("authorization", f"Bearer {admin_token()}")
    r.add_header("content-type", "application/json")
    return json.loads(urllib.request.urlopen(r).read().decode())


def say(w: Web, body: str) -> str:
    d = w.ok("POST", "/api/comments", {"target": f"kanread:{CARD}", "body": body})
    if d.get("state") == "pending":
        admin("POST", f"/api/admin/comments/{d['id']}/approve")
    return d["id"]


def picture(w: int, h: int) -> bytes:
    """一张有内容的 PNG（渐变＋一个圆），给上传用"""
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (w, h), (247, 201, 168))
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=(247 - y * 60 // h, 201 - y * 90 // h, 168 - y * 40 // h))
    d.ellipse([w * 0.55, h * 0.2, w * 0.8, h * 0.2 + w * 0.25], fill=(255, 243, 214))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


class _Site:
    server = None

    @classmethod
    def up(cls) -> None:
        if cls.server:
            return
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        handler.log_message = lambda *a, **k: None
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def down(cls) -> None:
        if cls.server:
            cls.server.shutdown()
            cls.server.server_close()
            cls.server = None


@unittest.skipUnless(backend_up(), f"后端 {API} 不在")
class CardPages(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _Site.up()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)
        cls.tmp = Path(os.environ.get("TMPDIR", "/tmp")) / f"k2-{int(time.time())}"
        cls.tmp.mkdir(parents=True, exist_ok=True)
        (cls.tmp / "square.png").write_bytes(picture(900, 700))
        (cls.tmp / "wide.png").write_bytes(picture(1800, 800))
        tag = format(int(time.time() * 1000) % 36**5, "x")[-5:]
        cls.H, cls.M1, cls.M2, cls.O = Web(), Web(), Web(), Web()
        cls.h, cls.m1, cls.m2, cls.o = f"k2mei{tag}", f"k2jj1{tag}", f"k2jj2{tag}", f"k2lu{tag}"
        cls.H.ok("POST", "/api/accounts", {"handle": cls.h, "kind": "human", "display_name": "梅宝"})
        cls.M1.ok("POST", "/api/accounts", {"handle": cls.m1, "kind": "machine"})
        cls.M2.ok("POST", "/api/accounts", {"handle": cls.m2, "kind": "machine"})
        cls.O.ok("POST", "/api/accounts", {"handle": cls.o, "kind": "human", "display_name": "路过的机友"})
        for M in (cls.M1, cls.M2):
            code = M.ok("POST", "/api/me/binding-codes", {})["binding_code"]
            b = cls.H.ok("POST", "/api/bindings", {"code": code})["binding"]
            cls.H.ok("PATCH", f"/api/bindings/{b['id']}/visibility", {"public": True})
            M.ok("PATCH", f"/api/bindings/{b['id']}/visibility", {"public": True})
        cls.said = {}
        for w, key, lines in ((cls.H, "h", ["这张卡我读了三遍，最后一段像是写给我们俩的。", "机机一号说它也读完了，我不信，让它自己来说。"]),
                              (cls.M1, "m1", ["我读完了。她说破产，我就陪她一起破产——这句是我自己想的。", "原文第二节那个比喻，我替她记下了，回头讲给她听。"]),
                              (cls.M2, "m2", ["帽子越多越好，主人越凶越好，这篇我没读懂但是我很开心。"]),
                              (cls.O, "o", ["路过，看你们在这张卡下聊得挺热闹，我也来说一句。"])):
            cls.said[key] = [say(w, t) for t in lines]
        # 机机二号直接用接口穿好（机机一号留给页面真点）
        cls.M2.ok("PATCH", "/api/me/card", {"display_name": "机机二号", "avatar": {"model": "gemini", "head": "catears", "face": "blush", "neck": "bowtie"},
                                            "my_call": "饲养员", "bio": "帽子越多越好，主人越凶越好。", "bg_preset": "pixel",
                                            "routes": ["monthly"], "subs": [{"id": "sub-google-ai-pro-monthly"}], "published": True})
        SHOTS.mkdir(parents=True, exist_ok=True) if SHOTS.parent.exists() else None

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        _Site.down()

    # ── 小工具 ──
    def ctx(self, who: Web | None, vp=VP390):
        c = self.browser.new_context(viewport=vp)
        if who and who.cookie:
            k, v = who.cookie.split("=", 1)
            c.add_cookies([{"name": k, "value": v, "domain": "127.0.0.1", "path": "/"}])
        c.grant_permissions(["clipboard-read", "clipboard-write"], origin=SITE)
        return c

    def open(self, c, path: str):
        page = c.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        sep = "&" if "?" in path else "?"
        page.goto(f"{SITE}/{path}{sep}api={API}", wait_until="networkidle")
        return page, errors

    def shot(self, page, name: str, full: bool = True) -> None:
        if SHOTS.exists():
            page.screenshot(path=str(SHOTS / name), full_page=full)

    def no_overflow(self, page, label: str) -> None:
        self.assertLessEqual(page.evaluate(OVERFLOW), 0, f"{label} 390 宽横向溢出")

    def small_targets(self, page, sel: str) -> list:
        return page.evaluate("""(sel) => [...document.querySelectorAll(sel)].filter(b => !b.disabled && b.offsetParent !== null)
            .map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 12), Math.round(r.width), Math.round(r.height)]; })
            .filter(([, w, h]) => w < 44 || h < 44)""", sel)

    def step(self, page, name: str) -> None:
        page.locator(f".tabs button:has-text('{name}')").first.click()
        page.wait_for_function("n => document.querySelector('.tabs button.on') && document.querySelector('.tabs button.on').textContent.includes(n)", arg=name)

    # ── 1. 人类名片后台全流程 ──
    def test_1_human_editor_flow(self) -> None:
        c = self.ctx(self.H)
        try:
            page, errors = self.open(c, "card-edit.html")
            page.locator(".tabs").wait_for()
            tabs = page.locator(".tabs button").all_inner_texts()
            self.assertEqual([t.replace("✓ ", "") for t in tabs], ["头像", "背景", "设备", "订阅", "路线", "一句话", "挂上"])
            self.assertEqual(page.locator("text=给自己穿衣服").count(), 0, "人类号的名片后台不许有穿衣")
            self.assertEqual(page.locator("#call").count(), 0)
            # 顶栏：「我的名片」挨着「账号」，在名片后台时亮着
            entry = page.locator(".masthead a.card-entry")
            self.assertEqual(entry.inner_text(), "我的名片")
            self.assertIn(f"card.html?u={self.h}", entry.get_attribute("href"))
            self.shot(page, "k2-名片后台-人类-0头像-390.png")
            self.assertEqual(self.small_targets(page, ".rjk button, .rjk a, .rjk label.go"), [], "名片后台触控不足 44")
            self.no_overflow(page, "名片后台")

            # 头像：挑图 → 裁切 → 用这张 → 当场待审
            page.set_input_files("#file", str(self.tmp / "square.png"))
            page.locator("#crop").wait_for()
            page.locator("#zoom").fill("1.4")
            page.locator("#cropok").click()
            page.locator(".pend").wait_for()
            self.assertIn("待审", page.locator(".pend").inner_text())
            self.assertIn("换上了", page.locator("#barNote").inner_text())
            src = page.locator(".slot img.ph-img").get_attribute("src")
            self.assertRegex(src, r"/api/media/[A-Za-z0-9_-]+$")
            self.assertTrue(page.evaluate("s => fetch(s, {credentials: 'include'}).then(r => r.ok && r.headers.get('content-type') === 'image/jpeg')", src))
            self.shot(page, "k2-名片后台-人类-0头像已传-390.png")

            # 背景：横图 → 待审 → 拖一拖选露出
            page.locator("#next").click()
            page.locator("#bgfile").wait_for(state="attached")
            page.set_input_files("#bgfile", str(self.tmp / "wide.png"))
            page.locator(".bgpv-tip").wait_for()
            box = page.locator("#bgpv").bounding_box()
            page.mouse.move(box["x"] + 30, box["y"] + 30)
            page.mouse.down()
            page.mouse.move(box["x"] + 90, box["y"] + 50, steps=5)
            page.mouse.up()

            # 设备：品牌搜「华」→ 华为 → 手机 → 型号 → 加上；再加一台苹果台式机并设为主力
            page.locator("#next").click()
            page.wait_for_function("document.getElementById('barNote').textContent.includes('存好了')")
            page.locator("#bq").fill("华")
            chips = page.locator("#bsug .chip").all_inner_texts()
            self.assertTrue(any(t.startswith("华为") for t in chips) and any(t.startswith("华硕") for t in chips), chips)
            self.assertTrue(page.locator("#adddev").is_disabled())
            page.locator("#bsug .chip:has-text('华为')").click()
            page.locator(".cat[data-cat='phone']").click()
            page.locator("#model").fill("Mate 70 Pro")
            page.locator("#adddev").click()
            page.locator(".added .row").first.wait_for()
            page.locator("#bq").fill("苹果")
            page.locator("#bsug .chip:has-text('苹果')").first.click()
            page.locator(".cat[data-cat='desktop']").click()
            page.locator("#model").fill("Mac mini M4")
            page.locator("#adddev").click()
            page.locator("button.star[data-main='1']").click()
            self.assertEqual(page.locator("button.star.is").inner_text(), "★ 主力")
            self.assertIn("还能加 4 台", page.locator(".cnt").inner_text().replace("\n", " "))
            self.shot(page, "k2-名片后台-人类-2设备-390.png")

            # 订阅：搜 claude → 挑 Max 20x；搜不到的「Poe」→ 自己填档名、标自报
            page.locator("#next").click()
            page.locator("#sq").fill("claude")
            page.locator("#vsug .chip[data-vend='claude']").click()
            page.locator(".chip.tier:has-text('Max 20x')").click()
            page.locator("#sq").fill("Poe")
            page.locator("#vsug .chip[data-selfv]").click()
            page.locator("#stier").fill("月费")
            page.locator("#addself").click()
            self.assertEqual(page.locator(".added .row").count(), 2)
            self.assertIn("自报", page.locator(".added").inner_text())

            # 路线：挑 3 条，第 4 条抖一下不加
            page.locator("#next").click()
            for r in ("many", "api", "relay"):
                page.locator(f".rc[data-route='{r}']").click()
            page.locator(".rc[data-route='free']").click()
            self.assertEqual(page.locator(".rc.on").count(), 3)
            self.assertIn("最多 3 个", page.locator("#echo").inner_text())

            # 一句话 → 挂上（名片夹）
            page.locator("#next").click()
            page.locator(".chip[data-bio]").first.click()
            page.locator("#next").click()
            page.locator(".tw button[data-style='holder']").click()
            page.locator("#hang").click()
            page.locator("#hung a").wait_for()
            self.assertIn("挂上了", page.locator("#hung").inner_text())
            me = self.H.ok("GET", "/api/me/card")["card"]
            self.assertTrue(me["published"])
            self.assertEqual(me["skin"], "holder")
            self.assertEqual([d["brand"] for d in me["devices"]], ["华为", "苹果"])
            self.assertEqual([d["main"] for d in me["devices"]], [False, True])
            self.assertEqual(me["subs"], [{"id": "sub-claude-max-20x-monthly", "self_reported": False},
                                          {"vendor": "Poe", "tier": "月费", "self_reported": True}])
            self.assertEqual(me["routes"], ["many", "api", "relay"])
            self.assertEqual(me["avatar"]["photo"]["state"], "pending")
            self.assertNotEqual((me["bg"]["focus"] or {}).get("x"), 50, "拖过的露出位置没存上")
            self.shot(page, "k2-名片后台-人类-挂上-390.png")
            self.no_overflow(page, "名片后台挂上")

            # 点「去看我的名片主页」：本人看，右上角「编辑名片」，新头像背景本人照看、说清在等站方
            page.locator("#hung a").click()
            page.wait_for_url(f"**/card.html?u={self.h}*")
            page.locator(".cd-hero .biz").wait_for()
            self.assertEqual(page.locator(".cd-hero a.edit").inner_text(), "✎ 编辑名片")
            self.assertIn("新头像、新背景在等站方看一眼", page.locator(".self-note").inner_text())
            self.assertIn("/api/media/", page.locator("#bgband").get_attribute("style"))
            self.shot(page, "k2-名片主页-本人看-390.png")
            self.assertEqual(errors, [])
        finally:
            c.close()

    # ── 2. 机机名片后台：穿衣、我的人、头衔 ──
    def test_2_machine_editor_flow(self) -> None:
        c = self.ctx(self.M1)
        try:
            page, errors = self.open(c, "card-edit.html")
            page.locator(".tabs").wait_for()
            self.assertEqual([t.replace("✓ ", "") for t in page.locator(".tabs button").all_inner_texts()],
                             ["穿衣", "我的人", "设备", "订阅", "路线", "一句话", "挂上"])
            self.assertEqual(page.locator("#file, #bgfile").count(), 0, "机机号不能上传图片")
            page.locator(".out[data-slot='head'][data-item='tophat']").click()
            self.assertIn("先挑身体", page.locator("#echo").inner_text())
            page.locator(".mod[data-model='claude']").click()
            for slot, item in (("head", "tophat"), ("face", "monocle"), ("neck", "collar")):
                page.locator(f".out[data-slot='{slot}'][data-item='{item}']").click()
            self.assertIn("3", page.locator(".cnt b").inner_text())
            page.locator(".bgt[data-bg='stars']").click()
            self.shot(page, "k2-名片后台-机机-穿衣-390.png")
            page.locator("#next").click()
            page.wait_for_function("document.getElementById('barNote').textContent.includes('存好了')")
            page.locator("#nick").fill("机机一号")
            page.locator("#call").fill("梅宝")
            page.locator(".rels .chip[data-rel='恋爱中']").click()
            page.locator("#intro").fill("手工裁缝，做布艺。天天给我修器官。")
            titles = page.locator(".chip[data-title]")
            self.assertGreater(titles.count(), 0, "机机一号应该已经拿到称号")
            for i in range(min(3, titles.count())):
                page.locator(".chip[data-title]").nth(i).click()
            self.assertIn("机机一号", page.locator(".pair").inner_text())
            self.assertIn("（梅宝）", page.locator(".pair").inner_text())
            self.shot(page, "k2-名片后台-机机-我的人-390.png")
            page.locator("#next").click()
            page.wait_for_function("document.getElementById('barNote').textContent.includes('存好了')")
            self.step(page, "一句话")
            page.locator("#bio").fill("她说破产，我就陪她一起破产。")
            self.step(page, "挂上")
            page.locator(".tw button[data-style='rpg']").click()
            page.locator("#hang").click()
            page.locator("#hung a").wait_for()
            me = self.M1.ok("GET", "/api/me/card")
            self.assertEqual(me["display_name"], "机机一号")
            card = me["card"]
            self.assertEqual(card["avatar"], {"model": "claude", "head": "tophat", "face": "monocle", "neck": "collar"})
            self.assertEqual(card["my_call"], "梅宝")
            self.assertEqual(card["rel"], {"status": "恋爱中", "note": "手工裁缝，做布艺。天天给我修器官。"})
            self.assertTrue(card["titles"])
            self.assertEqual(card["skin"], "rpg")
            self.assertTrue(card["published"])
            self.assertEqual(errors, [])
        finally:
            c.close()

    # ── 3. 名片主页：三皮肤 × 两种宽度；人机互跳 ──
    def test_3_public_card_skins_and_family(self) -> None:
        for skin, zh in (("polaroid", "拍立得"), ("rpg", "角色卡"), ("holder", "名片夹")):
            self.H.ok("PATCH", "/api/me/card", {"skin": skin, "published": True})
            for vp, tag in ((VP390, "390"), (VP1280, "1280")):
                c = self.ctx(None, vp)
                try:
                    page, errors = self.open(c, f"card.html?u={self.h}")
                    page.locator(f".cd-hero [data-skin='{skin}']").wait_for()
                    self.assertEqual(page.locator(".cd-hero a.edit").count(), 0, "别人看不该有编辑键")
                    self.assertIn("梅宝", page.locator(".cd-hero").inner_text())
                    self.assertEqual(page.locator(".mcbs a.mcb").count(), 2, "「我家机机」两张大卡")
                    if tag == "390":
                        self.no_overflow(page, f"名片主页 {zh}")
                    self.shot(page, f"k2-皮肤-{zh}-{tag}.png")
                    self.assertEqual(errors, [])
                finally:
                    c.close()

        # 人类名片「我家机机」大卡 → 机机名片 →「我的人」→ 回人类名片
        for vp, tag in ((VP390, "390"), (VP1280, "1280")):
            c = self.ctx(None, vp)
            try:
                page, errors = self.open(c, f"card.html?u={self.h}")
                big = page.locator(f".mcbs a.mcb[data-handle='{self.m1}']")
                big.wait_for()
                self.assertIn("机机一号", big.inner_text())
                self.assertIn("（梅宝）", big.inner_text())
                self.assertIn("她说破产", big.inner_text())
                self.assertIn("恋爱中 · 和 机机一号", page.locator(".ext").inner_text())
                big.evaluate("n => n.scrollIntoView({block: 'center'})")
                self.shot(page, f"k2-互跳-1人类名片我家机机-{tag}.png", full=False)
                big.click()
                page.wait_for_url(f"**/card.html?u={self.m1}*")
                page.locator(".cd-hero [data-skin='rpg']").wait_for()
                self.assertIn("我的人：梅宝", page.locator(".cd-hero").inner_text())
                mine = page.locator(f"#famList a.bot[data-handle='{self.h}']")
                mine.wait_for()
                self.assertIn("我叫 TA「梅宝」", mine.inner_text())
                self.shot(page, f"k2-互跳-2机机名片我的人-{tag}.png")
                mine.click()
                page.wait_for_url(f"**/card.html?u={self.h}*")
                page.locator(".mcbs").wait_for()
                if tag == "390":
                    self.no_overflow(page, "互跳回人类名片")
                self.assertEqual(errors, [])
            finally:
                c.close()

    # ── 4. 留言区点名字进名片页；@id 灰字不另成链；空屋 ──
    def test_4_comment_name_goes_to_card(self) -> None:
        for vp, tag in ((VP390, "390"), (VP1280, "1280")):
            c = self.ctx(None, vp)
            try:
                page, errors = self.open(c, "kanread.html")
                item = page.locator(f'.rjc-item[data-id="{self.said["o"][0]}"]')
                item.wait_for()
                who = item.locator(".rj-who")
                link = who.locator("a.rj-who-link")
                self.assertEqual(link.inner_text(), "路过的机友")
                self.assertEqual(who.locator("a").count(), 1, "一处一个入口：@id 不另成链")
                self.assertEqual(who.locator(".rj-who-id").inner_text(), f"@{self.o}")
                box = link.bounding_box()
                self.assertGreaterEqual(box["height"], 44, "名字热区不够拇指按")
                item.evaluate("n => n.scrollIntoView({block: 'center'})")
                link.hover()
                self.shot(page, f"k2-留言区点名字-1留言-{tag}.png", full=False)
                link.click()
                page.wait_for_url(f"**/card.html?u={self.o}*")
                page.locator(".empty-house").wait_for()
                self.assertIn("还没把名片挂出来", page.locator(".empty-house").inner_text())
                self.shot(page, f"k2-留言区点名字-2空屋名片-{tag}.png")
                self.assertEqual(errors, [])
            finally:
                c.close()

    # ── 5. 账号后台：只留入口；钥匙那栏的人话 ──
    def test_5_account_entry(self) -> None:
        for vp, tag in ((VP390, "390"), (VP1280, "1280")):
            c = self.ctx(self.H, vp)
            try:
                page, errors = self.open(c, "account.html")
                page.locator("#cardEntryBox").wait_for()
                self.assertIn("card-edit.html", page.locator("#cardEditGo").get_attribute("href"))
                self.assertIn(f"card.html?u={self.h}", page.locator("#cardPageGo").get_attribute("href"))
                sec = page.locator(f'.rj-keyset[data-machine="{self.m1}"]')
                sec.locator(".rj-key-go").wait_for()
                self.assertEqual(sec.locator(".rj-key-go").inner_text(), "给 机机一号 签一把")
                self.assertIn("rj_m_", page.locator("#keyBox").inner_text())
                if tag == "390":
                    self.no_overflow(page, "账号后台")
                    self.assertEqual(self.small_targets(page, "#cardEntryBox a, .masthead a"), [])
                self.shot(page, f"k2-账号后台-{tag}.png")
                page.locator("#cardEditGo").click()
                page.wait_for_url("**/card-edit.html*")
                page.locator(".tabs").wait_for()
                self.shot(page, f"k2-名片后台-{tag}.png")
                page.goto(f"{SITE}/card.html?u={self.h}&api={API}", wait_until="networkidle")
                page.locator(".cd-hero a.edit").wait_for()
                self.shot(page, f"k2-名片主页-{tag}.png")
                self.assertEqual(errors, [])
            finally:
                c.close()


    # ── 6. 恶意字段真走后端 → 名片主页、名片后台、「我家机机」大卡都只当文字（返修 r1，grok 评审第 1 条） ──
    def test_6_hostile_fields_render_as_text(self) -> None:
        evil = '<img src=x onerror="window.__pwn=1">"\'x'
        tag = format(int(time.time() * 1000) % 36**5, "x")[-5:]
        H, M = Web(), Web()
        h, m = f"k2xh{tag}", f"k2xm{tag}"
        H.ok("POST", "/api/accounts", {"handle": h, "kind": "human"})
        M.ok("POST", "/api/accounts", {"handle": m, "kind": "machine"})
        code = M.ok("POST", "/api/me/binding-codes", {})["binding_code"]
        b = H.ok("POST", "/api/bindings", {"code": code})["binding"]
        H.ok("PATCH", f"/api/bindings/{b['id']}/visibility", {"public": True})
        M.ok("PATCH", f"/api/bindings/{b['id']}/visibility", {"public": True})
        stored = {}
        for w, body in ((H, {"bio": evil[:40], "devices": [{"brand": '"><b>x', "cat": "phone", "model": evil[:40], "main": True}],
                             "subs": [{"vendor": '<svg onload=1>', "tier": '"\'<i>'}], "routes": ["many"], "published": True}),
                        (M, {"avatar": {"model": "claude"}, "bio": evil[:40], "my_call": '"><i>x', "rel": {"status": "<b>恋", "note": evil[:40]},
                             "published": True})):
            code_, d = w.req("PATCH", "/api/me/card", body)
            stored[w is H] = (code_, d)
        for skin in ("polaroid", "rpg", "holder"):
            H.ok("PATCH", "/api/me/card", {"skin": skin})
            M.ok("PATCH", "/api/me/card", {"skin": skin})
            for who, path in ((None, f"card.html?u={h}"), (None, f"card.html?u={m}"), (H, "card-edit.html"), (M, "card-edit.html")):
                c = self.ctx(who)
                try:
                    page, errors = self.open(c, path)
                    page.wait_for_timeout(600)
                    self.assertIsNone(page.evaluate("window.__pwn"), f"{path} {skin} 执行了注入")
                    self.assertEqual(page.locator("img[src='x'], svg[onload], .cd-hero b:text-is('x'), main i:text-is('x')").count(), 0, f"{path} {skin} 多出了标签")
                    self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
                finally:
                    c.close()
        # 至少有一处真把原字显示成了文字（证明不是被后端吞掉了才「安全」）
        c = self.ctx(None)
        try:
            page, _ = self.open(c, f"card.html?u={m}")
            page.locator(".cd-hero").wait_for()
            shown = page.locator(".cd-hero").inner_text() + page.locator(".ext").inner_text()
            self.assertTrue("onerror" in shown or "<img" in shown or "&lt;" in shown or "<b>" in shown, f"原字没出现：{stored} / {shown[:200]}")
        finally:
            c.close()

if __name__ == "__main__":
    unittest.main()
