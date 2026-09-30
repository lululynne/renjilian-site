#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""刊读刀 3「目录与单篇两层」的浏览器实测（2026-09-30）。

本机静态服务 + 无头 Chromium。不许绑死真实数据条数与具体 id：
data/kanread.json 一律用 page.route 塞测试自己造的夹具（kr-t-…，跨两个月、有日期重复、
有 unavailable、有 draft），期望值全部从夹具现算；ainotes 两份塞空信封。
唯一例外是 V10（小纸条焦点），它用真实词条数据，但精读 id 也从 marks 文件现取。
"""
from __future__ import annotations

import functools
import http.server
import json
import threading
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE = "kanread.html"
MOCK = "http://127.0.0.1:19499"     # 假后端：route 拦截，不开真端口
OVERFLOW = "document.documentElement.scrollWidth - window.innerWidth"

# 从可达性测试复制的触控检查：所有可见可用的 button/a ≥44×44
TOUCH_JS = """
(() => {
  const bad = [];
  const seen = new Set();
  const push = (el, box) => {
    if (seen.has(el)) return;
    seen.add(el);
    if (box.width < 44 || box.height < 44)
      bad.push({cls: String(el.className).slice(0, 40), text: (el.textContent || '').trim().slice(0, 14),
                w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10});
  };
  document.querySelectorAll('button, a, input').forEach(el => {
    if (el.disabled || el.offsetParent === null) return;
    if (el.type === 'radio') return;
    push(el, el.getBoundingClientRect());
  });
  return bad;
})()
"""


def mk(id_: str, date: str, title: str, **kw) -> dict:
    it = {"id": id_, "title": title, "source_name": "示例来源", "source_url": "https://example.com/" + id_,
          "published_at": date, "last_verified": "2026-09-30", "status": "verified",
          "author": "作者" + id_[-1], "hook": "钩子：" + title[:12],
          "topics": ["话题" + id_[-1]], "human_voice": "人声段 " + id_, "machine_voice": "机声段 " + id_}
    it.update(kw)
    return it


def fixture_items() -> list[dict]:
    """跨两个月、一天重复、一条 unavailable、一条 draft，共 8 条（7 条可见）。"""
    return [
        mk("kr-t-sep-30a", "2026-09-30", "九月三十日第一篇的标题写得长一些让它折成两行"),
        mk("kr-t-sep-30b", "2026-09-30", "九月三十日第二篇跟上一篇同一天用来验稳定排序"),
        mk("kr-t-sep-14", "2026-09-14", "九月十四日那一篇"),
        mk("kr-t-sep-02", "2026-09-02", "九月二日那一篇"),
        mk("kr-t-aug-31", "2026-08-31", "八月三十一日那一篇标题也写长一点凑够三十个字上下"),
        mk("kr-t-aug-03", "2026-08-03", "八月三日那一篇"),
        mk("kr-t-stale", "2026-08-01", "原文入口已经失效的那一篇", status="unavailable"),
        mk("kr-t-draft", "2026-09-29", "草稿不许出现", status="draft"),
    ]


def payload(items: list[dict]) -> dict:
    return {"schema_version": 1, "updated_at": "2026-09-30", "items": items}


EMPTY_NOTES = {"schema_version": 1, "updated_at": "2026-09-30", "items": []}
EMPTY_MARKS = {"schema_version": 1, "updated_at": "2026-09-30", "readings": {}}
VISIBLE = [it for it in fixture_items() if it["status"] != "draft"]


def expected_groups(items: list[dict]) -> list[tuple[str, list[dict]]]:
    """从夹具现算：稳定排序（日期新→旧，同日保原序）后的分组，组头文字 + 组内条目。"""
    vis = [it for it in items if it["status"] != "draft"]
    ordered = sorted(enumerate(vis), key=lambda p: p[1]["published_at"], reverse=True)
    groups: list[tuple[str, list[dict]]] = []
    last_key = None
    for _, it in ordered:
        key = it["published_at"][:7]
        if key == last_key:
            groups[-1][1].append(it)
        else:
            last_key = key
            y, m = key[:4], str(int(key[5:7]))
            groups.append((f"{y} 年 {m} 月", [it]))
    return [(f"{head} · {len(its)} 篇", its) for head, its in groups]


class FakeAPI:
    """仿 p25 的 Fake：只答评论这条线要的几个口。"""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, str]] = []

    def cors(self, route) -> dict:
        return {"content-type": "application/json; charset=utf-8",
                "access-control-allow-origin": route.request.headers.get("origin", "*"),
                "access-control-allow-credentials": "true",
                "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                "access-control-allow-headers": "content-type"}

    def reply(self, route, status: int, body: dict) -> None:
        route.fulfill(status=status, body=json.dumps(body, ensure_ascii=False), headers=self.cors(route))

    def __call__(self, route) -> None:
        req = route.request
        u = urlparse(req.url)
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=self.cors(route))
        self.calls.append((req.method, u.path, u.query))
        if u.path == "/api/config":
            return self.reply(route, 200, {"ok": True, "comments_enabled": True})
        if u.path == "/api/me":
            return self.reply(route, 200, {"ok": True, "signed_in": False})
        if u.path == "/api/comments" and req.method == "GET":
            return self.reply(route, 200, {"ok": True, "comments_enabled": True, "items": [
                {"id": "c_1", "author": {"handle": "duzhe", "kind": "human", "display_name": "读者"},
                 "posted_on": "2031-01-02", "body": "一条夹具留言。", "state": "visible", "mine": False}]})
        return self.reply(route, 404, {"ok": False, "error": "没有这个接口。"})

    def comment_gets(self) -> list[str]:
        return [q for m, p, q in self.calls if p == "/api/comments" and m == "GET"]

    def comment_targets(self) -> list[str]:
        """GET /api/comments 的 target 参数（query 里的冒号是编码过的，解开再比）"""
        return [parse_qs(q).get("target", [""])[0] for q in self.comment_gets()]


class KanreadViewsTests(unittest.TestCase):
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

    def open(self, query: str = "", hash_: str = "", items=None, js: bool = True,
             width: int = 390, height: int = 844, fake: FakeAPI | None = None):
        ctx = self.browser.new_context(viewport={"width": width, "height": height},
                                       java_script_enabled=js)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        if items is not None:
            body = json.dumps(payload(items), ensure_ascii=False)
            page.route("**/data/kanread.json",
                       lambda route, _r, b=body: route.fulfill(status=200, content_type="application/json", body=b))
            for name, env in (("ainotes.json", EMPTY_NOTES), ("ainotes.marks.json", EMPTY_MARKS)):
                b = json.dumps(env, ensure_ascii=False)
                page.route(f"**/data/{name}",
                           lambda route, _r, b=b: route.fulfill(status=200, content_type="application/json", body=b))
        if fake:
            page.route(MOCK + "/**", fake)
        page.goto(f"{self.base}/{PAGE}{query}{('#' + hash_) if hash_ else ''}", wait_until="networkidle")
        return ctx, page, errors

    # ── V1 目录只列标题这些信息 ──
    def test_v1_index_lists_only_these_fields(self) -> None:
        items = fixture_items()
        ctx, page, errors = self.open(items=items)
        try:
            page.locator(".kr-index").wait_for()
            lis = page.locator(".kr-index-item")
            self.assertEqual(lis.count(), len(VISIBLE), "条目数 = 非草稿条数")
            for i, it in enumerate(VISIBLE[:2]):
                li = lis.nth(i)
                self.assertEqual(li.get_attribute("data-id"), it["id"])
                self.assertEqual(li.locator(".kr-index-meta time").get_attribute("datetime"), it["published_at"])
                self.assertEqual(li.locator(".kr-index-link").inner_text(), it["title"])
                self.assertEqual(li.locator(".kr-index-link").get_attribute("href"), "#" + it["id"])
                self.assertIn(it["hook"], li.locator(".kr-index-hook").inner_text())
                self.assertIn(it["topics"][0], li.locator(".kr-topics").inner_text())
                self.assertIn(it["author"], li.locator(".kr-index-by").inner_text())
                self.assertIn(it["source_name"], li.locator(".kr-index-by").inner_text())
            # 目录里不许出现单篇才有的东西
            for sel in (".kanread-card", ".kr-comments", ".kr-voice", ".btn-source", ".an-bar", ".rj-related"):
                self.assertEqual(page.locator(sel).count(), 0, f"目录里不许出现 {sel}")
            # 目录项不许带 id；页面上不存在任何夹具 id 的元素
            for it in items:
                self.assertEqual(page.locator(f"[id='{it['id']}']").count(), 0, f"页面不许有 id={it['id']}")
            # 草稿不出现
            self.assertNotIn("草稿不许出现", page.content())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V2 按月分组，新的在上 ──
    def test_v2_grouped_by_month_newest_first(self) -> None:
        items = fixture_items()
        groups = expected_groups(items)
        ctx, page, errors = self.open(items=items)
        try:
            page.locator(".kr-index").wait_for()
            heads = page.locator(".kr-month-head").all_inner_texts()
            self.assertEqual(heads, [g[0] for g in groups])
            months = page.locator(".kr-month")
            for gi, (_, g_items) in enumerate(groups):
                ids = months.nth(gi).locator(".kr-index-item").evaluate_all(
                    "els => els.map(e => e.dataset.id)")
                self.assertEqual(ids, [it["id"] for it in g_items], f"第 {gi + 1} 组内顺序不对")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V3 目录一条都不拉；点进一篇才发一次评论请求 ──
    def test_v3_index_fetches_nothing_extra(self) -> None:
        fake = FakeAPI()
        items = fixture_items()
        json_hits: list[str] = []
        ctx, page, errors = self.open(f"?api={MOCK}", items=items, fake=fake)
        try:
            page.locator(".kr-index").wait_for()
            page.on("request", lambda r: json_hits.append(r.url))
            page.wait_for_timeout(400)
            self.assertEqual(fake.comment_gets(), [], "目录视图不许发 /api/comments")
            self.assertEqual([c for c in fake.calls], [], "目录视图不许发任何 /api/ 请求")
            for bad in ("pulse.json", "questions.json", "llm-cost", "mcps.json"):
                self.assertEqual([u for u in json_hits if bad in u], [], f"目录视图不该拉 {bad}")
            # 点进一篇：恰好一次 /api/comments，target 对
            page.locator(".kr-index-link").first.click()
            page.locator(".kr-comments .rjc-list").wait_for()
            gets = fake.comment_gets()
            self.assertEqual(len(gets), 1, "单篇只许发一次评论请求")
            self.assertEqual(fake.comment_targets(), [f"kanread:{VISIBLE[0]['id']}"])
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V4 进出单篇与滚动 ──
    def test_v4_enter_single_and_back_restores_scroll(self) -> None:
        items = fixture_items()
        fifth = VISIBLE[4]
        ctx, page, errors = self.open(items=items)
        try:
            page.locator(".kr-index").wait_for()
            page.evaluate("document.querySelectorAll('.kr-index-item')[4].scrollIntoView({block:'center'})")
            y0 = page.evaluate("window.scrollY")
            self.assertGreater(y0, 0, "8 条夹具在 390 下应该滚得动")
            page.locator(".kr-index-item").nth(4).locator(".kr-index-link").click()
            page.locator(f"#{fifth['id']}.kanread-card").wait_for()
            self.assertEqual(page.evaluate("location.hash"), "#" + fifth["id"])
            self.assertTrue(page.locator("#kanreadList").is_hidden())
            self.assertGreaterEqual(page.locator(".kr-back").first.bounding_box()["height"], 44)
            self.assertEqual(page.evaluate("document.activeElement.tagName"), "H3", "进单篇焦点落在标题上")
            self.assertIn(fifth["title"], page.title())
            page.go_back()
            page.locator(".kr-index").wait_for(state="visible")
            self.assertLessEqual(abs(page.evaluate("window.scrollY") - y0), 2, "回目录滚动位置没还原")
            self.assertTrue(page.evaluate(
                f"document.activeElement === document.querySelector('.kr-index-item[data-id=\"{fifth['id']}\"] .kr-index-link')"),
                "回目录焦点应落在刚才那篇的链接上")
            self.assertEqual(page.title(), "刊读 · 第二人称")
            page.go_forward()
            page.locator(f"#{fifth['id']}.kanread-card").wait_for()
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V5 深链直达 ──
    def test_v5_deep_link_lands_on_single(self) -> None:
        items = fixture_items()
        third = VISIBLE[2]
        ctx, page, errors = self.open(hash_=third["id"], items=items)
        try:
            page.locator(f"#{third['id']}.kanread-card").wait_for()
            self.assertTrue(page.locator("#kanreadList").is_hidden())
            self.assertIn(third["title"], page.title())
            page.locator(".kr-back").first.click()
            page.locator(".kr-index").wait_for(state="visible")
            self.assertEqual(page.evaluate("location.hash"), "", "回目录后 URL 不该带 hash")
            self.assertEqual(page.evaluate("window.scrollY"), 0)
            page.go_back()
            page.locator(f"#{third['id']}.kanread-card").wait_for()
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V6 对不上的 hash ──
    def test_v6_unknown_hash_falls_back_to_index_with_notice(self) -> None:
        items = fixture_items()
        draft_id = next(it["id"] for it in items if it["status"] == "draft")
        for hash_, want_notice in (("kr-nope", True), (draft_id, True)):
            with self.subTest(hash=hash_):
                ctx, page, errors = self.open(hash_=hash_, items=items)
                try:
                    page.locator(".kr-index").wait_for(state="visible")
                    st = page.locator("#krStatus")
                    self.assertTrue(st.is_visible())
                    self.assertIn("没找到", st.inner_text())
                    self.assertEqual(page.evaluate("location.hash"), "", "对不上的 hash 要清掉")
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()
        # 坏的 % 编码：不许抛 pageerror，回目录、不提示
        ctx, page, errors = self.open(hash_="%E0%A4%A", items=items)
        try:
            page.locator(".kr-index").wait_for(state="visible")
            self.assertTrue(page.locator("#krStatus").is_hidden())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V7 单篇之间换篇 ──
    def test_v7_single_to_single_switch(self) -> None:
        items = fixture_items()
        a, b = VISIBLE[0]["id"], VISIBLE[1]["id"]
        ctx, page, errors = self.open(hash_=a, items=items)
        try:
            page.locator(f"#{a}.kanread-card").wait_for()
            page.evaluate(f"location.hash = '{b}'")
            page.locator(f"#{b}.kanread-card").wait_for()
            self.assertEqual(page.locator(".kanread-card").count(), 1, "同一时刻只能有一篇")
            self.assertEqual(page.locator(".kr-comments").count(), 1)
            self.assertTrue(page.locator("#anSheet").is_hidden(), "换篇时弹层必须是关着的")
            # 从单篇跳单篇不写 krBack：点「返回目录」走 pushState 那条路
            page.locator(".kr-back-bottom .kr-back").click()
            page.locator(".kr-index").wait_for(state="visible")
            self.assertEqual(page.evaluate("location.hash"), "")
            # 浏览器后退：回到刚才那一篇 B，而不是 A
            page.go_back()
            page.locator(f"#{b}.kanread-card").wait_for()
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V8 第一屏露出两个标题 ──
    def test_v8_first_screen_shows_two_titles(self) -> None:
        items = fixture_items()
        ctx, page, errors = self.open(items=items)
        try:
            page.locator(".kr-index").wait_for()
            self.assertEqual(page.evaluate("window.scrollY"), 0)
            bottom = page.locator(".kr-index-item").nth(1).locator(".kr-index-title").bounding_box()["y"]
            bottom += page.locator(".kr-index-item").nth(1).locator(".kr-index-title").bounding_box()["height"]
            self.assertLessEqual(bottom, 844, "第一屏要露出第二篇的标题")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V9 宽度与触控（360 与 390，目录与单篇） ──
    def test_v9_width_and_touch(self) -> None:
        items = fixture_items()
        for width in (360, 390):
            for hash_, label in (("", "目录"), (VISIBLE[0]["id"], "单篇")):
                with self.subTest(width=width, view=label):
                    ctx, page, errors = self.open(hash_=hash_, items=items, width=width)
                    try:
                        page.locator(".kanread-card" if hash_ else ".kr-index").first.wait_for()
                        self.assertLessEqual(page.evaluate(OVERFLOW), 0, f"{width} {label} 横向溢出")
                        self.assertEqual(page.evaluate(TOUCH_JS), [], f"{width} {label} 触控目标不足 44")
                        self.assertEqual(errors, [])
                    finally:
                        ctx.close()

    # ── V10 小纸条焦点（真实词条数据，精读 id 从 marks 现取） ──
    def test_v10_ainotes_focus_survives_navigation(self) -> None:
        readings = json.loads((ROOT / "data/ainotes.marks.json").read_text(encoding="utf-8"))["readings"]
        rid = next(iter(readings))
        ctx, page, errors = self.open()
        try:
            # 从目录点进带小纸条的那一篇（走 krBack 流程）
            page.locator(".kr-index").wait_for()
            page.locator(f'.kr-index-item[data-id="{rid}"] .kr-index-link').click()
            page.locator(f"#{rid}.kanread-card").wait_for()
            word = page.locator(f"#{rid} .an-t").first
            word.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertTrue(page.evaluate("document.activeElement === document.getElementById('anX')"),
                            "打开弹层焦点应落在关闭键上")
            page.keyboard.press("Escape")
            self.assertTrue(page.evaluate("el => document.activeElement === el", word.element_handle()),
                            "Esc 后焦点应回到刚才点的词")
            # 再打开弹层，按后退：弹层和遮罩都隐藏，目录回来，焦点不丢出文档
            word.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            page.go_back()
            page.locator(".kr-index").wait_for(state="visible")
            self.assertTrue(page.locator("#anSheet").is_hidden())
            self.assertTrue(page.locator("#anBack").is_hidden())
            self.assertTrue(page.evaluate("document.contains(document.activeElement)"))
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V11 评论只挂一次（假后端）：A → 目录 → B ──
    def test_v11_comments_mount_once_per_single(self) -> None:
        fake = FakeAPI()
        items = fixture_items()
        a, b = VISIBLE[0]["id"], VISIBLE[1]["id"]
        ctx, page, errors = self.open(f"?api={MOCK}", hash_=a, items=items, fake=fake)
        try:
            page.locator(f"#{a} .kr-comments .rjc-list").wait_for()
            self.assertEqual(page.locator(".kr-comments .rjc-list").count(), 1, "A 的评论区挂了不止一次")
            self.assertEqual(fake.comment_targets()[-1], f"kanread:{a}")
            # 回目录（深链进来的 A：pushState 那条路）
            page.locator(".kr-back").first.click()
            page.locator(".kr-index").wait_for(state="visible")
            # 点进 B
            page.locator(f'.kr-index-item[data-id="{b}"] .kr-index-link').click()
            page.locator(f"#{b} .kr-comments .rjc-list").wait_for()
            self.assertEqual(page.locator(".kr-comments .rjc-list").count(), 1, "B 的评论区挂了不止一次")
            self.assertEqual(page.locator(".kanread-card").count(), 1)
            self.assertEqual(fake.comment_targets()[-1], f"kanread:{b}", "最后一次评论请求的 target 应是 B")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V12 没有 JS ──
    def test_v12_no_js_shows_noscript_line(self) -> None:
        ctx, page, errors = self.open(js=False)
        try:
            self.assertTrue(page.locator(".kr-noscript").is_visible())
            self.assertIn("开启 JavaScript", page.locator(".kr-noscript").inner_text())
            self.assertFalse(page.locator(".kanread-list .log-state").is_visible(), "没有 JS 时「正在翻页」要藏着")
            self.assertEqual(page.locator("nav.boards a").count(), 7)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── V13 原文失效的条目 ──
    def test_v13_stale_item(self) -> None:
        items = fixture_items()
        stale = next(it for it in items if it["status"] == "unavailable")
        ctx, page, errors = self.open(items=items)
        try:
            page.locator(".kr-index").wait_for()
            li = page.locator(f'.kr-index-item[data-id="{stale["id"]}"]')
            self.assertIn("原文入口已失效", li.inner_text())
            li.locator(".kr-index-link").click()
            page.locator(f"#{stale['id']}.kanread-card").wait_for()
            card = page.locator(f"#{stale['id']}")
            self.assertIn("原文入口已失效", card.locator(".kr-stale").inner_text())
            self.assertEqual(card.locator(".btn-source").count(), 0, "失效条目不许出原文按钮")
            self.assertEqual(errors, [])
        finally:
            ctx.close()
    # ── V14 首页横条：取最新一篇直达单篇；取数失败保持兜底 ──
    def test_v14_home_strip_reads_latest(self) -> None:
        items = fixture_items()
        latest = max((it for it in items if it["status"] in ("verified", "unavailable")),
                     key=lambda it: it["published_at"])
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        body = json.dumps(payload(items), ensure_ascii=False)
        page.route("**/data/kanread.json",
                   lambda route, _r: route.fulfill(status=200, content_type="application/json", body=body))
        try:
            page.goto(f"{self.base}/index.html", wait_until="networkidle")
            strip = page.locator(".kanread-strip")
            strip.wait_for()
            page.wait_for_function(
                "document.querySelector('.kanread-strip').getAttribute('href') !== 'kanread.html'")
            self.assertEqual(strip.locator(".ks-body strong").inner_text(), latest["title"])
            self.assertEqual(strip.locator(".ks-label").inner_text(), "刊读 · 最新精读")
            self.assertIn(latest["hook"], strip.locator(".ks-body em").inner_text())
            self.assertEqual(strip.locator(".ks-go").inner_text(), "读这一篇 →")
            self.assertEqual(strip.get_attribute("href"), f"kanread.html#{latest['id']}")
            # 点过去直达那一篇单篇
            strip.click()
            page.locator(f"#{latest['id']}.kanread-card").wait_for()
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 取数失败：保持静态兜底，console 零错误
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/kanread.json", lambda route, _r: route.fulfill(status=404, body=""))
        try:
            page.goto(f"{self.base}/index.html", wait_until="networkidle")
            strip = page.locator(".kanread-strip")
            strip.wait_for()
            page.wait_for_timeout(300)
            self.assertEqual(strip.get_attribute("href"), "kanread.html", "取数失败要保持兜底链接")
            self.assertEqual(strip.locator(".ks-body strong").inner_text(), "精读目录")
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
