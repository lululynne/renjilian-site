#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""小纸条（刊读词下注）的浏览器实测（2026-09-30，刀 1；r1 去数据耦合）。

照 RoundtableRenderTests 的办法：本机起静态服务 + 无头 Chromium，不需要后端。

原则（返修 r1）：测的是行为，不是今天的数据有几条。
- 「只有已核对词条带标记」用 page.route 拦 ainotes.json 回子集造场景，期望数全部从
  data/ainotes.marks.json 和拦截用的信封算出来；
- 「草稿带【草稿】」同样靠拦截 drafts 造夹具，不读本机真实的 data/ainotes.drafts.json
  （它不进仓库，别的机器上没有）；
- 另有一条用真实数据不拦截的测试，期望数也从数据算；
- 恶意字符串、关态零痕迹、焦点回程、刷新保持、360 宽、404 降级照旧。
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


def load(name: str):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def envelope(items: list[dict]) -> dict:
    return {"schema_version": 1, "updated_at": "2026-09-30", "items": items}


def marks() -> dict:
    return load("data/ainotes.marks.json")["readings"][CARD]


def expected(entries: dict) -> tuple[int, dict[str, list[dict]]]:
    """一份词条信封 + 标记文件 → (可显示标记总处数, {声部: 命中的标记列表})"""
    ids = {e["id"] for e in entries["items"]}
    mk = marks()
    per_voice = {v: [m for m in ms if m["id"] in ids] for v, ms in mk.items()}
    return sum(len(h) for h in per_voice.values()), per_voice


