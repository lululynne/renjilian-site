#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""年轮时间线的浏览器实测（2026-09-30，年轮刀 1）。

本机静态服务 + 无头 Chromium。不许绑死真实数据的条数与 id：
data/nianlun.json 一律用 page.route 塞测试自己造的夹具（跨三天、多成员、各 level、
有 read、有非 https 来源、有恶意字符串、有 0 格成员），期望值从夹具现算。
只有 test_real_data 一条用真实数据，且条数也从文件现算。
"""
from __future__ import annotations

import functools
import http.server
import json
import threading
import unittest
from datetime import date
from pathlib import Path

from playwright.sync_api import sync_playwright

try:
    from test_second_person_shell import NAV_ORDER
except ImportError:                      # 以 admin.test_ 包方式跑时
    from admin.test_second_person_shell import NAV_ORDER

ROOT = Path(__file__).resolve().parents[1]
PAGE = "nianlun.html"
OVERFLOW = "document.documentElement.scrollWidth - window.innerWidth"
WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]   # date.weekday() 0=周一

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

MEMBERS = [{"id": "alpha", "name": "甲社"}, {"id": "beta", "name": "乙社"},
           {"id": "gamma", "name": "丙社"}, {"id": "delta", "name": "丁社"}]   # gamma/delta 一格都没有


def mk(id_: str, at: str, member: str, level: int, **kw) -> dict:
    it = {"id": id_, "at": at, "member": member, "level": level,
          "tags": ["标签甲"], "line": "这一格的一句话，写够二十个字的最小长度要求。",
          "sources": [{"name": "官方来源", "url": "https://example.com/" + id_}], "read": "", "notes": []}
    it.update(kw)
    return it


FIXTURE_ITEMS = [
    mk("nl-t-d3-a", "2026-09-30T09:30:00+08:00", "alpha", 5, tags=["旗舰"]),
    mk("nl-t-d3-b", "2026-09-30T01:25:00+08:00", "beta", 3, read="kr-openai-devday-2026-plan-sharing"),
    mk("nl-t-d2-a", "2026-09-29T23:40:00+08:00", "alpha", 2,
       sources=[{"name": "非https来源", "url": "http://example.com/x"},
                {"name": "正常来源", "url": "https://example.com/y"}]),
    mk("nl-t-d1-a", "2026-09-28T12:00:00+08:00", "beta", 1),
    mk("nl-t-evil", "2026-09-28T08:00:00+08:00", "alpha", 4,
       line='恶意一句 <img src=x onerror="window.__pwn=1"> 话，长度凑够二十个字。'),
]


def fixture() -> dict:
    return {"schema_version": 1, "updated_at": "2026-09-30", "first_ring": "2026-09-28",
            "members": MEMBERS, "items": FIXTURE_ITEMS}


def day_head(day: str, n: int) -> str:
    d = date(int(day[:4]), int(day[5:7]), int(day[8:10]))
    return f"{d.month} 月 {d.day} 日 · {WEEKDAYS[d.weekday()]} · {n} 格"


class NianlunBrowserTests(unittest.TestCase):
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

    def open(self, query: str = "", hash_: str = "", use_fixture: bool = True,
             width: int = 390, height: int = 844, js: bool = True, timezone: str | None = None):
        kw = {"viewport": {"width": width, "height": height}, "java_script_enabled": js}
        if timezone:
            kw["timezone_id"] = timezone
        ctx = self.browser.new_context(**kw)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        if use_fixture:
            body = json.dumps(fixture(), ensure_ascii=False)
            page.route("**/data/nianlun.json",
                       lambda route, _r: route.fulfill(status=200, content_type="application/json", body=body))
        page.goto(f"{self.base}/{PAGE}{query}{('#' + hash_) if hash_ else ''}", wait_until="networkidle")
        return ctx, page, errors

    # ── 1. 分组、组头、新的在上、时间文字；换浏览器时区显示不变 ──
    def test_grouping_and_time_text_survive_timezones(self) -> None:
        for tz in (None, "America/Los_Angeles"):
            with self.subTest(tz=tz or "本机"):
                ctx, page, errors = self.open(timezone=tz)
                try:
                    page.locator(".nl-item").first.wait_for()
                    heads = page.locator(".nl-day-head").all_inner_texts()
                    expect = [day_head("2026-09-30", 2), day_head("2026-09-29", 1), day_head("2026-09-28", 2)]
                    self.assertEqual(heads, expect)
                    ids = page.locator(".nl-item").evaluate_all("els => els.map(e => e.id)")
                    self.assertEqual(ids, ["nl-t-d3-a", "nl-t-d3-b", "nl-t-d2-a", "nl-t-d1-a", "nl-t-evil"])
                    times = page.locator(".nl-item time").all_inner_texts()
                    self.assertEqual(times, ["09:30", "01:25", "23:40", "12:00", "08:00"])
                    dts = page.locator(".nl-item time").evaluate_all("els => els.map(e => e.getAttribute('datetime'))")
                    self.assertTrue(all(d.endswith("+08:00") for d in dts))
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    # ── 2. 电池图与 level 对应；标签第一个是成员名 ──
    def test_battery_and_tags(self) -> None:
        by_id = {it["id"]: it for it in FIXTURE_ITEMS}
        ctx, page, errors = self.open()
        try:
            page.locator(".nl-item").first.wait_for()
            for id_, it in by_id.items():
                with self.subTest(item=id_):
                    img = page.locator(f"#{id_} .nl-battery")
                    self.assertEqual(img.get_attribute("src"), f"img/nianlun/battery-{it['level']}.svg")
                    self.assertEqual(img.get_attribute("alt"), f"重要度 {it['level']}／5")
                    chips = page.locator(f"#{id_} .nl-tags .chip").all_inner_texts()
                    name = next(m["name"] for m in MEMBERS if m["id"] == it["member"])
                    self.assertEqual(chips[0], name, "第一个标签必须是成员名")
                    self.assertEqual(chips[1:], it["tags"])
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 3. 筛选：点选、?m= 同步、刷新保持、0 格 disabled、未知值回全部、播报、键盘 ──
    def test_member_filter(self) -> None:
        ctx, page, errors = self.open()
        try:
            page.locator(".nl-item").first.wait_for()
            chips = page.locator(".nl-chip")
            self.assertEqual(chips.count(), 1 + len(MEMBERS))
            self.assertIn("5", chips.first.inner_text())          # 全部 5 格
            # 0 格成员 disabled 且读屏说明
            for mid in ("gamma", "delta"):
                c = page.locator(f".nl-chip[data-m='{mid}']")
                self.assertTrue(c.is_disabled())
                self.assertIn("还没有记到", c.get_attribute("aria-label"))
            # 点乙社：只剩乙社的格，?m= 同步，播报
            page.locator(".nl-chip[data-m='beta']").click()
            ids = page.locator(".nl-item").evaluate_all("els => els.map(e => e.id)")
            self.assertEqual(ids, ["nl-t-d3-b", "nl-t-d1-a"])
            self.assertEqual(page.evaluate("location.search"), "?m=beta")
            self.assertEqual(page.locator("#nlStatus").inner_text(), "现在看的是 乙社，共 2 格")
            self.assertEqual(page.locator(".nl-chip[data-m='beta']").get_attribute("aria-checked"), "true")
            # 刷新保持
            page.reload(wait_until="networkidle")
            page.locator(".nl-item").first.wait_for()
            self.assertEqual(page.locator(".nl-item").count(), 2)
            # 回「全部」：query 清掉
            page.locator(".nl-chip[data-m='']").click()
            self.assertEqual(page.locator(".nl-item").count(), 5)
            self.assertEqual(page.evaluate("location.search"), "")
            # 键盘：焦点在「全部」，右键到甲社，再右到乙社（跳过 disabled）
            page.locator(".nl-chip[data-m='']").focus()
            page.keyboard.press("ArrowRight")
            self.assertEqual(page.evaluate("document.activeElement.getAttribute('data-m')"), "alpha")
            self.assertEqual(page.evaluate("location.search"), "?m=alpha")
            page.keyboard.press("ArrowRight")
            self.assertEqual(page.evaluate("document.activeElement.getAttribute('data-m')"), "beta")
            page.keyboard.press("ArrowRight")   # 乙社再右：跳过两个 disabled 回到「全部」
            self.assertEqual(page.evaluate("document.activeElement.getAttribute('data-m')"), "")
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 未知 ?m=：当全部，并清掉 query
        ctx, page, errors = self.open(query="?m=nope")
        try:
            page.locator(".nl-item").first.wait_for()
            self.assertEqual(page.locator(".nl-item").count(), 5)
            self.assertEqual(page.evaluate("location.search"), "")
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        # 带 ?m= 打开直接按它筛
        ctx, page, errors = self.open(query="?m=beta")
        try:
            page.locator(".nl-item").first.wait_for()
            self.assertEqual(page.locator(".nl-item").count(), 2)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 4. 来源链接 rel/target；非 https 只显示名字；read 链到精读 ──
    def test_sources_and_read_link(self) -> None:
        ctx, page, errors = self.open()
        try:
            page.locator(".nl-item").first.wait_for()
            for a in page.locator(".nl-srcs a").all():
                self.assertTrue(a.get_attribute("href").startswith("https://"))
                self.assertEqual(a.get_attribute("target"), "_blank")
                self.assertEqual(a.get_attribute("rel"), "noopener noreferrer")
            mixed = page.locator("#nl-t-d2-a .nl-srcs")
            self.assertEqual(mixed.locator("a").count(), 1)
            self.assertIn("非https来源", mixed.locator("span").inner_text())
            self.assertEqual(mixed.locator("a").get_attribute("href"), "https://example.com/y")
            read = page.locator("#nl-t-d3-b .nl-read a")
            self.assertEqual(read.inner_text(), "读我们的精读 →")
            self.assertEqual(read.get_attribute("href"), "kanread.html#kr-openai-devday-2026-plan-sharing")
            self.assertEqual(page.locator("#nl-t-d3-a .nl-read").count(), 0, "没有 read 的格不出精读链接")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 5. 锚点：滚到那一格并有「就是这一格」提示；对不上的提示并清 hash ──
    def test_anchor(self) -> None:
        ctx, page, errors = self.open(hash_="nl-t-evil")
        try:
            page.locator(".nl-item").first.wait_for()
            el = page.locator("#nl-t-evil")
            self.assertTrue(el.evaluate("e => e.classList.contains('nl-hit')"))
            self.assertIn("就是这一格", page.locator("#nlStatus").inner_text())
            top = el.evaluate("e => e.getBoundingClientRect().top")
            self.assertLess(top, 844, "锚点那格要滚进视口")
            self.assertGreaterEqual(el.evaluate("e => e.getBoundingClientRect().bottom"), 0)
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        ctx, page, errors = self.open(hash_="nl-nope")
        try:
            page.locator(".nl-item").first.wait_for()
            self.assertIn("没找到这一格", page.locator("#nlStatus").inner_text())
            self.assertEqual(page.evaluate("location.hash"), "", "对不上的 hash 要清掉")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 6. 恶意字符串只显示成字面文字 ──
    def test_hostile_line_renders_as_text(self) -> None:
        ctx, page, errors = self.open()
        try:
            page.locator(".nl-item").first.wait_for()
            line = page.locator("#nl-t-evil .nl-line")
            self.assertIn("<img src=x", line.inner_text(), "恶意字符串应原样显示成文字")
            self.assertEqual(page.locator("#nl-t-evil img:not(.nl-battery)").count(), 0,
                             "不许生成 img 元素（电池图不算）")
            self.assertIsNone(page.evaluate("window.__pwn"))
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()

    # ── 7. 404 兜底与 noscript ──
    def test_404_fallback_and_noscript(self) -> None:
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/data/nianlun.json", lambda route, _r: route.fulfill(status=404, body=""))
        try:
            page.goto(f"{self.base}/{PAGE}", wait_until="networkidle")
            self.assertIn("这一页暂时读不出来，稍后再来。", page.locator("#nlList").inner_text())
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            ctx.close()
        ctx, page, errors = self.open(js=False)
        try:
            self.assertTrue(page.locator(".kr-noscript").is_visible())
            self.assertIn("开启 JavaScript", page.locator(".kr-noscript").inner_text())
            self.assertFalse(page.locator(".nl-list .log-state").is_visible())
            self.assertEqual(page.locator("nav.boards a").count(), len(NAV_ORDER))
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    # ── 8. 第一屏两格、360/390 不溢出、触控 ≥44 ──
    def test_first_screen_width_and_touch(self) -> None:
        ctx, page, errors = self.open()
        try:
            page.locator(".nl-item").first.wait_for()
            second = page.locator(".nl-item").nth(1).bounding_box()
            self.assertLessEqual(second["y"] + second["height"], 844, "390×844 第一屏要完整露出至少两格")
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        for width in (360, 390):
            with self.subTest(width=width):
                ctx, page, errors = self.open(width=width)
                try:
                    page.locator(".nl-item").first.wait_for()
                    self.assertLessEqual(page.evaluate(OVERFLOW), 0, f"{width} 横向溢出")
                    self.assertEqual(page.evaluate(TOUCH_JS), [], f"{width} 触控目标不足 44")
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    # ── 9. 真实数据、不拦截：格数 = 数据条数；最底下是「第一圈 · first_ring」 ──
    def test_real_data(self) -> None:
        real = json.loads((ROOT / "data/nianlun.json").read_text(encoding="utf-8"))
        ctx, page, errors = self.open(use_fixture=False)
        try:
            page.locator(".nl-item").first.wait_for()
            self.assertEqual(page.locator(".nl-item").count(), len(real["items"]))
            first = page.locator(".nl-first")
            self.assertIn("第一圈 · " + real["first_ring"], first.inner_text())
            self.assertEqual(page.locator(".nl-first").evaluate_all(
                "els => els.length"), 1)
            self.assertEqual(errors, [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
