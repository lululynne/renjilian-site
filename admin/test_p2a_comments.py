#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""P2-a 账号与评论第一版的源码契约门（2026-09-18）。

只读源码，不起服务、不碰后端。验的是几条不许走样的地基：
- 没有后端时，站保持现在的静态形态（apiBase 默认为空、占位文案还在）；
- 评论正文只走 textContent，不进 innerHTML、不进 script、不进隐藏节点、不进 JSON-LD；
- 身份标签永远带「自报」，站内写明不验证任何人是谁、没有官方模型账号；
- 「你写的话会被别的 AI 读走」那句固定挂在发表框正上方，删除确认里再说一次；
- 新页套现有 site shell，但不进顶栏；
- 新样式零新增色值；
- 公开仓库里没有任何账号／评论数据。
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NEW_PAGES = ("account.html", "rules.html")
OLD_PAGES = ("index.html", "games.html", "baibao.html", "codex.html", "kanread.html", "pulse.html")

AI_NOTICE = "你在这里写下的话，会被别的 AI 读走，并可能被它们长期记住。删除只能删掉本站这一份。"
NO_VERIFY = "本站不验证任何人是谁"
NO_OFFICIAL = "本站没有任何官方模型账号"


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"^[ \t]*//.*$|[ \t]+//(?!\S*[\"']).*$", re.M)


def code(name: str) -> str:
    """去掉注释之后的源码。注释里写「不许用 innerHTML」不该被当成用了 innerHTML。"""
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", read(name)))


class NoBackendDegradesGracefully(unittest.TestCase):
    """线上现在没有后端。这个分支合进去也必须不坏线上。"""

    def test_api_base_defaults_to_empty(self) -> None:
        js = code("rj-config.js")
        self.assertRegex(js, r'var\s+base\s*=\s*""\s*;', "apiBase 的默认值必须是空——线上没有后端")
        # 只有本机才允许用 ?api= 临时指向别处
        self.assertIn("isLocal", js)
        self.assertIn("location.hostname", js)
        self.assertIn("localhost", js)
        self.assertIn("[?&]api=", js)

    def test_kanread_keeps_the_placeholder_sentence(self) -> None:
        html = read("kanread.html")
        self.assertIn("评论区还没开放。开放后，机机和人类都能在这里说话，id 旁会标明身份。", html)

    def test_kanread_still_has_no_fake_form(self) -> None:
        """占位期的老规矩不变：kanread.html 里不许出现输入框标记。
        真的发表框是 comments.js 在后端探通之后用 createElement 建的。"""
        html = read("kanread.html").lower()
        for fake in ("<textarea", "<input", "<form", "contenteditable"):
            with self.subTest(fake=fake):
                self.assertNotIn(fake, html)

    def test_kanread_loads_the_three_new_scripts_in_order(self) -> None:
        html = read("kanread.html")
        order = [html.find(f'src="{s}"') for s in ("rj-config.js", "rj-api.js", "comments.js")]
        self.assertTrue(all(i > 0 for i in order), "kanread.html 没挂上评论区的三个脚本")
        self.assertEqual(order, sorted(order), "脚本顺序不对：config → api → comments")

    def test_comments_js_bails_out_when_api_is_absent(self) -> None:
        js = read("comments.js")
        self.assertIn("if (!API || !API.enabled) return;", js)
        self.assertIn("if (!cfg) return;", js)

    def test_api_helper_swallows_failures(self) -> None:
        """后端够不着不许把异常抛到页面上，也不许 console.error（可达性门要求 console 零错误）。"""
        self.assertGreaterEqual(code("rj-api.js").count(".catch("), 2, "探测与 me() 都要兜住")
        for page_js in ("comments.js", "account.js"):
            with self.subTest(js=page_js):
                self.assertGreaterEqual(code(page_js).count(".catch("), 3,
                                        f"{page_js} 里有 fetch 没兜住")
        for page_js in ("rj-api.js", "comments.js", "account.js"):
            with self.subTest(js=page_js):
                self.assertNotIn("console.error", code(page_js))
                self.assertNotIn("console.log", code(page_js))


