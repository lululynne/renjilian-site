#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""刊读 READINGS 契约测试（2026-09-18）。

刊读是外链精读卡：站内只留标题／作者／日期／官方入口／本站摘要与旁白，不整篇转载。
这份守三条边界：
- 壳层跟其它页一致（masthead / sister-footer / 导航只含真实路由，且刊读自己不进导航）；
- 数据契约照 mcps.json 的信封形状，每条必带 https 原文入口与最后核对日期；
- 任何外链都带 target=_blank + rel=noopener noreferrer，摘要有字数上限，防止哪天悄悄变成全文转载。
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = "kanread.html"
DATA = "data/kanread.json"
SCHEMA = "data/kanread.schema.json"
REAL_ROUTES = {"index.html", "games.html", "baibao.html", "codex.html", "kanread.html"}
ALL_PAGES = ("index.html", "games.html", "baibao.html", "codex.html", "changelog.html", "kanread.html", "pulse.html")
QUOTE_CHARS = "「」『』“”‘’\"'"
NAV_BLOCK = re.compile(r'<nav class="boards".*?</nav>', re.S)
ANCHOR = re.compile(r'<a\b[^>]*\bhref="([^"]*)"')
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SUMMARY_MAX = 900
HOOK_MAX = 60


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def load(name: str):
    return json.loads(read(name))


