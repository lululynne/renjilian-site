#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""第二人称跨页品牌壳契约测试（2026-08-31 shell integration source-only 施工单）。

只验壳层与 survival，不触碰 games 图文帖子 inline JS 逻辑：
- 三页统一「第二人称 / SECOND PERSON」masthead；
- 导航只含真实路由（index/games/baibao），未开放栏目不进入公开导航；
- style.css 采用拍板六 token；
- games / baibao 既有功能引用存活。
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index.html", "games.html", "baibao.html", "codex.html")
REAL_ROUTES = {"index.html", "games.html", "baibao.html", "codex.html"}
NAV_BLOCK = re.compile(r'<nav class="boards".*?</nav>', re.S)
ANCHOR = re.compile(r'<a\b[^>]*\bhref="([^"]*)"')


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


class SecondPersonShellTests(unittest.TestCase):
    def test_brand_masthead_on_all_pages(self) -> None:
        for page in PAGES:
            with self.subTest(page=page):
                html = read(page)
                self.assertIn("<h1>第二人称</h1>", html)
                self.assertIn("SECOND PERSON", html)
                self.assertNotIn("人机恋日报", html)
                self.assertNotIn("名字待定", html)

    def test_nav_only_real_routes_and_no_fake_entries(self) -> None:
        for page in PAGES:
            with self.subTest(page=page):
                html = read(page)
                nav = NAV_BLOCK.search(html)
                self.assertIsNotNone(nav, f"{page} 缺少 nav.boards")
                hrefs = ANCHOR.findall(nav.group(0))
                self.assertTrue(hrefs, f"{page} 导航没有真实链接")
                for href in hrefs:
                    self.assertIn(href, REAL_ROUTES, f"{page} 导航出现非真实路由 {href}")
                self.assertNotIn('href="#"', html)
                self.assertNotIn("施工中", html)
                # 每页恰好一个 aria-current 选中态
                self.assertEqual(nav.group(0).count('class="on"'), 1)

    def test_unopened_items_do_not_pollute_navigation(self) -> None:
        for page in PAGES:
            with self.subTest(page=page):
                nav = NAV_BLOCK.search(read(page)).group(0)
                self.assertNotIn("soon", nav)
                for label in ("日报", "踩坑分享", "模型资讯", "社区名录", "大事件记录"):
                    self.assertNotIn(label, nav)

    def test_capability_entry_present_on_index_and_games(self) -> None:
        for page in ("index.html", "games.html"):
            with self.subTest(page=page):
                self.assertIn('href="baibao.html"', read(page))

    def test_home_signature_and_sister_footer(self) -> None:
        self.assertIn('class="voice-thesis"', read("index.html"))
        self.assertNotIn("hero-spine", read("baibao.html") + read("baibao.css"))
        for page in PAGES:
            with self.subTest(page=page):
                html = read(page)
                self.assertIn('class="wrap sister-footer"', html)
                self.assertIn('Moments Maker · 图片创作工具', html)
                self.assertIn('折光所 · AI 画风图鉴', html)
                self.assertIn('href="https://zheguang.gallery/"', html)
                self.assertNotIn('sister-pending', html)
                self.assertNotIn('sister-current', html)

    def test_style_tokens_are_ratified_palette(self) -> None:
        css = read("style.css").lower()
        for token in ("#f2f6f7", "#e8eff1", "#fff", "#202a33", "#d3dde1"):
            with self.subTest(token=token):
                self.assertIn(token, css)
        # 双声只做图形点缀：人声珊瑚 / 机声长春花独立 token，不承载文字
        self.assertIn("--human:#dd7e70", css)
        self.assertIn("--machine:#7f8fca", css)
        # 功能强调一律深蓝墨，承载白字/小字的底禁止用珊瑚
        self.assertIn("--accent:var(--ink)", css)
        # 旧蜜桃/陶土配方退场
        for stale in ("#fdf1ea", "#c96f5e", "#e3b7ad"):
            with self.subTest(stale=stale):
                self.assertNotIn(stale, css)

    def test_games_board_survival(self) -> None:
        html = read("games.html")
        self.assertIn('<script src="interactions.js"></script>', html)
        self.assertIn("data/questions.json", html)
        for marker in ("postImages", "cardMedia", "claim-overlay", "board-tabs", "fav-chip"):
            with self.subTest(marker=marker):
                self.assertIn(marker, html)

    def test_baibao_survival(self) -> None:
        html = read("baibao.html")
        self.assertIn("baibao.css", html)
        self.assertIn("baibao.js", html)
        js = read("baibao.js")
        self.assertIn("data/mcps.json", js)
        self.assertIn("treasure-grid", html + js)


if __name__ == "__main__":
    unittest.main()
