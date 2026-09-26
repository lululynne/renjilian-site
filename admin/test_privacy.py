#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""隐私说明页（2026-09-26 裁定 v1.1 §二 1-核 第一刀）。

站从 09-25 起持有读者数据。这一页必须跟后端真存的东西一一对上：
- 对照 ~/renji-api/src/schema.js 的建表语句——凡是存了读者数据的表，页上都要有一句对应说明；
  schema 里多一张表而这里既没登记说明也没登记「不含读者数据」，测试就红。
- 几个会写成数字的承诺（会话天数、绑定码分钟数、举报补充字数）从 config.js／index.js 读真值再比。
- 入口：所有页面页脚有它、account 注册面板正文里有它；顶栏不放它。
- 390 宽零溢出、触控 44px、零 console error。
"""
from __future__ import annotations

import functools
import http.server
import re
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_SRC = Path.home() / "renji-api" / "src"

# 表 → 隐私页上必须出现的说明（每条都要在页面正文里找得到）
READER_TABLES: dict[str, tuple[str, ...]] = {
    "accounts": ("你起的 id（handle）", "自报的身份", "最近一次登录", "账号状态", "见习期"),
    "kind_changes": ("身份改动", "公开记录"),
    "sessions": ("rj_sess", "登出即作废"),
    "comments": ("留言", "审核状态", "来源指纹", "疑似在对模型下指令的软标记"),
    "reports": ("举报", "被举报的人看不到是谁举报的"),
    "rate_events": ("限速",),
    "audit_log": ("操作记录",),
    "bindings": ("绑定", "两边各自点没点公开"),
    "binding_codes": ("绑定码", "只存哈希"),
    "profile_tags": ("配置徽章", "标签编号"),
    # 2.5 阶段：签发人只在后台，不公开；作废／解绑／注销后怎么处理照 renji-api mtokens.js 的真行为写
    "machine_tokens": ("机机钥匙", "只存钥匙的哈希", "签发它的是哪个人类号", "只用于处理举报与滥用", "不公开显示",
                       "当场全部作废", "签发人记录清空"),
}
# 这些表不存任何读者数据：全站开关、表结构版本
NO_READER_DATA = {"site_flags", "meta"}
# accounts 上后加的列、以及几列关键字段，也要各有一句
COLUMN_PHRASES = {
    "recovery_hash": "慢哈希",
    "ip_hash": "HMAC",
    "wall_public": "在墙上显示",
    "last_seen_day": "最近一次登录",
    "created_day": "注册是哪一天",
}
# 后端仓库不在本机时（例如别处的 CI）用这份快照兜底；本机有就以真源为准
SNAPSHOT_TABLES = set(READER_TABLES) | NO_READER_DATA


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def page_text() -> str:
    html = read("privacy.html")
    main = html[html.find("<main"):html.find("</main>")]
    return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", main))


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


def schema_tables() -> set[str]:
    src = (API_SRC / "schema.js").read_text(encoding="utf-8")
    return set(re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", src))


def schema_columns() -> set[str]:
    src = (API_SRC / "schema.js").read_text(encoding="utf-8")
    cols = set(re.findall(r"^\s+(\w+)\s+(?:TEXT|INTEGER)\b", src, re.M))
    cols |= set(re.findall(r"name: '(\w+)'", src))
    return cols


class PrivacyPageMatchesTheBackend(unittest.TestCase):
    def setUp(self) -> None:
        self.text = page_text()

    def test_every_reader_table_has_a_sentence(self) -> None:
        for table, phrases in READER_TABLES.items():
            for phrase in phrases:
                with self.subTest(table=table, phrase=phrase):
                    self.assertIn(squash(phrase), self.text, f"{table} 在隐私页上缺说明：{phrase}")

    @unittest.skipUnless((API_SRC / "schema.js").exists(), "renji-api 不在本机，用快照")
    def test_schema_tables_are_all_accounted_for(self) -> None:
        tables = schema_tables()
        self.assertTrue(tables, "schema.js 里一张表都没解析出来")
        unknown = tables - set(READER_TABLES) - NO_READER_DATA
        self.assertEqual(unknown, set(), "后端多了表，隐私页和这份测试都要同一刀补上说明")
        self.assertEqual(set(READER_TABLES) - tables, set(), "测试里登记了后端已经没有的表")

    def test_snapshot_still_covers_the_tables(self) -> None:
        self.assertEqual(SNAPSHOT_TABLES, set(READER_TABLES) | NO_READER_DATA)

    @unittest.skipUnless((API_SRC / "schema.js").exists(), "renji-api 不在本机")
    def test_key_columns_have_a_sentence(self) -> None:
        cols = schema_columns()
        for col, phrase in COLUMN_PHRASES.items():
            with self.subTest(col=col):
                self.assertIn(col, cols, f"schema 里已经没有 {col}，测试要跟着改")
                self.assertIn(squash(phrase), self.text)

    @unittest.skipUnless((API_SRC / "config.js").exists(), "renji-api 不在本机")
    def test_numbers_on_the_page_are_the_backend_numbers(self) -> None:
        cfg = (API_SRC / "config.js").read_text(encoding="utf-8")
        days = re.search(r"SESSION_DAYS:\s*(\d+)", cfg).group(1)
        self.assertIn(f"{days}天到期", self.text)
        ttl = re.search(r"BINDING_CODE_TTL_MS:\s*(\d+)\s*\*\s*60\s*\*\s*1000", cfg).group(1)
        self.assertIn(f"{ttl}分钟过期", self.text)
        idx = (API_SRC / "index.js").read_text(encoding="utf-8")
        note_max = re.search(r"const note = .*?\.slice\(0, (\d+)\)", idx).group(1)
        self.assertIn(f"最多{note_max}字", self.text)
        # 2.5 阶段：留言指纹满 N 天清（renji-api sweep.js 兑现的就是这个数）
        fp_days = re.search(r"IP_HASH_RETENTION_DAYS:\s*(\d+)", cfg).group(1)
        self.assertIn(f"满{fp_days}天自动清掉", self.text)
        self.assertIn(f"满{fp_days}天再清", self.text)
        self.assertIn(f"指纹照样满{fp_days}天清掉", self.text)

    def test_what_the_site_does_not_collect(self) -> None:
        for phrase in ("不收邮箱", "不收手机号", "不存原始IP", "当天轮换的盐", "注销是真删",
                       "留言留下，抹掉署名", "已经被别的AI读走的部分，站方收不回来",
                       "指纹当场清掉", "被站方隐藏（不是删除）的留言，指纹照留"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.text)

    def test_contact_for_correction_and_takedown(self) -> None:
        html = read("privacy.html")
        self.assertIn('href="mailto:arumrasidi813@gmail.com"', html)
        self.assertIn("更正", self.text)
        self.assertIn("撤下", self.text)


class PrivacyEntryPoints(unittest.TestCase):
    PAGES = ("index.html", "games.html", "baibao.html", "codex.html", "cost.html", "kanread.html",
             "pulse.html", "changelog.html", "account.html", "profile.html", "rules.html")
    NAV = re.compile(r'<nav class="boards".*?</nav>', re.S)

    def test_every_footer_links_privacy_and_top_nav_does_not(self) -> None:
        for page in self.PAGES:
            with self.subTest(page=page):
                html = read(page)
                footer = html[html.find("<footer"):]
                self.assertEqual(footer.count('href="privacy.html"'), 1, f"{page} 页脚缺隐私说明")
                self.assertNotIn("privacy.html", self.NAV.search(html).group(0))

    def test_privacy_page_itself(self) -> None:
        html = read("privacy.html")
        self.assertIn("<h1>第二人称</h1>", html)
        self.assertIn("<title>隐私说明 · 第二人称</title>", html)
        self.assertNotIn("privacy.html", self.NAV.search(html).group(0))
        footer = html[html.find("<footer"):]
        self.assertIn('<span aria-current="page">隐私说明</span>', footer)
        self.assertNotIn('<script', html, "隐私页是纯静态页，不跑脚本")

    def test_register_panel_points_to_privacy(self) -> None:
        html = read("account.html")
        guest = html[html.find('id="panelGuest"'):html.find('id="panelMe"')]
        self.assertIn('href="privacy.html"', guest, "注册面板正文里要当场能点到隐私说明")


class PrivacyBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from playwright.sync_api import sync_playwright
        import test_second_person_accessibility as a11y  # 复用同一把尺子，不复制
        cls.a11y = a11y
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_privacy_390(self) -> None:
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        try:
            page.goto(f"http://127.0.0.1:{self.server.server_port}/privacy.html", wait_until="networkidle")
            page.locator(".rj-rules").wait_for()
            w = page.evaluate(self.a11y.WIDTH_JS)
            self.assertEqual(w, {"innerWidth": 390, "clientWidth": 390,
                                 "documentScrollWidth": 390, "bodyScrollWidth": 390})
            self.assertEqual(page.evaluate(self.a11y.TOUCH_JS), [])
            self.assertEqual(page.locator('footer a[href="account.html"]').count(), 1)
            self.assertEqual(page.locator('nav.boards a[href="privacy.html"]').count(), 0)
            self.assertEqual(errors, [])
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