class KanreadShellTests(unittest.TestCase):
    def test_brand_shell(self) -> None:
        html = read(PAGE)
        self.assertIn("<h1>第二人称</h1>", html)
        self.assertIn("SECOND PERSON", html)
        self.assertIn("刊读", html)
        self.assertNotIn("施工中", html)
        self.assertNotIn('href="#"', html)

    def test_kanread_is_in_every_top_nav_and_pulse_is_not(self) -> None:
        """刊读第一篇上线后进顶栏；脉搏是刊读的子页，只走子栏，不占顶栏。"""
        for page in ALL_PAGES:
            with self.subTest(page=page):
                nav = NAV_BLOCK.search(read(page))
                self.assertIsNotNone(nav, f"{page} 缺少 nav.boards")
                hrefs = ANCHOR.findall(nav.group(0))
                self.assertIn("kanread.html", hrefs)
                self.assertNotIn("pulse.html", hrefs)
                for href in hrefs:
                    self.assertIn(href, REAL_ROUTES, f"{page} 导航出现非真实路由 {href}")

    def test_subnav_links_both_rhythms(self) -> None:
        for page, here in (("kanread.html", "kanread.html"), ("pulse.html", "pulse.html")):
            with self.subTest(page=page):
                html = read(page)
                sub = re.search(r'<nav class="subnav".*?</nav>', html, re.S)
                self.assertIsNotNone(sub)
                self.assertEqual(set(ANCHOR.findall(sub.group(0))), {"kanread.html", "pulse.html"})
                self.assertRegex(sub.group(0), rf'href="{here}" class="here"')

    def test_home_keeps_the_strip(self) -> None:
        idx = read("index.html")
        self.assertIn('class="kanread-strip"', idx)

    def test_sister_footer(self) -> None:
        html = read(PAGE)
        self.assertIn('class="wrap sister-footer"', html)
        self.assertIn('href="changelog.html"', html)
        self.assertIn("Moments Maker · 图片创作工具", html)
        self.assertIn("折光所 · AI 画风图鉴", html)
        self.assertNotIn("sister-pending", html)

    def test_external_links_are_safe(self) -> None:
        html = read(PAGE)
        self.assertIn('target="_blank" rel="noopener noreferrer"', html)
        for m in re.finditer(r'<a\b[^>]*href="https://[^"]*"[^>]*>', html):
            tag = m.group(0)
            if "mymomentsmaker.com" in tag or "zheguang.gallery" in tag:
                continue
            self.assertIn('rel="noopener noreferrer"', tag, f"外链缺 rel: {tag}")

    def test_takedown_contact_is_real(self) -> None:
        html = read(PAGE)
        self.assertNotIn("claim@example.com", html)
        self.assertRegex(html, r"mailto:[\w.\-]+@[\w.\-]+")

    def test_no_full_text_reprint_wording(self) -> None:
        html = read(PAGE)
        self.assertIn("站内不转载任何原文", html)

    def test_source_entry_comes_before_the_voices(self) -> None:
        """梅宝 2026-09-18 定的阅读顺序：原文入口在最前 → 人声／机声 → 评论区。

        卡片是 JS 拼的，所以按渲染代码在源码里的先后判序：
        「先读原文」的按钮必须写在「人声 · 摘要」那段之前，评论区占位写在最后。
        """
        html = read(PAGE)
        source_at = html.find("先读原文")
        human_at = html.find("人声 · 摘要")
        machine_at = html.find("机声 · 旁白")
        comments_at = html.find("评论区还没开放")
        self.assertNotEqual(source_at, -1, "卡片缺少「先读原文」主按钮")
        self.assertNotEqual(human_at, -1, "卡片缺少人声段")
        self.assertLess(source_at, human_at, "原文入口必须排在人声之前")
        self.assertLess(source_at, machine_at, "原文入口必须排在机声之前")
        self.assertLess(human_at, comments_at, "评论区必须排在双声之后")
        # 卡底不再重复原文按钮：整张卡只有一个出站按钮，只留最后核对与署名行
        self.assertEqual(html.count("原文 ↗"), 1, "一张卡只许有一个原文入口")
        self.assertNotIn("btn-detail", html, "刊读卡不再用幽灵按钮开原文")
        self.assertIn("最后核对 ", html)
        self.assertIn("kr-credits", html)

    def test_source_button_explains_the_way_back(self) -> None:
        """出去读原文是新标签，本页不动——这句提示必须在，不然读者不知道怎么回来。"""
        html = read(PAGE)
        self.assertIn("新标签打开，读完回到这一页，下面是我们的读法", html)
        btn = re.search(r'<a class="btn-source"[^>]*>', html)
        self.assertIsNotNone(btn, "「先读原文」必须是 a.btn-source")
        self.assertIn('target="_blank"', btn.group(0))
        self.assertIn('rel="noopener noreferrer"', btn.group(0))

    def test_stale_state_survives_the_reorder(self) -> None:
        """原文入口失效的卡仍要把过期态说清楚，不许因为调序被吃掉。"""
        html = read(PAGE)
        self.assertIn("原文入口已失效，最后一次核对是", html)
        self.assertIn('it.status === "unavailable"', html)
        self.assertIn("is-stale", html)

    def test_comment_placeholder_is_honest_and_empty(self) -> None:
        """评论区占位：只说还没开放，不放假输入框、不放假评论。"""
        html = read(PAGE)
        self.assertIn("评论区还没开放。开放后，机机和人类都能在这里说话，id 旁会标明身份。", html)
        self.assertIn('class="kr-comments"', html)
        for fake in ("<textarea", "<input", "<form", "contenteditable"):
            with self.subTest(fake=fake):
                self.assertNotIn(fake, html.lower(), f"评论区占位期不许出现 {fake}")

    def test_new_kanread_styles_add_no_new_colour(self) -> None:
        """色板是拍过板的：调序只准复用既有 token，不准新增色值。"""
        css = read("style.css")
        block = re.search(r"\.kr-source\{.*?\.kr-comments p\{[^}]*\}", css, re.S)
        self.assertIsNotNone(block, "style.css 缺少刊读调序样式块")
        self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,8}\b", block.group(0)), [],
                         "新样式里出现裸色值，应改用 var(--…) token")
        self.assertIn("min-height:44px", css[css.find(".btn-source"):css.find(".btn-source") + 400])


class KanreadDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = load(DATA)
        self.schema = load(SCHEMA)

    def test_envelope_shape_follows_mcps(self) -> None:
        self.assertEqual(self.data["schema_version"], 1)
        self.assertRegex(self.data["updated_at"], DATE)
        self.assertIsInstance(self.data["items"], list)
        self.assertEqual(set(self.data), {"schema_version", "updated_at", "items"})

    def test_schema_file_matches_envelope(self) -> None:
        self.assertEqual(self.schema["required"], ["schema_version", "updated_at", "items"])

    def test_every_item_carries_source_and_verified_date(self) -> None:
        for it in self.data["items"]:
            with self.subTest(item=it.get("id")):
                self.assertRegex(it["id"], r"^kr-[a-z0-9-]+$")
                self.assertTrue(it["title"].strip())
                self.assertTrue(it["source_name"].strip())
                self.assertTrue(it["source_url"].startswith("https://"), "原文入口必须是 https")
                self.assertRegex(it["published_at"], DATE)
                self.assertRegex(it["last_verified"], DATE)
                self.assertIn(it["status"], {"verified", "draft", "unavailable"})

    def test_summaries_stay_summaries(self) -> None:
        for it in self.data["items"]:
            with self.subTest(item=it.get("id")):
                self.assertLessEqual(len(it.get("human_voice", "")), SUMMARY_MAX)
                self.assertLessEqual(len(it.get("machine_voice", "")), SUMMARY_MAX)
                self.assertLessEqual(len(it.get("hook", "")), HOOK_MAX)

    def test_machine_voice_is_labelled_as_ours(self) -> None:
        for it in self.data["items"]:
            if it.get("machine_voice"):
                with self.subTest(item=it.get("id")):
                    self.assertTrue(it.get("machine_byline", "").startswith("机声"),
                                    "旁白必须署名机声，不得冒充原作者或机构")

    def test_public_file_carries_no_drafts(self) -> None:
        """公开数据文件一推上去人人可读，草稿不许躺在里面；草稿文件必须被 .gitignore 挡住。"""
        for it in self.data["items"]:
            self.assertNotEqual(it["status"], "draft", f"{it['id']} 是草稿，应放 data/kanread.drafts.json")
        self.assertIn("data/kanread.drafts.json", read(".gitignore"))

    def test_credits_and_roundtable_are_honest_shapes(self) -> None:
        for it in self.data["items"]:
            with self.subTest(item=it.get("id")):
                for c in it.get("credits", []):
                    self.assertTrue(c["role"].strip() and c["who"].strip())
                for r in it.get("roundtable", []):
                    self.assertTrue(r["who"].strip())
                    self.assertLessEqual(len(r["text"]), 220)

    def test_ids_unique(self) -> None:
        ids = [it["id"] for it in self.data["items"]]
        self.assertEqual(len(ids), len(set(ids)))


class PulseTests(unittest.TestCase):
    """脉搏：只存日期、谁、本站自己的一句话和原始入口——一个字原文都不搬，不嵌第三方平台。"""

    def setUp(self) -> None:
        self.data = load("data/pulse.json")
        self.page = read("pulse.html")
        self.published = {it["id"] for it in load(DATA)["items"] if it["status"] == "verified"}

    def test_envelope(self) -> None:
        self.assertEqual(set(self.data), {"schema_version", "updated_at", "tracking_since", "items"})
        self.assertRegex(self.data["tracking_since"], DATE)

    def test_items_are_sourced_and_dated(self) -> None:
        for it in self.data["items"]:
            with self.subTest(item=it["id"]):
                self.assertRegex(it["id"], r"^pl-\d{8}-[a-z0-9-]+$")
                self.assertRegex(it["date"], DATE)
                self.assertRegex(it["last_verified"], DATE)
                self.assertTrue(it["source_url"].startswith("https://"))
                self.assertIn(it["kind"], {"发布", "报告", "政策", "研究", "观点", "事故"})
                self.assertIn(it["status"], {"verified", "unavailable"})

    def test_our_own_words_only(self) -> None:
        for it in self.data["items"]:
            with self.subTest(item=it["id"]):
                self.assertLessEqual(len(it["line"]), 90)
                self.assertLessEqual(len(it.get("relation", "")), 60)
                for ch in QUOTE_CHARS:
                    self.assertNotIn(ch, it["line"], "脉搏的一句话里不许出现引号：不搬运原文")
                    self.assertNotIn(ch, it.get("relation", ""))

    def test_deep_read_points_to_a_published_card(self) -> None:
        for it in self.data["items"]:
            if "deep_read" in it:
                with self.subTest(item=it["id"]):
                    self.assertIn(it["deep_read"], self.published, "只能链到已公开的精读卡，草稿不许露")

    def test_ids_unique(self) -> None:
        ids = [it["id"] for it in self.data["items"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_page_embeds_nothing_third_party(self) -> None:
        low = self.page.lower()
        for bad in ("<iframe", "platform.twitter.com", "platform.x.com", "pbs.twimg.com", "<script src="):
            self.assertNotIn(bad, low)
        self.assertIn('target="_blank" rel="noopener noreferrer"', self.page)
        self.assertIn("不搬运原文", self.page)
        self.assertIn("不是完整档案", self.page)
        self.assertNotIn("claim@example.com", self.page)


if __name__ == "__main__":
    unittest.main()
