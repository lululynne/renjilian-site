#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""小纸条频道页（刀 4）的浏览器实测（2026-09-30）。

本机静态服务 + 无头 Chromium。不绑真实数据条数与 id：
data/ainotes.json、data/kanread.json、data/ainotes.drafts.json 一律 page.route 塞夹具，
期望值从夹具现算。唯一例外：P6 里跨页验证档位那一步用真实 kanread（只断言档位radio）。
"""
from __future__ import annotations

import functools
import http.server
import json
import threading
import unittest
from pathlib import Path

from playwright.sync_api import sync_playwright

try:
    from test_second_person_shell import NAV_ORDER
except ImportError:                      # 以 admin.test_ 包方式跑时
    from admin.test_second_person_shell import NAV_ORDER

ROOT = Path(__file__).resolve().parents[1]
PAGE = "ainotes.html"
OVERFLOW = "document.documentElement.scrollWidth - window.innerWidth"
DETAIL = "看不太懂？说详细点"

TOUCH_JS = """
(() => {
  const bad = [];
  document.querySelectorAll('button, a, input').forEach(el => {
    if (el.disabled || el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44)
      bad.push({cls: String(el.className).slice(0, 40), text: (el.textContent || '').trim().slice(0, 14),
                w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10});
  });
  return bad;
})()
"""


def ent(id_: str, zh: str, en: str, **kw) -> dict:
    e = {"id": id_, "zh": zh, "en": en, "aliases": [], "tags": [],
         "brief": "简短版的解释，凑够二十个字的长度要求。",
         "line": "详细版的解释，写给新手看的完整说法，肯定超过二十个字。",
         "more": "", "for_us": "", "related": [], "seen_in": [],
         "sources": [{"name": "官方来源", "url": "https://example.com/" + id_}],
         "added_at": "2026-09-30", "last_verified": "2026-09-30", "status": "verified"}
    e.update(kw)
    return e


ENTRIES = [
    ent("bk-t-api", "API", "API (Application Programming Interface)",
        aliases=["接口"], tags=["概念", "编程"],
        line="软件之间传话的窗口，像银行柜台：单子递进去，结果递出来。"),
    ent("bk-t-sub", "订阅", "Subscription", aliases=["套餐"], tags=["计费", "概念"],
        line="包月买服务的付钱方式，跟按量的 API 是两种买法。"),
    ent("bk-t-agent", "代理 / 智能体", "Agent", tags=["概念"]),
    ent("bk-t-anth", "Anthropic / Claude", "Anthropic / Claude", tags=["公司", "Anthropic"]),
    ent("bk-t-a", "阿词", "Aword", tags=["产品", "网页"]),
    ent("bk-t-zeta", "Zeta", "Zeta", tags=["产品", "开源", "编程"]),
    ent("bk-t-nobrief", "甲词", "Beta", tags=["产品", "终端"], brief=""),
    ent("bk-t-pro", "ChatGPT 的付费档位（Plus / Pro）", "ChatGPT Plus / Pro 200",
        aliases=["Pro 200", "ChatGPT 会员"], tags=["计费", "OpenAI"],
        more="来龙去脉：档位沿革的一段长文字。", for_us="对人机恋读者意味着的一笔账。",
        sources=[{"name": "官方文档", "url": "https://example.com/pro"},
                 {"name": "坏来源", "url": "javascript:alert(1)"}],
        seen_in=["kr-t-one", "kr-t-draft", "kr-t-missing"],
        related=["bk-t-api", "bk-t-dangling"]),
    {"id": "BAD ID!!", "zh": "坏条目", "line": "这条 id 不合法，必须被跳过。", "status": "verified"},
]

KANREAD = {"schema_version": 1, "updated_at": "2026-09-30", "items": [
    {"id": "kr-t-one", "title": "精读一标题", "status": "verified"},
    {"id": "kr-t-stale", "title": "失效精读", "status": "unavailable"},
    {"id": "kr-t-draft", "title": "草稿精读", "status": "draft"},
]}

DRAFTS = {"schema_version": 1, "updated_at": "2026-09-30", "items": [
    ent("bk-t-draft1", "草词", "Draftword", status="draft"),
    ent("bk-t-api", "API 草稿版", "API draft", status="draft"),   # 与公开重名，必须被跳过
]}

HOSTILE = ent("bk-t-evil", '<img src=x onerror="window.__pwn1=1">', '<svg onload="window.__pwn2=1">',
              aliases=["<b>al</b>"], tags=["<i>t</i>"],
              brief='<img src=x onerror="window.__pwn3=1"> 凑够二十个字的恶意简短版。',
              line='<b>详细</b>恶意版 <svg onload="window.__pwn4=1"></svg>，凑够二十个字。',
              more='<img src=x onerror="window.__pwn5=1">', for_us='<svg onload="window.__pwn6=1"></svg>',
              sources=[{"name": "<u>坏来源</u>", "url": "javascript:alert(1)"}])

BASE_ORDER = ["bk-t-a", "bk-t-anth", "bk-t-api", "bk-t-pro", "bk-t-agent", "bk-t-sub", "bk-t-nobrief", "bk-t-zeta"]


def encode(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)


class AinotesPageBrowserTests(unittest.TestCase):
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

    def open(self, query: str = "", hash_: str = "", width: int = 390, height: int = 844,
             js: bool = True, init: str | None = None, entries=None, kanread_status: int = 200,
             drafts=None, track: list | None = None):
        ctx = self.browser.new_context(viewport={"width": width, "height": height},
                                       java_script_enabled=js)
        if init:
            ctx.add_init_script(init)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        if track is not None:
            page.on("request", lambda r: track.append(r.url))
        body = encode({"schema_version": 1, "updated_at": "2026-09-30",
                       "items": ENTRIES if entries is None else entries})
        page.route("**/data/ainotes.json",
                   lambda route, _r, b=body: route.fulfill(status=200, content_type="application/json", body=b))
        kb = encode(KANREAD)
        page.route("**/data/kanread.json",
                   lambda route, _r, b=kb: route.fulfill(status=kanread_status, content_type="application/json", body=b))
        db = encode(drafts if drafts is not None else DRAFTS)
        page.route("**/data/ainotes.drafts.json",
                   lambda route, _r, b=db: route.fulfill(status=200, content_type="application/json", body=b))
        page.goto(f"{self.base}/{PAGE}{query}{('#' + hash_) if hash_ else ''}", wait_until="networkidle")
        return ctx, page, errors

    def cards(self, page):
        return page.locator(".bk-card:visible")

    def wait_cards(self, page) -> None:
        page.locator(".bk-card").first.wait_for()

    # ── P1 加载与排序 ──
    def test_p1_load_and_order(self) -> None:
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            ids = page.locator(".bk-card").evaluate_all("els => els.map(e => e.id)")
            self.assertEqual(ids, BASE_ORDER, "坏条目被跳过；顺序按拼音首字母分组的基础序")
            self.assertEqual(page.locator(".bk-letter").evaluate_all("els => els.map(e => e.dataset.letter)"),
                             ["A", "C", "D", "J", "Z"])
            page.wait_for_function("document.getElementById('bkCount').textContent.length > 0")
            self.assertEqual(page.locator("#bkCount").inner_text(), "共 8 条 · 更新于 2026-09-30")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P2 搜索 ──
    def test_p2_search(self) -> None:
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            q = page.locator("#bkQ")
            for query in ("api", "ＡＰＩ", "API"):
                q.fill(query)
                page.wait_for_function(
                    "document.querySelector('.bk-card:not([hidden])').id === 'bk-t-api'")
                ids = page.locator(".bk-card:not([hidden])").evaluate_all("els => els.map(e => e.id)")
                self.assertEqual(ids[0], "bk-t-api", f"{query} 的第一张应是 API 本条")
                self.assertIn("bk-t-sub", ids, "订阅的 line 提到 API，也该命中")
                self.assertTrue(page.locator("#bk-t-api .bk-aka").is_hidden(), "名字命中的那条不显示「也叫」")
            # 别名命中：也叫
            q.fill("接口")
            page.locator("#bk-t-api .bk-aka:not([hidden])").wait_for()
            self.assertEqual(page.locator("#bk-t-api .bk-aka").inner_text(), "也叫「接口」")
            q.fill("会员")
            page.locator("#bk-t-pro .bk-aka:not([hidden])").wait_for()
            self.assertEqual(page.locator("#bk-t-pro .bk-aka").inner_text(), "也叫「ChatGPT 会员」")
            # compact：pro200 命中 Pro 200
            q.fill("pro200")
            page.wait_for_function("document.querySelector('.bk-card:not([hidden])').id === 'bk-t-pro'")
            # 两个词按「且」（先等第一张变成 API——上一问的可见集恰好也只有一张，防竞态）
            q.fill("api 窗口")
            page.wait_for_function("document.querySelector('.bk-card:not([hidden])').id === 'bk-t-api'")
            self.assertEqual(page.locator(".bk-card:not([hidden])").count(), 1, "「api 窗口」按且命中，只剩 API")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P3 输入法 ──
    def test_p3_ime_composition(self) -> None:
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            page.locator("#bkQ").focus()
            page.evaluate("""() => {
              const el = document.getElementById('bkQ');
              el.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
              el.value = 'api';
              el.dispatchEvent(new InputEvent('input', {isComposing: true, bubbles: true}));
            }""")
            page.wait_for_timeout(200)
            self.assertEqual(page.locator(".bk-card:not([hidden])").count(), 8, "拼到一半不许筛")
            page.evaluate("document.getElementById('bkQ').dispatchEvent(new CompositionEvent('compositionend', {bubbles: true}))")
            page.wait_for_function("document.querySelectorAll('.bk-card:not([hidden])').length < 8")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P4 空结果与基础词 ──
    def test_p4_empty_and_starters(self) -> None:
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            page.locator("#bkQ").fill("zzqq")
            page.locator("#bkEmpty:not([hidden])").wait_for()
            self.assertIn("没找到「zzqq」", page.locator("#bkEmptyText").inner_text())
            # 基础词：STARTERS 都不在夹具里 → 用「概念」标签按基础序补
            want = [e for e in BASE_ORDER
                    if "概念" in next(x for x in ENTRIES if isinstance(x, dict) and x.get("id") == e)["tags"]][:6]
            links = page.locator("#bkStarters a.bk-link")
            self.assertEqual(links.evaluate_all("els => els.map(e => e.getAttribute('href'))"),
                             ["#" + i for i in want])
            links.first.click()
            page.wait_for_function("document.getElementById('bkQ').value === ''")
            self.assertEqual(page.locator("#bkQ").input_value(), "")
            self.assertTrue(page.locator(f"#{want[0]}").evaluate("e => e.classList.contains('is-target')"))
            self.assertIn("已清空搜索和标签", page.locator("#bkNotice").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P5 标签 ──
    def test_p5_tags(self) -> None:
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            page.locator(".bk-tags-wrap summary").click()   # 390 下默认收起，点开
            used = {t for e in ENTRIES if isinstance(e, dict) and "tags" in e for t in e["tags"]}
            shown = page.locator(".bk-tag").evaluate_all("els => els.map(e => e.dataset.tag)")
            self.assertEqual(set(shown), used, "只渲染夹具里出现过的标签")
            self.assertNotIn("Google", shown)
            self.assertNotIn("人物", shown)
            self.assertNotIn("地区", page.locator(".bk-tag-legend").all_inner_texts(), "整组都没有的不渲染")
            # 同组或、跨组且：概念(类型) + 编程(话题) → 只剩 API
            page.locator(".bk-tag[data-tag='概念']").click()
            page.locator(".bk-tag[data-tag='编程']").click()
            page.wait_for_function("document.querySelectorAll('.bk-card:not([hidden])').length === 1")
            self.assertEqual(page.locator(".bk-card:not([hidden])").get_attribute("id"), "bk-t-api")
            t = page.locator(".bk-tag[data-tag='概念']")
            self.assertEqual(t.get_attribute("aria-pressed"), "true")
            self.assertEqual(t.evaluate("e => getComputedStyle(e, '::before').content"), '"✓"')
            self.assertIn("已选 2 个", page.locator("#bkTagsPicked").inner_text())
            page.wait_for_function("location.search.includes('tag=')")
            # 清除
            page.locator("#bkTagsClear").click()
            page.wait_for_function("document.querySelectorAll('.bk-card:not([hidden])').length === 8")
            self.assertTrue(page.evaluate(
                "document.activeElement === document.querySelector('.bk-tags-wrap summary')"))
            # 产品 + 公司（同组「或」）→ 4 条
            page.locator(".bk-tag[data-tag='产品']").click()
            page.locator(".bk-tag[data-tag='公司']").click()
            page.wait_for_function("document.querySelectorAll('.bk-card:not([hidden])').length === 4")
            # 标签和 q 叠加：撤掉公司、产品换成概念，搜「订阅」→ 只剩订阅（它有概念）
            page.locator(".bk-tag[data-tag='公司']").click()
            page.locator(".bk-tag[data-tag='产品']").click()
            page.locator(".bk-tag[data-tag='概念']").click()
            page.locator("#bkQ").fill("订阅")
            page.wait_for_function("document.querySelectorAll('.bk-card:not([hidden])').length === 1")
            self.assertEqual(page.locator(".bk-card:not([hidden])").get_attribute("id"), "bk-t-sub")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P6 两档 ──
    def test_p6_two_modes(self) -> None:
        e1 = next(e for e in ENTRIES if e["id"] == "bk-t-api")
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            # 没有存储时是简洁档；加载不写存储
            self.assertEqual(page.locator("#bk-t-api .bk-text").inner_text(), e1["brief"])
            self.assertIsNone(page.evaluate("localStorage.getItem('rj.ainotes.mode')"))
            # 说详细点：只这一张换 line，焦点进 .bk-text，按钮消失
            page.locator("#bk-t-api .bk-detail-btn").click()
            self.assertEqual(page.locator("#bk-t-api .bk-text").inner_text(), e1["line"])
            self.assertTrue(page.locator("#bk-t-api").evaluate("e => e.classList.contains('is-full')"))
            self.assertTrue(page.evaluate(
                "document.activeElement === document.querySelector('#bk-t-api .bk-text')"))
            self.assertTrue(page.locator("#bk-t-api .bk-detail-row").is_hidden())
            self.assertEqual(page.locator("#bk-t-sub .bk-text").inner_text(),
                             next(e for e in ENTRIES if e["id"] == "bk-t-sub")["brief"], "别的卡不动")
            # 点「详细」：全部 line，存储写 full；「说详细点」状态被重置
            page.locator(".an-mode[data-mode='full']").click()
            self.assertEqual(page.locator("#bk-t-api .bk-text").inner_text(), e1["line"])
            self.assertFalse(page.locator("#bk-t-api").evaluate("e => e.classList.contains('is-full')"))
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), "full")
            # 方向键换回简洁
            page.locator(".an-mode[data-mode='full']").focus()
            page.keyboard.press("ArrowLeft")
            self.assertEqual(page.locator("#bk-t-api .bk-text").inner_text(), e1["brief"])
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), "brief")
            # 没有 brief 的词条：两档都 line，没有按钮
            nb = next(e for e in ENTRIES if e["id"] == "bk-t-nobrief")
            self.assertEqual(page.locator("#bk-t-nobrief .bk-text").inner_text(), nb["line"])
            self.assertEqual(page.locator("#bk-t-nobrief .bk-detail-btn").count(), 0)
            page.locator(".an-mode[data-mode='full']").click()
            self.assertEqual(page.locator("#bk-t-nobrief .bk-text").inner_text(), nb["line"])
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 存储是 off：显示简洁，点选不写回（Q1）
        ctx, page, errors = self.open(init="localStorage.setItem('rj.ainotes.mode','off')")
        try:
            self.wait_cards(page)
            self.assertEqual(page.locator("#bk-t-api .bk-text").inner_text(), e1["brief"])
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), "off")
            page.locator(".an-mode[data-mode='full']").click()
            self.assertEqual(page.locator("#bk-t-api .bk-text").inner_text(), e1["line"])
            self.assertEqual(page.evaluate("localStorage.getItem('rj.ainotes.mode')"), "off", "off 时不写回")
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 存储 full：开 kanread 单篇，详细档被选中（真实数据，只断言档位）
        rid = next(iter(json.loads((ROOT / "data/ainotes.marks.json").read_text(encoding="utf-8"))["readings"]))
        ctx = self.browser.new_context(viewport={"width": 1100, "height": 900})
        ctx.add_init_script("localStorage.setItem('rj.ainotes.mode','full')")
        page = ctx.new_page()
        try:
            page.goto(f"{self.base}/kanread.html#{rid}", wait_until="networkidle")
            page.locator(".an-mode[data-mode='full']").wait_for()
            self.assertEqual(page.locator(".an-mode[data-mode='full']").get_attribute("aria-checked"), "true")
        finally:
            ctx.close()

    # ── P7 展开 ──
    def test_p7_expand_more(self) -> None:
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            card = page.locator("#bk-t-pro")
            self.assertEqual(card.locator(".bk-more-body").inner_text(), "", "展开区懒加载：没点开是空的")
            card.locator(".bk-more-wrap summary").click()
            card.locator(".bk-more-body .bk-sec").first.wait_for()
            self.assertIn("来龙去脉", card.locator(".bk-more-body").inner_text())
            self.assertIn("对我们", card.locator(".bk-more-body").inner_text())
            srcs = card.locator(".bk-srcs a")
            self.assertEqual(srcs.count(), 1, "javascript: 来源不许成链")
            self.assertTrue(srcs.first.get_attribute("href").startswith("https://"))
            self.assertEqual(srcs.first.get_attribute("target"), "_blank")
            self.assertEqual(srcs.first.get_attribute("rel"), "noopener noreferrer")
            self.assertIn("坏来源", card.locator(".bk-srcs span").inner_text())
            seen = card.locator(".bk-seen a")
            self.assertEqual(seen.count(), 1, "draft 和取不到的 seen_in 不显示")
            self.assertEqual(seen.first.get_attribute("href"), "kanread.html#kr-t-one")
            self.assertEqual(seen.first.inner_text(), "精读一标题")
            rel = card.locator(".bk-rel a")
            self.assertEqual(rel.count(), 1, "悬空的 related 被跳过")
            self.assertEqual(rel.first.inner_text(), "API")
            self.assertIn("最后核对 2026-09-30", card.locator(".an-verified").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # kanread.json 500：「出现在」整行不存在
        ctx, page, errors = self.open(kanread_status=500)
        try:
            self.wait_cards(page)
            page.locator("#bk-t-pro .bk-more-wrap summary").click()
            page.locator("#bk-t-pro .bk-more-body .an-verified").wait_for()
            self.assertEqual(page.locator("#bk-t-pro .bk-seen").count(), 0)
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()

    # ── P8 锚点 ──
    def test_p8_anchor(self) -> None:
        ctx, page, errors = self.open(hash_="bk-t-zeta")
        try:
            card = page.locator("#bk-t-zeta")
            card.wait_for()
            self.assertTrue(card.evaluate("e => e.classList.contains('is-target')"))
            self.assertIn("就是这一条", card.locator(".bk-here").inner_text())
            self.assertTrue(card.locator(".bk-here").is_visible())
            self.assertTrue(card.locator(".bk-more-wrap").evaluate("e => e.open"))
            self.assertTrue(page.evaluate("document.activeElement === document.getElementById('bk-t-zeta')"))
            top = card.evaluate("e => e.getBoundingClientRect().top")
            self.assertLess(top, 844)
            self.assertGreaterEqual(top, 0, "锚点卡片要滚进视口（scroll-margin 留住吸顶栏的位置）")
            # 点 related 链接：目标换过去，旧标记消失
            page.locator("#bk-t-pro .bk-more-wrap summary").click()
            page.locator("#bk-t-pro .bk-rel a").first.wait_for()
            page.locator("#bk-t-pro .bk-rel a").first.click()
            page.wait_for_function("document.getElementById('bk-t-api').classList.contains('is-target')")
            self.assertFalse(page.locator("#bk-t-zeta").evaluate("e => e.classList.contains('is-target')"))
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 对不上的：提示并清 hash
        ctx, page, errors = self.open(hash_="bk-nope")
        try:
            self.wait_cards(page)
            self.assertIn("没找到这个词条", page.locator("#bkNotice").inner_text())
            self.assertEqual(page.evaluate("location.hash"), "")
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # q 与 hash 同在：hash 优先，先清筛选
        ctx, page, errors = self.open(query="?q=api", hash_="bk-t-zeta")
        try:
            page.wait_for_function("document.getElementById('bk-t-zeta').classList.contains('is-target')")
            self.assertEqual(page.locator("#bkQ").input_value(), "")
            self.assertTrue(page.locator("#bk-t-zeta").is_visible())
            self.assertIn("已清空搜索和标签", page.locator("#bkNotice").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P9 URL 读写 ──
    def test_p9_url_contract(self) -> None:
        ctx, page, errors = self.open(query="?q=%E8%AE%A2%E9%98%85&tag=%E8%AE%A1%E8%B4%B9&preview=1")
        try:
            self.wait_cards(page)
            self.assertEqual(page.locator("#bkQ").input_value(), "订阅")
            self.assertEqual(page.locator(".bk-tag[data-tag='计费']").get_attribute("aria-pressed"), "true")
            n0 = page.evaluate("history.length")
            page.locator("#bkQ").evaluate("el => { el.focus(); el.setSelectionRange(99, 99); }")
            page.locator("#bkQ").type("x")
            page.wait_for_function("new URLSearchParams(location.search).get('q') === '订阅x'")
            self.assertEqual(page.evaluate("history.length"), n0, "写回必须用 replaceState，不涨历史")
            page.locator("#bkClear").click()
            page.wait_for_function("!location.search.includes('q=')")
            self.assertIn("preview=1", page.evaluate("location.search"), "别的参数要留住")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P10 预览 ──
    def test_p10_preview_merges_drafts(self) -> None:
        track: list[str] = []
        ctx, page, errors = self.open(query="?preview=1", track=track)
        try:
            self.wait_cards(page)
            self.assertEqual(page.locator(".bk-card").count(), 9, "草稿并入（重名的被跳过）")
            names = page.locator(".bk-card .bk-name").all_inner_texts()
            self.assertEqual(sum(1 for n in names if n.startswith("【草稿】")), 1)
            self.assertEqual(names.count("API"), 1, "与公开重名的草稿被跳过")
            self.assertTrue(any("ainotes.drafts.json" in u for u in track))
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        track2: list[str] = []
        ctx, page, errors = self.open(track=track2)
        try:
            self.wait_cards(page)
            self.assertFalse(any("ainotes.drafts.json" in u for u in track2), "不带 preview 不许取 drafts")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P11 恶意字符串 ──
    def test_p11_hostile_strings_render_as_text(self) -> None:
        ctx, page, errors = self.open(entries=ENTRIES[:-1] + [HOSTILE, ENTRIES[-1]])
        try:
            self.wait_cards(page)
            card = page.locator("#bk-t-evil")
            self.assertIn("<img src=x", card.locator(".bk-name").inner_text())
            self.assertIn("<svg", card.locator(".bk-en").inner_text())
            page.locator("#bkQ").fill("al")
            page.locator("#bk-t-evil .bk-aka:not([hidden])").wait_for()
            self.assertIn("<b>al</b>", card.locator(".bk-aka").inner_text())
            card.locator(".bk-more-wrap summary").click()
            page.locator("#bk-t-evil .bk-more-body .an-verified").wait_for()
            self.assertIn("<img src=x", card.locator(".bk-more-body").inner_text())
            for k in ("__pwn1", "__pwn2", "__pwn3", "__pwn4", "__pwn5", "__pwn6"):
                self.assertIsNone(page.evaluate(f"window.{k}"), k)
            self.assertEqual(page.locator("#bkList img").count(), 0)
            self.assertEqual(page.locator("#bkList svg:not(.bk-pin)").count(), 0)
            self.assertEqual(page.locator("#bkTags b").count(), 0)
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()

    # ── P12 宽度、触控、吸顶 ──
    def test_p12_width_touch_sticky(self) -> None:
        for width in (360, 390):
            with self.subTest(width=width):
                ctx, page, errors = self.open(width=width)
                try:
                    self.wait_cards(page)
                    if width == 390:
                        self.assertLess(page.locator(".bk-name").first.bounding_box()["y"], 844,
                                        "第一张卡名要在第一屏")
                        page.evaluate("window.scrollTo(0, 1500)")
                        r = page.locator("#bkQ").bounding_box()
                        self.assertGreaterEqual(r["y"], 0)
                        self.assertLess(r["y"], 844, "滚动后搜索框必须吸顶留在视口里")
                        page.evaluate("window.scrollTo(0, 0)")
                    for label, prep in (
                            ("默认", None),
                            ("标签展开", "document.querySelector('.bk-tags-wrap').open = true"),
                            ("首卡展开", "document.querySelector('.bk-card .bk-more-wrap').open = true"),
                            ("空结果", "const q=document.getElementById('bkQ'); q.value='zzqq';"
                                       "q.dispatchEvent(new Event('input',{bubbles:true}))")):
                        if prep:
                            page.evaluate(f"() => {{ {prep} }}")
                            page.wait_for_timeout(200)
                        self.assertLessEqual(page.evaluate(OVERFLOW), 0, f"{width} {label} 横向溢出")
                        self.assertEqual(page.evaluate(TOUCH_JS), [], f"{width} {label} 触控不足 44")
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    # ── P13 不联网 ──
    def test_p13_no_network_after_load(self) -> None:
        track: list[str] = []
        ctx, page, errors = self.open()
        try:
            self.wait_cards(page)
            track.clear()
            page.locator("#bkQ").type("api")
            page.locator(".bk-tags-wrap summary").click()
            page.locator(".bk-tag[data-tag='概念']").click()
            page.locator(".an-mode[data-mode='full']").click()
            page.wait_for_timeout(600)
            self.assertEqual(track, [], "搜索、筛选、换档都不许发请求")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P14 没有 JS ──
    def test_p14_no_js(self) -> None:
        ctx, page, errors = self.open(js=False)
        try:
            self.assertTrue(page.locator(".kr-noscript").is_visible())
            self.assertFalse(page.locator(".bk-search").is_visible())
            # C1 时 NAV_ORDER 还没收 ainotes.html（C2 顶栏才加），本页顶栏比它多自己这一项
            self.assertEqual(page.locator("nav.boards a").count(), len(NAV_ORDER) + 1)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── P15 取数失败 ──
    def test_p15_fetch_failure(self) -> None:
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/ainotes.json", lambda route, _r: route.fulfill(status=500, body=""))
        try:
            page.goto(f"{self.base}/{PAGE}", wait_until="networkidle")
            self.assertIn("小纸条暂时读不出来，稍后再来。", page.locator("#bkList").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
