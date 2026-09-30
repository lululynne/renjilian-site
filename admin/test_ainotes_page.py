#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""小纸条频道页（刀 4）的静态契约测试（2026-09-30）。

守：骨架、搜索框、状态与 noscript、两档（没有 off）、数据接线、标签表与录入规范 v0 一致、
基础词真实存在、样式块位置与零色值、外链安全、勘误入口。
kanread 弹层链接那条（test_kanread_sheet_links_channel）随 C3 加入。
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = "ainotes.html"
JS = "ainotes.js"

# 录入规范 v0 第五节的 27 个标签
TAGS_V0 = {
    "概念", "公司", "产品", "模型", "人物", "事件",
    "计费", "编程", "设计", "写作与办公", "建站", "生图", "语音", "记忆", "陪伴", "人机恋相关",
    "终端", "桌面", "网页", "插件", "云端", "开源",
    "国产", "国内可用",
    "OpenAI", "Anthropic", "Google",
}


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def load(name: str):
    return json.loads(read(name))


class AinotesPageStaticTests(unittest.TestCase):
    def setUp(self) -> None:
        self.html = read(PAGE)
        self.js = read(JS)

    def test_head_and_intro(self) -> None:
        self.assertIn('section-label">AINOTES', self.html)
        self.assertIn("<h2>小纸条</h2>", self.html)
        m = re.search(r'<p class="kr-intro">([^<]+)</p>', self.html)
        self.assertIsNotNone(m)
        self.assertIn("人机百科", m.group(1))
        self.assertLessEqual(len(m.group(1)), 22)
        self.assertIn("小纸条", re.search(r"<title>([^<]+)</title>", self.html).group(1))

    def test_search_box_contract(self) -> None:
        self.assertIn('id="bkQ"', self.html)
        self.assertIn('type="search"', self.html)
        self.assertIn('<label class="bk-q-label" for="bkQ">', self.html)
        self.assertIn('enterkeyhint="search"', self.html)
        self.assertIn('aria-controls="bkList"', self.html)
        self.assertIn('role="search"', self.html)
        self.assertNotIn("<form", self.html)

    def test_status_and_noscript(self) -> None:
        self.assertIn('id="bkCount" role="status"', self.html)
        self.assertIn("这一页要开启 JavaScript 才能查词和筛选。", self.html)
        head = self.html[:self.html.find("</head>")]
        self.assertIn(".bk-search", head[head.find("<noscript>"):], "noscript 样式要藏掉搜索栏")

    def test_two_modes_only(self) -> None:
        self.assertIn('data-mode="brief"', self.html)
        self.assertIn('data-mode="full"', self.html)
        self.assertNotIn('data-mode="off"', self.html, "频道页只有简洁/详细两档")
        self.assertIn("rj.ainotes.mode", self.js)
        self.assertIn("rj.ainotes.on", self.js, "旧键只读兼容要在")

    def test_data_wiring(self) -> None:
        self.assertIn("data/ainotes.json", self.js)
        self.assertIn("data/kanread.json", self.js)
        self.assertEqual(self.js.count("ainotes.drafts.json"), 1, "drafts 只许出现一次（预览那处）")
        self.assertRegex(self.js, r"127\\.0\\.0\\.1\|localhost")
        self.assertIn("preview", self.js)

    def test_tag_table_is_rule_v0_and_covers_data(self) -> None:
        m = re.search(r"TAG_GROUPS = \[(.*?)\n  \];", self.js, re.S)
        self.assertIsNotNone(m, "ainotes.js 里找不到 TAG_GROUPS")
        tags = set(re.findall(r'"([^"]+)"', m.group(1)))
        tags -= {"类型", "话题", "形态", "地区", "厂商"}   # 组名不是标签
        self.assertEqual(tags, TAGS_V0, "标签表必须逐字等于录入规范 v0")
        used = {t for e in load("data/ainotes.json")["items"] for t in e.get("tags", [])}
        self.assertLessEqual(used, TAGS_V0, f"数据里出现表外标签：{used - TAGS_V0}")

    def test_starters_exist(self) -> None:
        m = re.search(r"STARTERS = \[([^\]]*)\]", self.js)
        self.assertIsNotNone(m)
        starters = re.findall(r'"(bk-[a-z0-9-]+)"', m.group(1))
        self.assertTrue(starters, "STARTERS 是空的")
        public = {e["id"] for e in load("data/ainotes.json")["items"]}
        for s in starters:
            self.assertIn(s, public, f"基础词 {s} 不在公开数据里")

    def test_styles_block_no_new_colour(self) -> None:
        css = read("style.css")
        marker = "/* 小纸条频道页 ainotes.html（刀 4）。只用既有 token，不新增色值 */"
        start = css.find(marker)
        self.assertNotEqual(start, -1, "style.css 缺刀 4 样式块")
        an = css.find("/* 小纸条 ainotes */")
        self.assertGreater(start, an, "刀 4 块必须在「小纸条 ainotes」块之后（文件末尾）")
        k3 = css.find("/* 刊读目录与单篇（刀 3） */")
        hidden_rule = css.find("/* hidden 属性")
        self.assertFalse(k3 < start < hidden_rule, "刀 4 块不许插进刀 3 块与 [hidden] 通则之间")
        block = css[start:]
        self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,8}\b", block), [], "刀 4 块出现裸色值")
        self.assertEqual(re.findall(r"\b(?:rgb|hsl)a?\(", block), [], "刀 4 块出现 rgb()/hsl()")

    def test_external_links_safe(self) -> None:
        self.assertIn('rel="noopener noreferrer"', self.js)
        self.assertIn('indexOf("https://") === 0', self.js)

    def test_takedown_contact(self) -> None:
        self.assertRegex(self.html, r"mailto:[\w.\-]+@[\w.\-]+")

    def test_kanread_sheet_links_channel(self) -> None:
        """刀 4 C3：刊读弹层底部加「在小纸条里看这个词 →」。"""
        html = read("kanread.html")
        self.assertIn('id="anGo"', html)
        self.assertIn("在小纸条里看这个词 →", html)
        self.assertIn('"ainotes.html"', html)
        self.assertGreater(html.find('id="anGoWrap"'), html.find('id="anSrcs"'),
                           "anGo 必须在 anSrcs 之后（数量断言守着）")
        row = re.search(r'<p class="an-go-row".*?</p>', html, re.S)
        self.assertIsNotNone(row)
        self.assertNotIn("<svg", row.group(0), "anGo 里不许有 svg（弹层恶意断言守着）")

    def test_no_fake_marks(self) -> None:
        self.assertNotIn('href="#"', self.html)
        self.assertNotIn("施工中", self.html)


if __name__ == "__main__":
    unittest.main()