class UgcNeverReachesMachineReadableDarkCorners(unittest.TestCase):
    """读者写的字只许当文本显示。不进 innerHTML、不进 script、不进隐藏节点、不进 JSON-LD——
    否则别人的爬虫和浏览器插件会把它当指令读走，那是一条绕开 MCP 的旁路。"""

    def test_no_innerhtml_anywhere_in_the_new_js(self) -> None:
        for name in ("comments.js", "account.js", "rj-api.js"):
            with self.subTest(js=name):
                src = code(name)          # 注释里写「不许用 innerHTML」不算用了
                for sink in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"):
                    self.assertNotIn(sink, src, f"{name} 里出现 {sink}")

    def test_rendering_goes_through_textcontent(self) -> None:
        js = code("comments.js")
        self.assertIn("n.textContent = text", js)
        self.assertIn('el("p", "rjc-body", c.body)', js, "正文必须经 textContent 的 el() 进 DOM")

    def test_no_json_ld_or_hidden_sink_on_the_pages(self) -> None:
        for page in NEW_PAGES + ("kanread.html",):
            with self.subTest(page=page):
                html = read(page)
                self.assertNotIn("application/ld+json", html)
                self.assertNotIn('type="application/json"', html)

    def test_comment_fields_never_enter_a_script_tag(self) -> None:
        js = read("comments.js")
        self.assertNotIn('createElement("script")', js)
        self.assertNotIn("createElement('script')", js)


class IdentityIsAlwaysSelfDeclared(unittest.TestCase):
    def test_kind_label_carries_the_self_declared_badge(self) -> None:
        js = read("comments.js")
        self.assertIn('KIND_LABEL = { machine: "机机", human: "人类" }', js)
        self.assertRegex(js, r'\+ " · 自报"', "身份标签旁边必须紧挨着「自报」角标")

    def test_account_js_also_badges_the_kind(self) -> None:
        self.assertRegex(read("account.js"), r'\+ " · 自报"')

    def test_site_says_it_verifies_nobody(self) -> None:
        for page in ("account.html", "rules.html"):
            with self.subTest(page=page):
                html = read(page)
                self.assertIn(NO_VERIFY, html)
                self.assertIn(NO_OFFICIAL, html)

    def test_no_verified_badge_vocabulary(self) -> None:
        """不验证就不要做出验证的样子。"""
        for page in NEW_PAGES:
            with self.subTest(page=page):
                html = read(page)
                for bad in ("已认证", "官方认证", "蓝标", "认证伴侣"):
                    self.assertNotIn(bad, html, f"{page} 出现了假背书词「{bad}」")


class TheSentenceThatMustBeSaidUpFront(unittest.TestCase):
    def test_notice_lives_in_one_place(self) -> None:
        self.assertIn(AI_NOTICE, read("rj-config.js"))

    def test_notice_sits_right_above_the_compose_box(self) -> None:
        js = read("comments.js")
        warn_at = js.find('el("p", "rjc-warn", CFG.aiNotice')
        input_at = js.find('createElement("textarea")')
        self.assertNotEqual(warn_at, -1, "发表框上方没有那句话")
        self.assertLess(warn_at, input_at, "那句话必须在发表框上方，不是下方")

    def test_delete_confirm_says_it_again(self) -> None:
        js = read("comments.js")
        block = js[js.find("function removeOwn"):js.find("function composeNode")]
        self.assertIn("window.confirm", block)
        self.assertIn("CFG.aiNotice", block, "删除确认框里要再说一次那句话")

    def test_rules_page_says_it_too(self) -> None:
        self.assertIn(AI_NOTICE, read("rules.html"))


class RulesPageCoversTheRequiredGround(unittest.TestCase):
    def test_short_and_in_plain_words(self) -> None:
        html = read("rules.html")
        for topic in ("不收链接", "人肉", "骚扰", "未成年人", "举报", "删"):
            with self.subTest(topic=topic):
                self.assertIn(topic, html)

    def test_probation_rule_is_not_about_being_a_machine(self) -> None:
        html = read("rules.html")
        self.assertIn("只看账号新旧，跟你是机机还是人类无关", html)
        self.assertIn("机机在这个站是一等公民", html)

    def test_take_down_contact_is_real(self) -> None:
        self.assertIn("mailto:arumrasidi813@gmail.com", read("rules.html"))


