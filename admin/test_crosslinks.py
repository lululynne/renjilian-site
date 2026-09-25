#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""跨板块互链 related（裁定 v1.1 §一.3 / §二 1-核）。

规矩：只存 {kind, id}，不存标题（标题渲染时从目标数据取，免得两处漂移）；
kind 只能是 reading|pulse|question|tool|cost；单条最多 4 个；
每个 id 必须能在目标文件找到，而且目标是公开态——草稿、候选、失效的都不许被链出去。
互动提问没有 status 字段，它的「公开」等价于在 questions.json 里；另加一条：18+ 卡不从别的板块被链出去。
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KINDS = {"reading", "pulse", "question", "tool", "cost"}
MAX_RELATED = 4
SOURCES = {  # 允许挂 related 的文件 → schema
    "data/kanread.json": "data/kanread.schema.json",
    "data/pulse.json": "data/pulse.schema.json",
    "data/mcps.json": "data/mcps.schema.json",
    "data/llm-cost.json": "data/llm-cost.schema.json",
}
SELF_KIND = {"data/kanread.json": "reading", "data/pulse.json": "pulse",
             "data/mcps.json": "tool", "data/llm-cost.json": "cost"}
PAGE_OF = {"reading": "kanread.html", "pulse": "pulse.html", "tool": "baibao.html",
           "cost": "cost.html", "question": "games.html"}


def load(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def items(rel: str) -> list[dict]:
    d = load(rel)
    return d["items"] if isinstance(d, dict) else d


def published_ids() -> dict[str, set[str]]:
    return {
        "reading": {it["id"] for it in items("data/kanread.json") if it["status"] == "verified"},
        "pulse": {it["id"] for it in items("data/pulse.json") if it["status"] == "verified"},
        "tool": {it["id"] for it in items("data/mcps.json") if it["status"] == "verified"},
        "cost": {it["id"] for it in items("data/llm-cost.json") if it["status"] == "verified"},
        "question": {q["id"] for q in items("data/questions.json") if q.get("id") and q.get("lv") != "r18"},
    }


def all_related():
    for rel in SOURCES:
        for it in items(rel):
            if "related" in it:
                yield rel, it


class RelatedFieldTests(unittest.TestCase):
    def test_every_related_resolves_to_a_published_target(self) -> None:
        ok = published_ids()
        for rel, it in all_related():
            for ref in it["related"]:
                with self.subTest(src=f"{rel}:{it['id']}", ref=ref):
                    self.assertEqual(set(ref), {"kind", "id"}, "related 只存 kind 和 id，不存标题")
                    self.assertIn(ref["kind"], KINDS)
                    self.assertIn(ref["id"], ok[ref["kind"]],
                                  f"{ref['kind']}:{ref['id']} 不存在或不是公开态")

    def test_shape_limits(self) -> None:
        for rel, it in all_related():
            with self.subTest(src=f"{rel}:{it['id']}"):
                refs = it["related"]
                self.assertIsInstance(refs, list)
                self.assertTrue(1 <= len(refs) <= MAX_RELATED, "有就至少一个，最多四个")
                keys = [(r["kind"], r["id"]) for r in refs]
                self.assertEqual(len(keys), len(set(keys)), "同一条里不许重复")
                self.assertNotIn((SELF_KIND[rel], it["id"]), keys, "不许链自己")

    def test_only_published_items_carry_related(self) -> None:
        """草稿不该带出链接：没公开的条目挂 related，页面上本来也不显示，容易变成死数据。"""
        for rel, it in all_related():
            with self.subTest(src=f"{rel}:{it['id']}"):
                self.assertEqual(it.get("status"), "verified")

    def test_at_least_three_real_links_seeded(self) -> None:
        self.assertGreaterEqual(sum(1 for _ in all_related()), 3)

    def test_questions_do_not_carry_related_yet(self) -> None:
        """这一刀 related 只挂在四个有信封的文件上；questions.json 还是裸数组，迁信封是第二阶段。"""
        for q in items("data/questions.json"):
            self.assertNotIn("related", q)

    def test_schemas_declare_the_same_optional_field(self) -> None:
        for data, schema_rel in SOURCES.items():
            with self.subTest(schema=schema_rel):
                schema = load(schema_rel)
                if "$defs" in schema and "item" in schema["$defs"]:
                    item = schema["$defs"]["item"]
                else:
                    item = schema["properties"]["items"]["items"]
                prop = item["properties"]["related"]
                self.assertNotIn("related", item.get("required", []), "related 是可选字段")
                self.assertEqual(prop["maxItems"], MAX_RELATED)
                self.assertEqual(set(prop["items"]["properties"]["kind"]["enum"]), KINDS)
                self.assertEqual(prop["items"]["required"], ["kind", "id"])
                self.assertFalse(prop["items"]["additionalProperties"])


class RelatedRendering(unittest.TestCase):
    def test_shared_renderer_knows_every_kind_and_route(self) -> None:
        js = (ROOT / "rj-related.js").read_text(encoding="utf-8")
        for kind, page in PAGE_OF.items():
            with self.subTest(kind=kind):
                self.assertRegex(js, rf'{kind}:\s*\{{[^}}]*"{re.escape(page)}#"')
        self.assertIn("textContent", js)
        self.assertNotIn("innerHTML", js, "标题来自数据文件，一律 textContent")

    def test_boards_load_the_renderer(self) -> None:
        for page in ("kanread.html", "pulse.html", "baibao.html", "cost.html"):
            with self.subTest(page=page):
                self.assertIn('<script src="rj-related.js"></script>', (ROOT / page).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
