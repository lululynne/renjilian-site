#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""小纸条的浏览器实测（刀 1 起；r1 去数据耦合；刀 2 三档，2026-09-30）。

本机起静态服务 + 无头 Chromium，不需要后端。测行为不测数据条数：
期望数全部从 data/ainotes.marks.json 与词条信封（真实文件或 page.route 拦截的夹具）现算。

刀 2 覆盖：关/简洁/详细三档（默认简洁、localStorage rj.ainotes.mode、旧键 rj.ainotes.on 迁移）、
简洁档弹层 brief +「看不太懂？说详细点」单条换 line、详细档页下注 details 默认收起、
无 brief 词条退回 line、radiogroup 键盘与 aria-checked、中英文名去重、恶意字符串。
"""
from __future__ import annotations

import functools
import http.server
import json
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = "kanread.html"
CARD = "kr-openai-devday-2026-plan-sharing"
SUBSET_N = 6          # 拦截场景里「公开」的条数；期望处数从这份子集算，不写死
OVERFLOW = "document.documentElement.scrollWidth - window.innerWidth"
DETAIL_BTN = "看不太懂？说详细点"


def load(name: str):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def envelope(items: list[dict]) -> dict:
    return {"schema_version": 1, "updated_at": "2026-09-30", "items": items}


def marks() -> dict:
    return load("data/ainotes.marks.json")["readings"][CARD]


def flat_marks() -> list[dict]:
    mk = marks()
    return mk["human_voice"] + mk["machine_voice"]


def expected(entries: dict) -> tuple[int, dict[str, list[dict]]]:
    """一份词条信封 + 标记文件 → (可显示标记总处数, {声部: 命中的标记列表})"""
    ids = {e["id"] for e in entries["items"]}
    mk = marks()
    per_voice = {v: [m for m in ms if m["id"] in ids] for v, ms in mk.items()}
    return sum(len(h) for h in per_voice.values()), per_voice


def marked_ids() -> set[str]:
    return {m["id"] for m in flat_marks()}


def fulfill(route, payload: dict) -> None:
    route.fulfill(status=200, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))


class AinotesBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        handler.log_message = lambda *a, **k: None
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

    def open(self, query: str = "", width: int = 1100, routes: dict[str, dict] | None = None,
             init_script: str | None = None):
        ctx = self.browser.new_context(viewport={"width": width, "height": 900})
        if init_script:
            ctx.add_init_script(init_script)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        for pattern, payload in (routes or {}).items():
            page.route(pattern, lambda route, _request, p=payload: fulfill(route, p))
        # 刀 3 起单篇在 #id 下：小纸条只在单篇里，测试一律带 hash 打开
        page.goto(f"{self.base}/{PAGE}{query}#{CARD}", wait_until="networkidle")
        page.locator(".kanread-card").first.wait_for()
        return ctx, page, errors

    def card(self, page):
        return page.locator(f"#{CARD}")

    def mode_radio(self, page, mode: str):
        return page.locator(f".an-mode[data-mode='{mode}']")

    # ── 刀 2 · 1. 首次访问默认简洁档；「说详细点」只对本次打开生效 ──
    def test_brief_mode_default_and_detail_button(self) -> None:
        full = load("data/ainotes.json")
        by_id = {e["id"]: e for e in full["items"]}
        picks = []
        for m in flat_marks():
            e = by_id.get(m["id"])
            if e and e.get("brief") and e["brief"] != e["line"] and e["id"] not in [p["id"] for p in picks]:
                picks.append(e)
            if len(picks) == 2:
                break
        if len(picks) < 2:
            self.skipTest("数据里没有两个带 brief 的已标记词条")
        e1, e2 = picks
        ctx, page, errors = self.open()
        try:
            card = self.card(page)
            # 默认简洁档
            self.assertEqual(self.mode_radio(page, "brief").get_attribute("aria-checked"), "true")
            self.assertTrue(page.locator("body.an-on").count())
            self.assertFalse(page.locator("body.an-full").count())
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), None,
                             "没点过就不该落存储")
            # 弹层先显示 brief，有「说详细点」
            card.locator(f".an-t[data-k='{e1['id']}']").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertEqual(page.locator("#anLine").inner_text(), e1["brief"])
            btn = page.locator("#anDetailBtn")
            self.assertTrue(btn.is_visible())
            self.assertEqual(btn.inner_text(), DETAIL_BTN)
            self.assertGreaterEqual(btn.bounding_box()["height"], 44)
            # 点了以后换成 line（替换不是追加），按钮消失
            btn.click()
            self.assertEqual(page.locator("#anLine").inner_text(), e1["line"])
            if e1["brief"] not in e1["line"]:
                self.assertNotIn(e1["brief"], page.locator("#anLine").inner_text())
            self.assertTrue(btn.is_hidden())
            # 全站档位没动
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), None)
            self.assertEqual(self.mode_radio(page, "brief").get_attribute("aria-checked"), "true")
            # 关掉再开另一个词：回到 brief，按钮回来
            page.keyboard.press("Escape")
            card.locator(f".an-t[data-k='{e2['id']}']").first.click()
            self.assertEqual(page.locator("#anLine").inner_text(), e2["brief"])
            self.assertTrue(page.locator("#anDetailBtn").is_visible())
            # 简洁档页下注用 brief 且默认展开；line 那份 CSS 隐藏（回归：.kr-voice span 曾砸中 span 版实现）
            wrap = card.locator(".an-foot-wrap").first
            self.assertIsNotNone(wrap.get_attribute("open"))
            foot_hv = card.locator(".kr-human .an-foot").inner_text()
            self.assertIn(e1["brief"], foot_hv)
            if e1["line"][:16] not in e1["brief"]:
                self.assertNotIn(e1["line"][:16], foot_hv, "简洁档页下注不许露出 line")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 刀 2 · 2. 详细档：弹层直接 line；页下注用 line 且默认收起；刷新后保持 ──
    def test_full_mode(self) -> None:
        full = load("data/ainotes.json")
        by_id = {e["id"]: e for e in full["items"]}
        total, per_voice = expected(full)
        if not total:
            self.skipTest("没有可显示标记")
        first_id = per_voice["human_voice"][0]["id"] if per_voice["human_voice"] else flat_marks()[0]["id"]
        e1 = by_id[first_id]
        ctx, page, errors = self.open()
        try:
            card = self.card(page)
            self.mode_radio(page, "full").click()
            self.assertTrue(page.locator("body.an-full").count())
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), "full")
            # 弹层直接是 line，没有「说详细点」
            card.locator(f".an-t[data-k='{first_id}']").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertEqual(page.locator("#anLine").inner_text(), e1["line"])
            self.assertTrue(page.locator("#anDetailWrap").is_hidden())
            page.keyboard.press("Escape")
            # 页下注：details 默认收起，摘要行写条数；li 里是 line 不是 brief
            voice_sel = {"human_voice": ".kr-human", "machine_voice": ".kr-machine"}
            for voice, hit in per_voice.items():
                wrap = card.locator(f"{voice_sel[voice]} .an-foot-wrap")
                self.assertIsNone(wrap.get_attribute("open"), f"{voice} 详细档页下注应默认收起")
                self.assertEqual(wrap.locator("summary").inner_text(),
                                 f"本段小纸条 · {len({m['id'] for m in hit})} 条")
            first_voice = "human_voice" if per_voice["human_voice"] else "machine_voice"
            lis = card.locator(f"{voice_sel[first_voice]} .an-foot li")
            self.assertIn(e1["line"], lis.first.text_content())
            if e1.get("brief") and e1["brief"] != e1["line"]:
                # 详细档显示 line、brief 那份 CSS 隐藏（DOM 里两份都在，靠 body.an-full 门控）
                self.assertEqual(
                    lis.first.evaluate("li => [getComputedStyle(li.querySelector('.an-b')).display,"
                                       " getComputedStyle(li.querySelector('.an-f')).display]"),
                    ["none", "inline"], "详细档应显示 line、隐藏 brief")
            self.assertFalse(lis.first.is_visible(), "收起的 details 内容不可见")
            # 点 summary 展开
            card.locator(f"{voice_sel[first_voice]} .an-foot-wrap summary").click()
            self.assertIsNotNone(card.locator(f"{voice_sel[first_voice]} .an-foot-wrap").get_attribute("open"))
            self.assertTrue(lis.first.is_visible())
            # 刷新后仍是详细档，页下注仍是收起
            page.reload(wait_until="networkidle")
            page.locator(".an-mode").first.wait_for()
            self.assertEqual(self.mode_radio(page, "full").get_attribute("aria-checked"), "true")
            self.assertIsNone(self.card(page).locator(".an-foot-wrap").first.get_attribute("open"))
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 刀 2 · 3. 关档：零痕迹（沿用刀 1 断言） ──
    def test_off_mode_leaves_no_trace(self) -> None:
        full = load("data/ainotes.json")
        _, per_voice = expected(full)
        first_text = per_voice["human_voice"][0]["text"] if per_voice["human_voice"] else None
        if not first_text:
            self.skipTest("人声段没有可解析标记")
        ctx, page, errors = self.open()
        try:
            card = self.card(page)
            self.mode_radio(page, "off").click()
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), "off")
            self.assertFalse(page.locator("body.an-on").count())
            for i in range(card.locator(".an-foot-wrap").count()):
                self.assertFalse(card.locator(".an-foot-wrap").nth(i).is_visible())
            style = card.locator(".an-t .an-w").first.evaluate(
                "el => { const s = getComputedStyle(el); return s.borderBottomStyle + '/' + s.borderBottomWidth; }")
            self.assertIn("none", style.split("/")[0])
            self.assertFalse(card.locator(".an-t sup").first.is_visible())
            self.assertEqual(card.locator(".an-t").first.get_attribute("tabindex"), "-1")
            card.locator(".an-t").first.click(force=True)
            self.assertTrue(page.locator("#anSheet").is_hidden())
            # 字和原来一字不差：简洁→关→简洁→关一个来回，关态文字稳定，且标记处只剩词本身
            off_text = card.locator(".kr-human").inner_text()
            self.assertEqual(card.locator(".an-t").first.inner_text(), first_text)
            self.assertNotIn(first_text + "1", off_text)
            self.mode_radio(page, "brief").click()
            self.assertIn(first_text + "1", card.locator(".kr-human").inner_text())
            self.mode_radio(page, "off").click()
            self.assertEqual(card.locator(".kr-human").inner_text(), off_text)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 刀 2 · 4. 旧键 rj.ainotes.on 迁移："0"→关、"1"→简洁；迁移后旧键删除；新键优先 ──
    def test_legacy_key_migration(self) -> None:
        for old, want in (("0", "off"), ("1", "brief")):
            with self.subTest(old=old):
                ctx, page, errors = self.open(
                    init_script=f"localStorage.setItem('rj.ainotes.on', '{old}')")
                try:
                    self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), want)
                    self.assertIsNone(page.evaluate("localStorage.getItem('rj.ainotes.on')"),
                                      "迁移后旧键必须删掉")
                    self.assertEqual(self.mode_radio(page, want).get_attribute("aria-checked"), "true")
                    self.assertEqual(bool(page.locator("body.an-on").count()), want != "off")
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()
        # 新键已存在时新键优先，不动旧键以外的逻辑
        ctx, page, errors = self.open(
            init_script="localStorage.setItem('rj.ainotes.mode','full');localStorage.setItem('rj.ainotes.on','0')")
        try:
            self.assertEqual(self.mode_radio(page, "full").get_attribute("aria-checked"), "true")
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), "full")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 刀 2 · 5. 没有 brief 的词条：两档都显示 line，不出现「说详细点」 ──
    def test_entry_without_brief_falls_back_to_line(self) -> None:
        payload = load("data/ainotes.json")
        target = next((e for e in payload["items"] if e["id"] in marked_ids() and e.get("brief")), None)
        if not target:
            self.skipTest("没有可摘除 brief 的已标记词条")
        del target["brief"]
        ctx, page, errors = self.open(routes={"**/data/ainotes.json": payload})
        try:
            card = self.card(page)
            btn = card.locator(f".an-t[data-k='{target['id']}']").first
            # 简洁档：直接 line，无「说详细点」
            btn.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertEqual(page.locator("#anLine").inner_text(), target["line"])
            self.assertTrue(page.locator("#anDetailWrap").is_hidden())
            page.keyboard.press("Escape")
            # 详细档：同样 line，无「说详细点」
            self.mode_radio(page, "full").click()
            btn.click()
            self.assertEqual(page.locator("#anLine").inner_text(), target["line"])
            self.assertTrue(page.locator("#anDetailWrap").is_hidden())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 刀 2 · 6. 三选一的语义、键盘、尺寸；360 宽不换行不溢出 ──
    def test_radiogroup_semantics_keyboard_and_360(self) -> None:
        ctx, page, errors = self.open()
        try:
            group = page.locator(".an-bar[role='radiogroup']").first
            self.assertEqual(group.get_attribute("aria-label"), "小纸条显示方式")
            radios = group.locator("[role='radio']")
            self.assertEqual(radios.all_inner_texts(), ["关", "简洁", "详细"])
            self.assertEqual([r.get_attribute("data-mode") for r in radios.all()], ["off", "brief", "full"])
            self.assertEqual(self.mode_radio(page, "brief").get_attribute("aria-checked"), "true")
            # 键盘：焦点在「简洁」上按右键 → 详细选中并接过焦点；左键回简洁，再左键到关
            self.mode_radio(page, "brief").focus()
            page.keyboard.press("ArrowRight")
            self.assertEqual(self.mode_radio(page, "full").get_attribute("aria-checked"), "true")
            self.assertTrue(page.evaluate("document.activeElement === document.querySelector(\".an-mode[data-mode='full']\")"))
            page.keyboard.press("ArrowLeft")
            self.assertEqual(self.mode_radio(page, "brief").get_attribute("aria-checked"), "true")
            page.keyboard.press("ArrowLeft")
            self.assertEqual(self.mode_radio(page, "off").get_attribute("aria-checked"), "true")
            self.assertTrue(page.locator("#anSheet").is_hidden())
            page.keyboard.press("ArrowRight")
            page.keyboard.press("ArrowRight")   # 回到详细，给后面的检查留个非关档
            # 每个选项 ≥44×44
            for r in radios.all():
                box = r.bounding_box()
                self.assertGreaterEqual(box["width"], 44)
                self.assertGreaterEqual(box["height"], 44)
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 360 宽：不溢出、三个选项同一行不换行
        ctx, page, errors = self.open(width=360)
        try:
            self.assertLessEqual(page.evaluate(OVERFLOW), 0, "360 宽横向溢出")
            radios = page.locator(f"#{CARD} .an-mode")
            boxes = [radios.nth(i).bounding_box() for i in range(radios.count())]
            self.assertEqual(len(boxes), 3)
            self.assertEqual(len({round(b["y"]) for b in boxes}), 1, "360 宽下三个选项不许换行")
            for b in boxes:
                self.assertGreaterEqual(b["width"], 44)
                self.assertGreaterEqual(b["height"], 44)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 刀 2 · 7. 中英文名去重（刀 1 r1 那条预期失败转正当） ──
    def test_en_dedup_in_footnote_and_sheet(self) -> None:
        payload = load("data/ainotes.json")
        picks = [e for e in payload["items"] if e["id"] in marked_ids()][:3]
        if len(picks) < 3:
            self.skipTest("已标记词条不足三条，造不了三种情形")
        contained, same, normal = picks
        contained["zh"], contained["en"] = "点数（credits）", "Credits"   # 中文名已含英文名（大小写不同）
        same["zh"] = same["en"] = "dots"                                  # 完全相同
        normal["zh"], normal["en"] = "甲词", "Beta"                       # 正常：照常括英文
        ctx, page, errors = self.open(routes={"**/data/ainotes.json": payload})
        try:
            card = self.card(page)
            foot_all = "\n".join(card.locator(".an-foot").all_inner_texts())
            self.assertIn("点数（credits）：", foot_all)
            self.assertNotIn("点数（credits）（Credits）", foot_all, "中文名已含英文名时不许再括一遍")
            self.assertIn("dots：", foot_all)
            self.assertNotIn("dots（dots）", foot_all, "中英文完全相同时只写一次")
            self.assertIn("甲词（Beta）：", foot_all)
            # 弹层：标题与英文名完全相同时英文名那行隐藏；不同则显示
            card.locator(f".an-t[data-k='{same['id']}']").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertTrue(page.locator("#anEn").is_hidden())
            page.keyboard.press("Escape")
            card.locator(f".an-t[data-k='{normal['id']}']").first.click()
            self.assertTrue(page.locator("#anEn").is_visible())
            self.assertEqual(page.locator("#anEn").inner_text(), "Beta")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 刀 2 · 8. 恶意字符串：brief 和 line 里都放，仍只显示成字面文字 ──
    def test_hostile_entry_strings_render_as_text(self) -> None:
        payload = load("data/ainotes.json")
        target = next((e for e in payload["items"] if e["id"] in marked_ids()), None)
        if not target:
            self.skipTest("没有已公开且被标记的词条可注入")
        target["zh"] = '<img src=x onerror="window.__pwn=1">'
        target["brief"] = '<img src=y onerror="window.__pwn3=1">'
        target["line"] = '"><svg onload="window.__pwn2=1">'
        target["for_us"] = "<b>bold</b>"
        target["more"] = "<i>more</i>"
        target["sources"] = [{"name": "<u>坏来源</u>", "url": "javascript:alert(1)"},
                             {"name": "正常来源", "url": "https://example.com/x"}]
        ctx, page, errors = self.open(routes={"**/data/ainotes.json": payload})
        try:
            card = self.card(page)
            card.locator(f".an-t[data-k='{target['id']}']").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            # 简洁档先显示恶意 brief：字面文字
            self.assertIn("<img src=y", page.locator("#anLine").inner_text())
            # 「说详细点」换成恶意 line：字面文字
            page.locator("#anDetailBtn").click()
            shown = page.locator("#anSheet").inner_text()
            self.assertIn("<img src=x", shown, "恶意字符串应原样显示成文字")
            self.assertIn("<svg", shown)
            self.assertIn("<b>bold</b>", shown)
            self.assertIsNone(page.evaluate("window.__pwn"))
            self.assertIsNone(page.evaluate("window.__pwn2"))
            self.assertIsNone(page.evaluate("window.__pwn3"))
            self.assertEqual(page.locator("#anSheet img, #anSheet svg, #anSheet b, #anSheet i, #anSheet u").count(), 0,
                             "弹层里多出了标签")
            # 页下注里两份文字（brief/line）同样只是文字
            foot_all = "\n".join(card.locator(".an-foot").all_text_contents())
            self.assertIn("<img src=y", foot_all)
            self.assertIn("<svg", foot_all)
            self.assertEqual(card.locator(".an-foot img, .an-foot svg").count(), 0)
            # 非 https 来源只显示名字不做链接
            self.assertEqual(page.locator("#anSrcs a").count(), 1)
            self.assertEqual(page.locator("#anSrcs a").first.get_attribute("href"), "https://example.com/x")
            self.assertIn("<u>坏来源</u>", page.locator("#anSrcs").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()

    # ── 沿用 r1：线上模式（拦截成子集）只有已核对词条带标记，被排除的词逐个零痕迹 ──
    def test_live_only_listed_entries_are_marked(self) -> None:
        full = load("data/ainotes.json")
        subset = envelope(full["items"][:SUBSET_N])
        total_all, _ = expected(full)
        total_sub, per_voice = expected(subset)
        if not (0 < total_sub < total_all):
            self.skipTest("子集没有造成排除，场景不成立")
        ctx, page, errors = self.open(routes={"**/data/ainotes.json": subset})
        try:
            card = self.card(page)
            ts = card.locator(".an-t")
            self.assertEqual(ts.count(), total_sub, "标记处数应等于子集可解析的处数")
            ks = {ts.nth(i).get_attribute("data-k") for i in range(ts.count())}
            self.assertEqual(ks, {e["id"] for e in subset["items"]} & marked_ids())
            voice_sel = {"human_voice": ".kr-human", "machine_voice": ".kr-machine"}
            for voice, hit in per_voice.items():
                lis = card.locator(f"{voice_sel[voice]} .an-foot li")
                self.assertEqual(lis.count(), len({m["id"] for m in hit}), f"{voice} 页下注条数不对")
            excluded = [e for e in full["items"][SUBSET_N:] if e["id"] in marked_ids()]
            self.assertTrue(excluded, "子集没排除掉任何被标记的词，场景不成立")
            foot_zhs = card.locator(".an-foot li b").all_inner_texts()
            for e in excluded:
                with self.subTest(excluded=e["id"]):
                    self.assertEqual(card.locator(f".an-t[data-k='{e['id']}']").count(), 0)
                    self.assertNotIn(e["zh"], foot_zhs)
            # 三档开关一张（就 DevDay 一张卡有可显示标记），默认简洁
            self.assertEqual(card.locator(".an-bar[role='radiogroup']").count(), 1)
            self.assertEqual(self.mode_radio(page, "brief").get_attribute("aria-checked"), "true")
            for voice, sel in voice_sel.items():
                if per_voice[voice]:
                    self.assertEqual(card.locator(f"{sel} .an-t sup").first.inner_text(), "1")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 沿用 r1：预览模式（拦截公开子集 + 拦截草稿夹具）全部可点、草稿带【草稿】 ──
    def test_preview_merges_routed_drafts(self) -> None:
        full = load("data/ainotes.json")
        subset_items = full["items"][:SUBSET_N]
        draft_items = full["items"][SUBSET_N:]
        subset_ids = {e["id"] for e in subset_items}
        draft_ids = {e["id"] for e in draft_items}
        by_id = {e["id"]: e for e in full["items"]}
        flat = flat_marks()
        draft_only = next((m["id"] for m in flat if m["id"] in draft_ids and m["id"] not in subset_ids), None)
        public_marked = next((m["id"] for m in flat if m["id"] in subset_ids), None)
        if not (draft_only and public_marked):
            self.skipTest("数据现状造不出「草稿独有词 + 公开词」场景")
        routes = {"**/data/ainotes.json": envelope(subset_items),
                  "**/data/ainotes.drafts.json": envelope(draft_items)}
        ctx, page, errors = self.open("?preview=1", routes=routes)
        try:
            card = self.card(page)
            expected_total = sum(1 for m in flat if m["id"] in subset_ids | draft_ids)
            ts = card.locator(".an-t")
            self.assertEqual(ts.count(), expected_total, "并入草稿夹具后，可解析的标记应全部可点")
            # 草稿词：弹层带【草稿】，简洁档先给 brief
            btn = card.locator(f".an-t[data-k='{draft_only}']").first
            btn.click()
            sheet = page.locator("#anSheet")
            self.assertTrue(sheet.is_visible())
            self.assertEqual(sheet.get_attribute("role"), "dialog")
            self.assertEqual(sheet.get_attribute("aria-modal"), "true")
            zh = page.locator("#anZh").inner_text()
            self.assertTrue(zh.startswith("【草稿】"), "草稿词条要标【草稿】")
            self.assertIn(by_id[draft_only]["zh"], zh)
            draft_entry = by_id[draft_only]
            self.assertEqual(page.locator("#anLine").inner_text(),
                             draft_entry.get("brief") or draft_entry["line"])
            # 焦点进弹层；关闭键 ≥44×44
            self.assertTrue(page.evaluate("document.getElementById('anSheet').contains(document.activeElement)"))
            box = page.locator("#anX").bounding_box()
            self.assertGreaterEqual(box["width"], 44)
            self.assertGreaterEqual(box["height"], 44)
            # Esc 关闭，焦点回到刚才点的那个词
            page.keyboard.press("Escape")
            self.assertTrue(sheet.is_hidden())
            self.assertTrue(page.evaluate("el => document.activeElement === el", btn.element_handle()))
            # 点遮罩也能关
            btn.click()
            self.assertTrue(sheet.is_visible())
            page.locator("#anBack").click(position={"x": 20, "y": 20}, force=True)
            self.assertTrue(sheet.is_hidden())
            # 公开词：不带【草稿】
            card.locator(f".an-t[data-k='{public_marked}']").first.click()
            self.assertFalse(page.locator("#anZh").inner_text().startswith("【草稿】"))
            # 来源链接全部 https + 新标签 + noopener
            links = page.locator("#anSrcs a")
            self.assertGreaterEqual(links.count(), 1)
            for i in range(links.count()):
                self.assertTrue(links.nth(i).get_attribute("href").startswith("https://"))
                self.assertEqual(links.nth(i).get_attribute("target"), "_blank")
                self.assertEqual(links.nth(i).get_attribute("rel"), "noopener noreferrer")
            self.assertIn("最后核对 ", page.locator("#anVerified").inner_text())
            # 有 more 的词条：「展开来龙去脉」在弹层内展开，不跳页
            more_entry = next((e for e in full["items"]
                               if e.get("more") and e["id"] in subset_ids | draft_ids and e["id"] in marked_ids()), None)
            if more_entry:
                page.locator("#anX").click()
                card.locator(f".an-t[data-k='{more_entry['id']}']").first.click()
                more_btn = page.locator("#anMoreBtn")
                self.assertEqual(more_btn.inner_text(), "展开来龙去脉")
                self.assertTrue(page.locator("#anMoreWrap").is_visible())
                url_before = page.url
                more_btn.click()
                self.assertTrue(page.locator("#anMore").is_visible())
                self.assertIn(more_entry["more"][:12], page.locator("#anMore").inner_text())
                self.assertEqual(page.url, url_before, "展开不许跳页")
            # 没有 more 的词条：不出现「展开来龙去脉」
            plain_entry = next((e for e in full["items"]
                                if not e.get("more") and e["id"] in subset_ids | draft_ids and e["id"] in marked_ids()), None)
            if plain_entry:
                page.locator("#anX").click()
                card.locator(f".an-t[data-k='{plain_entry['id']}']").first.click()
                self.assertTrue(page.locator("#anMoreWrap").is_hidden())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 沿用 r1：真实数据、不拦截，处数与页下注条数全部从数据算 ──
    def test_live_real_data_counts_are_computed(self) -> None:
        full = load("data/ainotes.json")
        total, per_voice = expected(full)
        # 刀 3 起一张单篇一个开关：只算当前这张卡有没有可解析标记
        expected_bars = 1 if total else 0
        ctx, page, errors = self.open()
        try:
            card = self.card(page)
            self.assertEqual(card.locator(".an-t").count(), total)
            voice_sel = {"human_voice": ".kr-human", "machine_voice": ".kr-machine"}
            for voice, hit in per_voice.items():
                self.assertEqual(card.locator(f"{voice_sel[voice]} .an-foot li").count(),
                                 len({m["id"] for m in hit}), f"{voice} 页下注条数不对")
            self.assertEqual(card.locator(".an-bar[role='radiogroup']").count(), expected_bars)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 沿用：360 宽弹层贴底 ──
    def test_mobile_360_no_horizontal_scroll(self) -> None:
        ctx, page, errors = self.open(width=360)
        try:
            self.assertLessEqual(page.evaluate(OVERFLOW), 0, "360 宽横向溢出")
            self.card(page).locator(".an-t").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertLessEqual(page.evaluate(OVERFLOW), 0, "弹层打开后 360 宽横向溢出")
            box = page.locator("#anSheet").bounding_box()
            self.assertEqual(round(box["x"]), 0)
            self.assertEqual(round(box["width"]), 360, "手机上弹层应贴满底宽")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 沿用：词条数据整个取不到，静默退回没有小纸条的样子 ──
    def test_missing_notes_data_degrades_silently(self) -> None:
        ctx = self.browser.new_context(viewport={"width": 1100, "height": 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/ainotes.marks.json", lambda route, _request: route.fulfill(status=404, body=""))
        try:
            page.goto(f"{self.base}/{PAGE}#{CARD}", wait_until="networkidle")
            page.locator(".kanread-card").first.wait_for()
            self.assertEqual(page.locator(".an-t").count(), 0)
            self.assertEqual(page.locator(".an-bar").count(), 0)
            self.assertEqual(page.locator(".an-foot-wrap").count(), 0)
            self.assertIn("人声 · 摘要", page.locator(f"#{CARD}").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()
    # ── 刀 4 C3：弹层底部「在小纸条里看这个词 →」（真实数据，id 从 DOM 现取） ──
    def test_sheet_links_to_channel_page(self) -> None:
        ctx, page, errors = self.open()
        try:
            self.card(page).locator(".an-t").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            k = page.evaluate("document.querySelector('.an-t').getAttribute('data-k')")
            go = page.locator("#anGo")
            self.assertTrue(go.is_visible())
            self.assertEqual(go.get_attribute("href"), f"ainotes.html#{k}")
            self.assertGreaterEqual(go.bounding_box()["height"], 44)
            self.assertEqual(page.locator("#anSrcs #anGo").count(), 0, "链接不许在 anSrcs 里")
            # 点过去：落到频道页，那条词条被定位
            go.click()
            page.wait_for_url("**/ainotes.html*")
            page.locator(f"#{k}.is-target").wait_for()
            self.assertIn("就是这一条", page.locator(f"#{k} .bk-here").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 预览态：href 带 ?preview=1
        ctx, page, errors = self.open("?preview=1")
        try:
            self.card(page).locator(".an-t").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            k = page.evaluate("document.querySelector('.an-t').getAttribute('data-k')")
            self.assertEqual(page.locator("#anGo").get_attribute("href"), f"ainotes.html?preview=1#{k}")
            self.assertEqual(errors, [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