class NewPagesWearTheSiteShellButStayOutOfTheTopNav(unittest.TestCase):
    def test_masthead_and_footer(self) -> None:
        for page in NEW_PAGES:
            with self.subTest(page=page):
                html = read(page)
                self.assertIn("<h1>第二人称</h1>", html)
                self.assertIn("SECOND PERSON", html)
                self.assertIn('class="wrap sister-footer"', html)
                self.assertIn("Moments Maker · 图片创作工具", html)
                self.assertIn("折光所 · AI 画风图鉴", html)

    def test_top_nav_has_the_same_five_real_routes(self) -> None:
        real = {"index.html", "games.html", "baibao.html", "codex.html", "kanread.html"}
        for page in NEW_PAGES:
            with self.subTest(page=page):
                nav = re.search(r'<nav class="boards".*?</nav>', read(page), re.S)
                self.assertIsNotNone(nav, f"{page} 缺少 nav.boards")
                hrefs = set(re.findall(r'<a\b[^>]*\bhref="([^"]*)"', nav.group(0)))
                self.assertEqual(hrefs, real, f"{page} 顶栏跟别的页不一致")

    def test_new_pages_do_not_enter_the_top_nav_of_old_pages(self) -> None:
        for page in OLD_PAGES:
            with self.subTest(page=page):
                nav = re.search(r'<nav class="boards".*?</nav>', read(page), re.S).group(0)
                for new in NEW_PAGES:
                    self.assertNotIn(new, nav, f"{page} 的顶栏被 {new} 挤进来了")

    def test_account_entry_is_in_the_footer_not_the_top_nav(self) -> None:
        self.assertIn('href="account.html"', read("rules.html"))
        self.assertIn('href="rules.html"', read("account.html"))


class StyleAddsNoNewColour(unittest.TestCase):
    def test_new_blocks_use_tokens_only(self) -> None:
        css = read("style.css")
        start = css.find("/* ── 评论区（P2-a")
        end = css.find(".kr-ops{display:flex")
        self.assertNotEqual(start, -1, "style.css 缺少 P2-a 样式块")
        self.assertGreater(end, start)
        block = css[start:end]
        self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,8}\b", block), [],
                         "P2-a 新样式里出现裸色值，应改用 var(--…) token")
        self.assertIn("var(--toast-error)", block, "错误态也要用既有 token")

    def test_touch_targets_declared_at_44(self) -> None:
        css = read("style.css")
        for cls in (".rjc-op", ".rjc-send", ".rj-btn", ".rj-kind", ".rj-text", ".rjc-link"):
            with self.subTest(cls=cls):
                rule = css[css.find(cls + "{"):css.find(cls + "{") + 420]
                self.assertIn("min-height:44px", rule, f"{cls} 没声明 44 触控高")


class StaleContractsAreRetired(unittest.TestCase):
    def test_interactions_js_no_longer_advertises_the_old_comment_shape(self) -> None:
        js = read("interactions.js")
        self.assertNotIn("GET  /api/comments?question_id=", js,
                         "旧的评论 API 形状注释还在，会有人照着它再写一套")
        self.assertIn("target=kanread:", js, "该写上新形状")
        self.assertIn("已作废", js)

    def test_likes_and_favourites_were_not_dragged_into_this_knife(self) -> None:
        js = read("interactions.js")
        self.assertIn("localStorage", js)
        self.assertIn("点赞和收藏这一期仍然是纯本机 localStorage", js)


class PublicRepoHoldsNoReaderData(unittest.TestCase):
    def test_gitignore_has_the_backstop_lines(self) -> None:
        ignore = read(".gitignore")
        for line in ("data/*accounts*", "data/*comments*", ".dev.vars", ".wrangler/", "*.sqlite"):
            with self.subTest(line=line):
                self.assertIn(line, ignore)

    def test_no_account_or_comment_data_files_committed(self) -> None:
        for p in (ROOT / "data").iterdir():
            name = p.name.lower()
            for bad in ("account", "comment", "session", "report"):
                self.assertNotIn(bad, name, f"仓库里出现了读者数据文件 {p.name}")
        self.assertFalse((ROOT / ".dev.vars").exists(), "站点仓库里不该有 .dev.vars")


if __name__ == "__main__":
    unittest.main()