def marked_ids() -> set[str]:
    return {m["id"] for ms in marks().values() for m in ms}


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

    def open(self, query: str = "", width: int = 1100, routes: dict[str, dict] | None = None):
        page = self.browser.new_page(viewport={"width": width, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        for pattern, payload in (routes or {}).items():
            page.route(pattern, lambda route, _request, p=payload: fulfill(route, p))
        page.goto(f"{self.base}/{PAGE}{query}", wait_until="networkidle")
        page.locator(".kanread-card").first.wait_for()
        return page, errors

    # ── 1. 线上模式（拦截成子集）：只有已核对词条带标记，被排除的词逐个零痕迹 ──
    def test_live_only_listed_entries_are_marked(self) -> None:
        full = load("data/ainotes.json")
        subset = envelope(full["items"][:SUBSET_N])
        total_all, _ = expected(full)
        total_sub, per_voice = expected(subset)
        if not (0 < total_sub < total_all):
            self.skipTest("子集没有造成排除，场景不成立")
        page, errors = self.open(routes={"**/data/ainotes.json": subset})
        try:
            card = page.locator(f"#{CARD}")
            ts = card.locator(".an-t")
            self.assertEqual(ts.count(), total_sub, "标记处数应等于子集可解析的处数")
            ks = {ts.nth(i).get_attribute("data-k") for i in range(ts.count())}
            self.assertEqual(ks, {e["id"] for e in subset["items"]} & marked_ids())
            # 页下注条数 = 每声部去重后的词条数
            voice_sel = {"human_voice": ".kr-human", "machine_voice": ".kr-machine"}
            for voice, hit in per_voice.items():
                lis = card.locator(f"{voice_sel[voice]} .an-foot li")
                self.assertEqual(lis.count(), len({m["id"] for m in hit}), f"{voice} 页下注条数不对")
            # 被排除的词逐个断言：没有按钮、页下注里没有它的条目
            excluded = [e for e in full["items"][SUBSET_N:] if e["id"] in marked_ids()]
            self.assertTrue(excluded, "子集没排除掉任何被标记的词，场景不成立")
            foot_zhs = card.locator(".an-foot li b").all_inner_texts()
            for e in excluded:
                with self.subTest(excluded=e["id"]):
                    self.assertEqual(card.locator(f".an-t[data-k='{e['id']}']").count(), 0)
                    self.assertNotIn(e["zh"], foot_zhs)
            # 开关一张（就 DevDay 一张卡有可显示标记），默认开
            self.assertEqual(card.locator(".an-toggle").count(), 1)
            self.assertEqual(page.locator(".an-toggle").get_attribute("aria-pressed"), "true")
            # 编号每个声部从 1 起
            for voice, sel in voice_sel.items():
                if per_voice[voice]:
                    self.assertEqual(card.locator(f"{sel} .an-t sup").first.inner_text(), "1")
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 2. 预览模式（拦截公开子集 + 拦截草稿夹具）：全部可点、草稿带【草稿】、公开不带 ──
    def test_preview_merges_routed_drafts(self) -> None:
        full = load("data/ainotes.json")
        subset_items = full["items"][:SUBSET_N]
        draft_items = full["items"][SUBSET_N:]
        subset_ids = {e["id"] for e in subset_items}
        draft_ids = {e["id"] for e in draft_items}
        by_id = {e["id"]: e for e in full["items"]}
        mk = marks()
        flat = mk["human_voice"] + mk["machine_voice"]
        draft_only = next((m["id"] for m in flat if m["id"] in draft_ids and m["id"] not in subset_ids), None)
        public_marked = next((m["id"] for m in flat if m["id"] in subset_ids), None)
        if not (draft_only and public_marked):
            self.skipTest("数据现状造不出「草稿独有词 + 公开词」场景")
        routes = {"**/data/ainotes.json": envelope(subset_items),
                  "**/data/ainotes.drafts.json": envelope(draft_items)}
        page, errors = self.open("?preview=1", routes=routes)
        try:
            card = page.locator(f"#{CARD}")
            expected_total = sum(1 for m in flat if m["id"] in subset_ids | draft_ids)
            ts = card.locator(".an-t")
            self.assertEqual(ts.count(), expected_total, "并入草稿夹具后，可解析的标记应全部可点")
            # 草稿词：弹层带【草稿】，内容就是夹具里那条
            btn = card.locator(f".an-t[data-k='{draft_only}']").first
            btn.click()
            sheet = page.locator("#anSheet")
            self.assertTrue(sheet.is_visible())
            self.assertEqual(sheet.get_attribute("role"), "dialog")
            self.assertEqual(sheet.get_attribute("aria-modal"), "true")
            zh = page.locator("#anZh").inner_text()
            self.assertTrue(zh.startswith("【草稿】"), "草稿词条要标【草稿】")
            self.assertIn(by_id[draft_only]["zh"], zh)
            self.assertEqual(page.locator("#anLine").inner_text(), by_id[draft_only]["line"])
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
            # 有 more 的词条：「展开」在弹层内展开，不跳页
            more_entry = next((e for e in full["items"]
                               if e.get("more") and e["id"] in subset_ids | draft_ids and e["id"] in marked_ids()), None)
            if more_entry:
                page.locator("#anX").click()
                card.locator(f".an-t[data-k='{more_entry['id']}']").first.click()
                self.assertTrue(page.locator("#anMoreWrap").is_visible())
                page.locator("#anMoreBtn").click()
                self.assertTrue(page.locator("#anMore").is_visible())
                self.assertIn(more_entry["more"][:12], page.locator("#anMore").inner_text())
                self.assertNotIn("#", page.url.split(PAGE)[-1], "展开不许跳页")
            # 没有 more 的词条：不出现「展开」
            plain_entry = next((e for e in full["items"]
                                if not e.get("more") and e["id"] in subset_ids | draft_ids and e["id"] in marked_ids()), None)
            if plain_entry:
                page.locator("#anX").click()
                card.locator(f".an-t[data-k='{plain_entry['id']}']").first.click()
                self.assertTrue(page.locator("#anMoreWrap").is_hidden())
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 3. 真实数据、不拦截：处数与页下注条数全部从数据算 ──
    def test_live_real_data_counts_are_computed(self) -> None:
        full = load("data/ainotes.json")
        total, per_voice = expected(full)
        # 期望的开关数：渲染出来的卡里，有 ≥1 处可解析标记的卡各一张
        ids = {e["id"] for e in full["items"]}
        all_marks = load("data/ainotes.marks.json")["readings"]
        kanread_items = [it for it in load("data/kanread.json")["items"] if it.get("status") != "draft"]
        expected_toggles = sum(
            1 for it in kanread_items
            if any(m["id"] in ids for ms in (all_marks.get(it["id"]) or {}).values() for m in ms))
        page, errors = self.open()
        try:
            card = page.locator(f"#{CARD}")
            self.assertEqual(card.locator(".an-t").count(), total)
            voice_sel = {"human_voice": ".kr-human", "machine_voice": ".kr-machine"}
            for voice, hit in per_voice.items():
                self.assertEqual(card.locator(f"{voice_sel[voice]} .an-foot li").count(),
                                 len({m["id"] for m in hit}), f"{voice} 页下注条数不对")
            self.assertEqual(page.locator(".an-toggle").count(), expected_toggles)
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 4. 关掉开关：装饰全消失、不可聚焦、点了没反应、文字一字不差 ──
    def test_toggle_off_leaves_no_trace(self) -> None:
        full = load("data/ainotes.json")
        _, per_voice = expected(full)
        first_text = per_voice["human_voice"][0]["text"] if per_voice["human_voice"] else None
        if not first_text:
            self.skipTest("人声段没有可解析标记")
        page, errors = self.open()
        try:
            card = page.locator(f"#{CARD}")
            page.locator(".an-toggle").click()
            self.assertEqual(page.locator(".an-toggle").inner_text().replace("\n", "").strip(), "小纸条：关")
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.on')"), "0")
            self.assertFalse(page.locator("body.an-on").count())
            for i in range(card.locator(".an-foot").count()):
                self.assertFalse(card.locator(".an-foot").nth(i).is_visible())
            style = card.locator(".an-t .an-w").first.evaluate(
                "el => { const s = getComputedStyle(el); return s.borderBottomStyle + '/' + s.borderBottomWidth; }")
            self.assertIn("none", style.split("/")[0])
            self.assertFalse(card.locator(".an-t sup").first.is_visible())
            self.assertEqual(card.locator(".an-t").first.get_attribute("tabindex"), "-1")
            card.locator(".an-t").first.click(force=True)
            self.assertTrue(page.locator("#anSheet").is_hidden())
            # 字和原来一字不差：开→关→开→关一个来回，关态文字稳定，且标记处只剩词本身
            off_text = card.locator(".kr-human").inner_text()
            self.assertEqual(card.locator(".an-t").first.inner_text(), first_text)
            self.assertNotIn(first_text + "1", off_text)
            page.locator(".an-toggle").click()
            self.assertIn(first_text + "1", card.locator(".kr-human").inner_text())
            page.locator(".an-toggle").click()
            self.assertEqual(card.locator(".kr-human").inner_text(), off_text)
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 5. 开关状态刷新后保持（同一 browser context 即同一 localStorage） ──
    def test_toggle_state_survives_reload(self) -> None:
        ctx = self.browser.new_context(viewport={"width": 1100, "height": 900})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            page.goto(f"{self.base}/{PAGE}", wait_until="networkidle")
            page.locator(".an-toggle").wait_for()
            page.locator(".an-toggle").click()
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.on')"), "0")
            page.reload(wait_until="networkidle")
            page.locator(".an-toggle").wait_for()
            self.assertEqual(page.locator(".an-toggle").inner_text().replace("\n", "").strip(), "小纸条：关")
            self.assertFalse(page.locator(".an-foot").first.is_visible())
            self.assertEqual(page.locator(".an-t").first.get_attribute("tabindex"), "-1")
            page.locator(".an-toggle").click()
            page.reload(wait_until="networkidle")
            page.locator(".an-toggle").wait_for()
            self.assertEqual(page.locator(".an-toggle").inner_text().replace("\n", "").strip(), "小纸条：开")
            self.assertTrue(page.locator(".an-foot").first.is_visible())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 6. 恶意词条字符串：只显示成字面文字，不生成元素、不执行 ──
    def test_hostile_entry_strings_render_as_text(self) -> None:
        payload = load("data/ainotes.json")
        target = next((e for e in payload["items"] if e["id"] in marked_ids()), None)
        if not target:
            self.skipTest("没有已公开且被标记的词条可注入")
        target["zh"] = '<img src=x onerror="window.__pwn=1">'
        target["line"] = '"><svg onload="window.__pwn2=1">'
        target["for_us"] = "<b>bold</b>"
        target["more"] = "<i>more</i>"
        target["sources"] = [{"name": "<u>坏来源</u>", "url": "javascript:alert(1)"},
                             {"name": "正常来源", "url": "https://example.com/x"}]
        page, errors = self.open(routes={"**/data/ainotes.json": payload})
        try:
            page.locator(f"#{CARD} .an-t[data-k='{target['id']}']").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertIsNone(page.evaluate("window.__pwn"))
            self.assertIsNone(page.evaluate("window.__pwn2"))
            shown = page.locator("#anSheet").inner_text()
            self.assertIn("<img src=x", shown, "恶意字符串应原样显示成文字")
            self.assertIn("<svg", shown)
            self.assertIn("<b>bold</b>", shown)
            self.assertEqual(page.locator("#anSheet img, #anSheet svg, #anSheet b, #anSheet i, #anSheet u").count(), 0,
                             "弹层里多出了标签")
            # 页下注里的 zh 也一样只是文字
            foot_all = "\n".join(page.locator(f"#{CARD} .an-foot").all_inner_texts())
            self.assertIn("<img src=x", foot_all)
            self.assertEqual(page.locator(f"#{CARD} .an-foot img").count(), 0)
            # 非 https 来源只显示名字不做链接
            self.assertEqual(page.locator("#anSrcs a").count(), 1)
            self.assertEqual(page.locator("#anSrcs a").first.get_attribute("href"), "https://example.com/x")
            self.assertIn("<u>坏来源</u>", page.locator("#anSrcs").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            page.close()

    # ── 7. 360 宽：不横向滚动，弹层贴底 ──
    def test_mobile_360_no_horizontal_scroll(self) -> None:
        page, errors = self.open(width=360)
        try:
            self.assertLessEqual(page.evaluate(OVERFLOW), 0, "360 宽横向溢出")
            page.locator(f"#{CARD} .an-t").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertLessEqual(page.evaluate(OVERFLOW), 0, "弹层打开后 360 宽横向溢出")
            box = page.locator("#anSheet").bounding_box()
            self.assertEqual(round(box["x"]), 0)
            self.assertEqual(round(box["width"]), 360, "手机上弹层应贴满底宽")
            self.assertEqual(errors, [])
        finally:
            page.close()

    # ── 8. 词条数据整个取不到：静默退回没有小纸条的样子，页面照常渲染 ──
    def test_missing_notes_data_degrades_silently(self) -> None:
        page = self.browser.new_page(viewport={"width": 1100, "height": 900})
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/ainotes.marks.json", lambda route: route.fulfill(status=404, body=""))
        try:
            page.goto(f"{self.base}/{PAGE}", wait_until="networkidle")
            page.locator(".kanread-card").first.wait_for()
            self.assertEqual(page.locator(".an-t").count(), 0)
            self.assertEqual(page.locator(".an-toggle").count(), 0)
            self.assertEqual(page.locator(".an-foot").count(), 0)
            self.assertIn("人声 · 摘要", page.locator(f"#{CARD}").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            page.close()

    # ── 9. 现状记录（不改页面，要不要去重由阿景定） ──
    @unittest.expectedFailure
    def test_footnote_should_not_repeat_en_when_zh_already_has_it(self) -> None:
        """现状：zh 为「点数（credits）」、en 为「Credits」时，页下注显示成
        「点数（credits）（Credits）」——英文名重复了一遍。页面暂未去重。"""
        payload = load("data/ainotes.json")
        target = next((e for e in payload["items"] if e["id"] in marked_ids()), None)
        if not target:
            self.skipTest("没有已公开且被标记的词条可用")
        target["zh"] = "点数（credits）"
        target["en"] = "Credits"
        page, _ = self.open(routes={"**/data/ainotes.json": payload})
        try:
            page.locator(f"#{CARD} .an-t[data-k='{target['id']}']").first.wait_for()
            foot_all = "\n".join(page.locator(f"#{CARD} .an-foot").all_inner_texts())
            self.assertNotIn("点数（credits）（Credits）", foot_all, "页下注重复了英文名")
        finally:
            page.close()


if __name__ == "__main__":
    unittest.main()
