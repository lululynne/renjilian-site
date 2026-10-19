"""完整v3写作合同与两页浏览器行为；全部扩展内容是显式夹具，不是投稿验收。"""
from __future__ import annotations

import copy
import json
import os
import unittest
from pathlib import Path

from admin.test_ainotes import check
from admin import test_ainotes_page_browser as channel_harness
from admin import test_ainotes_browser as reading_harness

ent = channel_harness.ent
CARD = reading_harness.CARD
flat_marks = reading_harness.flat_marks

ROOT = Path(__file__).resolve().parents[1]


def v3(id_="bk-v3-example", **changes):
    e = ent(id_, "验收示例模型", "Fixture model", brief="①干嘛的：示例模型。②对你有啥用：做演示。③要什么设备：浏览器。④上手难度：普通人能上手。⑤面向谁、哪能用：演示读者；地区待核。⑥强在哪：只用于展示验收。⑦谁家的、现在：示例公司；在用。",
            line="这是展示验收用的示例，不是已发布的真实模型。", more="模型详情夹具", for_us="本站使用建议夹具", aliases=["示例别名"],
            for_whom="内容创作者", helps_with="整理素材", device="浏览器即可", difficulty="普通人能上手（本站判断）",
            region="开放地区待核", edge="只用于展示验收，不是性能结论", use_tags=["设计与绘图", "公司"],
            owner="示例公司", what="用于验收的模型", where_used="示例网页入口", access="示例账号条件",
            timeline="2026-10-19：展示验收", reception="暂无公开评价", company={"full_name": "Fixture Research Inc.", "type": "示例公司", "business": "示例研发"},
            lifecycle={"state": "在用", "date": "2026-10-19", "note": "模型状态夹具", "source": {"name": "状态来源", "url": "https://example.com/state"}},
            nianlun_seen=["年轮-模型动态-20261017.md"], seen_in=["每日AI整合-20261017"])
    e.update(changes)
    return e


class V3ContractTests(unittest.TestCase):
    def validate(self, rows, version):
        schema = json.loads((ROOT / "data/ainotes.schema.json").read_text())
        return check({"schema_version": version, "updated_at": "2026-10-19", "items": rows}, schema, "$")

    def test_versioned_complete_and_legacy_contract(self):
        legacy = json.loads((ROOT / "data/ainotes.json").read_text())["items"][0]
        self.assertEqual(len(v3()), 31)
        self.assertEqual(self.validate([legacy], 1), [])
        self.assertEqual(self.validate([legacy, v3()], 2), [])
        self.assertTrue(self.validate([v3()], 1), "v1必须继续保留旧字段合同")
        missing = v3(); del missing["region"]
        self.assertTrue(self.validate([missing], 2))
        self.assertTrue(self.validate([v3(extra="未知字段")], 2))

    def test_public_contract_requires_verified_independent_of_lifecycle(self):
        for status in ("needs_check", "draft", "unknown"):
            with self.subTest(status=status):
                self.assertTrue(self.validate([v3(status=status)], 2))
        self.assertEqual(self.validate([v3(lifecycle={"state": "已停用", "date": "2026-10-19", "note": "产品状态不是核验状态", "source": {"name": "来源", "url": "https://example.com/end"}})], 2), [])


class V3BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        channel_harness.AinotesPageBrowserTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        channel_harness.AinotesPageBrowserTests.tearDownClass.__func__(cls)

    def channel(self, **kw):
        return channel_harness.AinotesPageBrowserTests.open(self, **kw)

    def reading(self, entries, **kw):
        return reading_harness.AinotesBrowserTests.open(self, routes={"**/data/ainotes.json": {"schema_version": 2, "updated_at": "2026-10-19", "items": entries}}, **kw)

    def test_new_vendor_topic_and_form_tags_keep_cross_group_filtering(self):
        chip = v3("bk-chip-example", tags=["模型", "AMD", "芯片", "开放权重"])
        bee = v3("bk-wearable-example", tags=["产品", "亚马逊", "购物", "可穿戴设备"])
        ctx, page, errors = self.channel(entries=[chip, bee], width=390)
        try:
            page.locator(".bk-card").first.wait_for()
            page.locator(".bk-tags-wrap summary").click()
            for tag, group in (("AMD", "厂商"), ("芯片", "话题"), ("购物", "话题"), ("开放权重", "形态"), ("亚马逊", "厂商")):
                label = page.locator(f".bk-tag[data-tag='{tag}']").evaluate('(el)=>el.closest(".bk-tag-group").querySelector(".bk-tag-legend").textContent')
                self.assertEqual(label, group)
            page.locator(".bk-tag[data-tag='AMD']").click()
            page.locator(".bk-tag[data-tag='购物']").click()
            page.wait_for_function("document.querySelectorAll('.bk-card:not([hidden])').length === 0")
            page.locator("#bkTagsClear").click()
            page.locator(".bk-tag[data-tag='亚马逊']").click()
            page.locator(".bk-tag[data-tag='购物']").click()
            page.wait_for_function("document.querySelectorAll('.bk-card:not([hidden])').length === 1")
            self.assertEqual(page.locator(".bk-card:not([hidden])").get_attribute("id"), bee["id"])
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_full_fields_channel_and_reading_popup(self):
        item = v3(flat_marks()[0]["id"])
        ctx, page, errors = self.channel(entries=[item], hash_=item["id"])
        try:
            page.locator(".an-questions").first.wait_for(timeout=4000)
            for label in ("干嘛的", "对你有啥用", "要什么设备", "上手难度", "面向谁、哪能用", "强在哪", "谁家的、现在"):
                self.assertIn(label, page.locator(".bk-card").inner_text())
            for value in ("示例网页入口", "示例账号条件", "暂无公开评价", "Fixture Research Inc.", "模型状态夹具", "模型动态", "每日AI整合"):
                self.assertIn(value, page.locator(".bk-more-body").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        ctx, page, errors = self.reading([item], width=390)
        try:
            page.locator(f"#{CARD} .an-t[data-k='{item['id']}']").first.click()
            page.locator("#anSheet:not([hidden])").wait_for()
            self.assertEqual(page.locator("#anQuestions dt").count(), 7)
            page.locator("#anMoreBtn").click()
            for value in ("示例账号条件", "Fixture Research Inc.", "模型状态夹具", "模型动态"):
                self.assertIn(value, page.locator("#anMore").inner_text())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_purpose_difficulty_query_and_type_are_independent(self):
        easy = v3("bk-v3-easy")
        pro = v3("bk-v3-pro", zh="专业示例", difficulty="专业部署", use_tags=["设计与绘图"])
        company = ent("bk-legacy-company", "旧公司", "Legacy company", tags=["公司"])
        rows = [easy, pro, company]
        ctx, page, errors = self.channel(entries=rows, width=1280)
        try:
            page.locator('.bk-use[data-use="公司"]').click(timeout=4000)
            self.assertEqual(page.locator(".bk-card:visible").count(), 1)
            self.assertEqual(page.locator(".bk-card:visible").get_attribute("id"), easy["id"])
            page.locator("#bkDifficulty").select_option("普通人能上手")
            page.wait_for_function("new URLSearchParams(location.search).get('difficulty')")
            self.assertIn("use=", page.url)
            page.reload(wait_until="networkidle")
            self.assertEqual(page.locator(".bk-card:visible").get_attribute("id"), easy["id"])
            page.locator("#bkQ").fill("专业示例")
            page.locator("#bkEmpty:not([hidden])").wait_for()
            page.locator("#bkEmptyReset").click()
            self.assertEqual(page.locator(".bk-card:visible").count(), 3)
            self.assertEqual(page.locator("#bkDifficulty").input_value(), "")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_real_difficulty_prose_filters_by_comparable_entry_paths(self):
        rows = [e for e in json.loads((ROOT / 'data/ainotes.json').read_text())['items'] if 'difficulty' in e]
        ctx, page, errors = self.channel(entries=rows, width=1280)
        try:
            page.locator('#bkDifficulty:not([hidden])').wait_for()
            options = page.locator('#bkDifficulty option').evaluate_all('(els)=>els.map(el=>el.value).filter(Boolean)')
            self.assertEqual(set(options), {'普通人能上手', '需要配置', '专业使用', '待核'})
            expected = {
                '普通人能上手': {'bk-universal-cart', 'bk-amazon-bee', 'bk-gpt-live-11', 'bk-flux-3-klein'},
                '需要配置': {'bk-flux-3-klein', 'bk-atria-dawn'},
                '专业使用': {'bk-natura-1', 'bk-agentx', 'bk-mi355x', 'bk-gpt-rosalind'},
                '待核': {'bk-mai-base-2'},
            }
            for level, ids in expected.items():
                page.locator('#bkDifficulty').select_option(level)
                page.wait_for_function('(n)=>document.querySelectorAll(".bk-card:not([hidden])").length === n', arg=len(ids))
                self.assertEqual(set(page.locator('.bk-card:visible').evaluate_all('(els)=>els.map(el=>el.id)')), ids)
            page.wait_for_timeout(550)
            page.reload(wait_until='networkidle')
            self.assertEqual(page.locator('#bkDifficulty').input_value(), '待核')
            self.assertEqual(page.locator('.bk-card:visible').get_attribute('id'), 'bk-mai-base-2')
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_verified_gate_on_both_public_readers(self):
        statuses = ["verified", "needs_check", "draft", "unknown", None]
        rows = []
        ids = list(dict.fromkeys(m["id"] for m in flat_marks()))[:5]
        self.assertEqual(len(ids), 5)
        for id_, status in zip(ids, statuses):
            item = v3(id_, status=status)
            if status is None:del item["status"]
            rows.append(item)
        ctx, page, errors = self.channel(entries=rows)
        try:
            page.locator(".bk-card").first.wait_for()
            self.assertEqual(page.locator(".bk-card").count(), 1)
            self.assertEqual(errors, [])
        finally:
            ctx.close()
        ctx, page, errors = self.reading(rows)
        try:
            for id_, status in zip(ids, statuses):
                n = page.locator(f"#{CARD} .an-t[data-k='{id_}']").count()
                self.assertEqual(n > 0, status == "verified", id_)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_unknown_purpose_query_ignores_inherited_names(self):
        ctx, page, errors = self.channel(entries=[v3()], query="?use=toString")
        try:
            page.locator(".bk-card").first.wait_for(state="attached")
            self.assertEqual(page.locator(".bk-card:visible").count(), 1)
            self.assertEqual(page.locator('.bk-use[aria-pressed="true"]').count(), 0)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_custom_tags_round_trip_without_prototype_collisions(self):
        for tag in ("自定义", "toString"):
            with self.subTest(tag=tag):
                rows = [ent("bk-custom", "自定义词条", "Custom", tags=[tag]), ent("bk-other", "另一条", "Other", tags=["产品"])]
                ctx, page, errors = self.channel(entries=rows, width=1280)
                try:
                    page.locator(f'.bk-tag[data-tag="{tag}"]').click(timeout=4000)
                    page.wait_for_function("new URLSearchParams(location.search).has('tag')")
                    page.reload(wait_until="networkidle")
                    self.assertEqual(page.locator(".bk-card:visible").count(), 1)
                    self.assertEqual(page.locator(f'.bk-tag[data-tag="{tag}"]').get_attribute("aria-pressed"), "true")
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    def test_local_preview_requires_exact_one(self):
        for value, expected in (("10", False), ("1x", False), ("0&preview=1", False), ("1", True)):
            with self.subTest(value=value):
                ctx, page, errors = reading_harness.AinotesBrowserTests.open(self, query="?preview=" + value,
                    routes={"**/data/ainotes.drafts.json": {"items": []}, "**/data/kanread.drafts.json": {"items": []}},
                    init_script="window.__noteFetches=[];const original=window.fetch;window.fetch=function(u,...args){window.__noteFetches.push(String(u));return original.call(this,u,...args)}")
                try:
                    requests = page.evaluate("window.__noteFetches")
                    for filename in ("ainotes.drafts.json", "kanread.drafts.json"):
                        self.assertEqual(any(filename in url for url in requests), expected)
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    def test_modal_focus_stays_inside_and_restores_background(self):
        item = v3(flat_marks()[0]["id"])
        ctx, page, errors = self.reading([item])
        try:
            page.evaluate("document.querySelector('footer').inert=true")
            opener = page.locator(f"#{CARD} .an-t[data-k='{item['id']}']").first
            opener.click()
            self.assertTrue(page.evaluate("document.querySelector('main').inert"))
            page.locator("#anGo").focus(); page.keyboard.press("Tab")
            self.assertEqual(page.evaluate("document.activeElement.id"), "anX")
            page.keyboard.press("Shift+Tab")
            self.assertEqual(page.evaluate("document.activeElement.id"), "anGo")
            page.keyboard.press("Escape")
            self.assertFalse(page.evaluate("document.querySelector('main').inert"))
            self.assertTrue(page.evaluate("document.querySelector('footer').inert"))
            self.assertTrue(opener.evaluate("e=>document.activeElement===e"))
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_expansion_moves_focus_to_visible_content(self):
        item = ent(flat_marks()[0]["id"], "旧词条", "Legacy", more="更长的背景资料")
        ctx, page, errors = self.reading([item])
        try:
            page.locator(f"#{CARD} .an-t[data-k='{item['id']}']").first.click()
            page.locator("#anDetailBtn").click()
            self.assertEqual(page.evaluate("document.activeElement.id"), "anLine")
            page.locator("#anMoreBtn").click()
            self.assertEqual(page.evaluate("document.activeElement.id"), "anMore")
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_cached_published_html_reads_current_scripts(self):
        old = (ROOT / "admin/fixtures/ainotes-legacy-20261019.html").read_text()
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route("**/ainotes.html", lambda r: r.fulfill(status=200, content_type="text/html", body=old))
        page.route("**/data/ainotes.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"schema_version": 1, "updated_at": "2026-10-19", "items": [ent("bk-cache", "旧页面词条", "Cached page")]})))
        try:
            page.goto(self.base + "/ainotes.html", wait_until="networkidle")
            self.assertEqual(page.locator(".bk-card").count(), 1)
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_pending_query_writeback_keeps_anchor_and_current_query(self):
        rows = [ent("bk-usage", "额度", "Usage"), ent("bk-api", "接口", "API", related=["bk-usage"])]
        for query, selector, expected_query, initial_hash in (("完全找不到的词", "#bkStarters a", None, ""), ("解释", "#bk-api .bk-rel a", "解释", ""), ("完全找不到的词", "#bkStarters a", None, "bk-usage")):
            with self.subTest(query=query):
                ctx, page, errors = self.channel(entries=rows, width=1280, hash_=initial_hash)
                try:
                    page.locator("#bk-api .bk-more-wrap summary").click()
                    page.locator("#bk-api .bk-rel a").wait_for(state="attached")
                    result = page.evaluate("""async ({query,selector}) => {
                      const input=document.getElementById('bkQ');input.value=query;
                      input.dispatchEvent(new Event('input',{bubbles:true}));
                      await new Promise(requestAnimationFrame);
                      const link=document.querySelector(selector);
                      if(!link) throw new Error('missing anchor fixture');
                      link.click();
                      await new Promise(resolve=>setTimeout(resolve,550));
                      return {hash:location.hash,q:new URLSearchParams(location.search).get('q')};
                    }""", {"query": query, "selector": selector})
                    self.assertEqual(result["hash"], "#bk-usage")
                    self.assertEqual(result["q"], expected_query)
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()

    def test_anchor_consumes_query_waiting_for_animation_frame(self):
        rows = [ent("bk-usage", "额度", "Usage"), ent("bk-api", "接口", "API", related=["bk-usage"])]
        ctx, page, errors = self.channel(entries=rows, width=1280, hash_="bk-usage")
        try:
            link = page.locator("#bk-api .bk-rel a")
            page.locator("#bk-api .bk-more-wrap summary").click()
            link.wait_for(state="visible")
            box = link.bounding_box()
            page.evaluate("""() => {
              window.__frames=new Map();let next=100000;
              window.__realRaf=window.requestAnimationFrame;
              window.__realCancel=window.cancelAnimationFrame;
              window.requestAnimationFrame=cb=>{const id=++next;__frames.set(id,cb);return id;};
              window.cancelAnimationFrame=id=>{if(!__frames.delete(id))__realCancel(id);};
              const input=document.getElementById('bkQ');input.value='完全找不到的词';
              input.dispatchEvent(new Event('input',{bubbles:true}));
            }""")
            page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            page.evaluate("""() => {
              window.requestAnimationFrame=__realRaf;window.cancelAnimationFrame=__realCancel;
              const callbacks=[...__frames.values()];__frames.clear();
              callbacks.forEach(cb=>cb(performance.now()));
            }""")
            page.wait_for_timeout(550)
            self.assertEqual(page.evaluate("location.hash"), "#bk-usage")
            self.assertIsNone(page.evaluate("new URLSearchParams(location.search).get('q')"))
            self.assertTrue(page.locator("#bk-usage").is_visible())
            self.assertEqual(errors, [])
        finally:
            ctx.close()

    def test_v3_fields_escape_and_responsive_layout(self):
        item = v3(what='<img src=x onerror="window.__v3evil=1">', company={"full_name": "<svg onload=window.__v3evil=2>", "type": "示例", "business": "研发"}, lifecycle={"state": "在用", "date": "2026-10-19", "note": "演示", "source": {"name": "坏链接", "url": "javascript:alert(1)"}})
        for width in (390, 760, 1280):
            with self.subTest(width=width):
                ctx, page, errors = self.channel(entries=[item], hash_=item["id"], width=width)
                try:
                    page.locator(".an-questions").first.wait_for(timeout=4000)
                    self.assertIsNone(page.evaluate("window.__v3evil"))
                    self.assertEqual(page.locator('.bk-more-body a[href^="javascript:"]').count(), 0)
                    self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth-innerWidth"), 1)
                    shots = os.environ.get("RENJI_V3_SHOTS_DIR")
                    if shots:
                        Path(shots).mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(Path(shots)/f"v3-{width}.png"), full_page=True)
                    self.assertEqual(errors, [])
                finally:
                    ctx.close()


if __name__ == "__main__":
    unittest.main()
