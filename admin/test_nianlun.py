#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""年轮时间线契约测试（2026-09-30，年轮刀 1）。

守：数据信封与 schema 一致（不引第三方校验库）、成员名单恰好 15 家、read 指向真实精读、
notes 指向真实小纸条词条、页面壳层与取时间的办法（不许用浏览器本地时区）、图片在且小、
样式块零裸色值。
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = "data/nianlun.json"
SCHEMA = "data/nianlun.schema.json"
PAGE = "nianlun.html"
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
AT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$")


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def load(name: str):
    return json.loads(read(name))


def check(instance, schema, path: str) -> list[str]:
    """只认本仓库 schema 用到的关键字：type/const/enum/required/properties/
    additionalProperties/pattern/minLength/maxLength/minItems/items/minimum/maximum。"""
    errs: list[str] = []
    t = schema.get("type")
    ok_type = (
        (t == "object" and isinstance(instance, dict))
        or (t == "array" and isinstance(instance, list))
        or (t == "string" and isinstance(instance, str))
        or (t == "integer" and isinstance(instance, int) and not isinstance(instance, bool))
        or t is None
    )
    if not ok_type:
        return [f"{path}: 类型应为 {t}，实为 {type(instance).__name__}"]
    if "const" in schema and instance != schema["const"]:
        errs.append(f"{path}: 应恒等于 {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errs.append(f"{path}: 不在枚举 {schema['enum']} 内")
    if isinstance(instance, bool):
        pass
    elif isinstance(instance, int):
        if "minimum" in schema and instance < schema["minimum"]:
            errs.append(f"{path}: 小于下限 {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errs.append(f"{path}: 超过上限 {schema['maximum']}")
    if isinstance(instance, str):
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errs.append(f"{path}: 不匹配 pattern {schema['pattern']}")
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errs.append(f"{path}: 长度不足 {schema['minLength']}")
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            errs.append(f"{path}: 长度超过 {schema['maxLength']}")
    if isinstance(instance, dict):
        for k in schema.get("required", []):
            if k not in instance:
                errs.append(f"{path}: 缺必填字段 {k}")
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for k in instance:
                if k not in props:
                    errs.append(f"{path}: 多出字段 {k}")
        for k, sub in props.items():
            if k in instance:
                errs += check(instance[k], sub, f"{path}.{k}")
    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errs.append(f"{path}: 元素不足 {schema['minItems']} 个")
        if "items" in schema:
            for i, el in enumerate(instance):
                errs += check(el, schema["items"], f"{path}[{i}]")
    return errs


class NianlunDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = load(DATA)
        self.schema = load(SCHEMA)

    def test_envelope_shape(self) -> None:
        self.assertEqual(set(self.data), {"schema_version", "updated_at", "first_ring", "members", "items"})
        self.assertEqual(self.data["schema_version"], 1)
        self.assertRegex(self.data["updated_at"], DATE)
        self.assertRegex(self.data["first_ring"], DATE)
        self.assertIsInstance(self.data["members"], list)
        self.assertIsInstance(self.data["items"], list)

    def test_schema_is_2020_12_and_closed(self) -> None:
        self.assertEqual(self.schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertFalse(self.schema["additionalProperties"])
        self.assertFalse(self.schema["properties"]["items"]["items"]["additionalProperties"])
        self.assertFalse(self.schema["properties"]["members"]["items"]["additionalProperties"])

    def test_data_validates_against_schema(self) -> None:
        errs = check(self.data, self.schema, "$")
        self.assertEqual(errs, [], "数据不符合 nianlun.schema.json：\n" + "\n".join(errs))

    def test_members_are_exactly_the_fifteen(self) -> None:
        members = self.data["members"]
        self.assertEqual(len(members), 15, "成员名单恰好 15 家")
        ids = [m["id"] for m in members]
        self.assertEqual(len(ids), len(set(ids)), "成员 id 不许重复")
        for m in members:
            self.assertTrue(m["name"].strip())

    def test_every_item(self) -> None:
        member_ids = {m["id"] for m in self.data["members"]}
        ids = []
        for it in self.data["items"]:
            with self.subTest(item=it.get("id")):
                self.assertRegex(it["id"], r"^nl-[a-z0-9-]+$")
                ids.append(it["id"])
                self.assertRegex(it["at"], AT)
                self.assertIn(it["member"], member_ids, "member 必须在 members 里")
                self.assertIn(it["level"], (1, 2, 3, 4, 5))
                self.assertTrue(20 <= len(it["line"]) <= 140, "line 长度 20–140")
                self.assertGreaterEqual(len(it["sources"]), 1)
                for s in it["sources"]:
                    self.assertTrue(s["name"].strip())
                    self.assertTrue(s["url"].startswith("https://"), "来源必须 https")
        self.assertEqual(len(ids), len(set(ids)), "格 id 不许重复")

    def test_read_points_to_a_real_reading(self) -> None:
        readings = {it["id"]: it for it in load("data/kanread.json")["items"]}
        for it in self.data["items"]:
            if it.get("read"):
                with self.subTest(item=it["id"]):
                    self.assertIn(it["read"], readings, "read 必须指向存在的精读")
                    self.assertNotEqual(readings[it["read"]].get("status"), "draft", "read 不许指向草稿")

    def test_notes_point_to_real_ainotes(self) -> None:
        notes_ids = {e["id"] for e in load("data/ainotes.json")["items"]}
        for it in self.data["items"]:
            for n in it.get("notes") or []:
                with self.subTest(item=it["id"], note=n):
                    self.assertIn(n, notes_ids, "notes 里的词条必须存在于 ainotes.json")


class NianlunPageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.html = read(PAGE)

    def test_shell(self) -> None:
        self.assertIn("<h1>第二人称</h1>", self.html)
        self.assertIn("SECOND PERSON", self.html)
        self.assertIn('class="wrap sister-footer"', self.html)
        self.assertIn("这一页要开启 JavaScript 才能显示时间线。", self.html)
        self.assertIn('role="status"', self.html)
        self.assertIn('role="radiogroup"', self.html)
        self.assertNotIn('href="#"', self.html)
        self.assertNotIn("施工中", self.html)
        # 外链一律 noopener（姐妹站两个老链接除外，全站同例）
        for m in re.finditer(r'<a\b[^>]*href="https://[^"]*"[^>]*>', self.html):
            tag = m.group(0)
            if "mymomentsmaker.com" in tag or "zheguang.gallery" in tag:
                continue
            self.assertIn('rel="noopener noreferrer"', tag, f"外链缺 rel: {tag}")

    def test_no_local_timezone_math(self) -> None:
        """时间一律从 at 字符串取，不许用浏览器本地时区换算。"""
        self.assertNotIn("getHours", self.html)
        self.assertNotIn("toLocale", self.html)
        self.assertIn("+08:00", self.html, "东八区偏移必须出现在数据或页面约定里")

    def test_styles_add_no_new_colour(self) -> None:
        css = read("style.css")
        start = css.find("/* 年轮时间线（年轮刀 1） */")
        self.assertNotEqual(start, -1, "style.css 缺年轮样式块")
        end = css.find("/* hidden 属性", start)
        self.assertGreater(end, start, "年轮样式块必须落在 [hidden] 通则之前")
        block = css[start:end]
        self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,8}\b", block), [],
                         "年轮样式里出现裸色值，应改用 var(--…) token")
        self.assertEqual(re.findall(r"\b(?:rgb|hsl)a?\(", block), [],
                         "年轮样式里出现 rgb()/hsl()，应改用 var(--…) token")

    def test_images_exist_and_stay_small(self) -> None:
        for n in range(1, 6):
            p = ROOT / "img" / "nianlun" / f"battery-{n}.svg"
            with self.subTest(img=p.name):
                self.assertTrue(p.exists(), f"缺 {p.name}")
                self.assertLessEqual(p.stat().st_size, 40 * 1024, f"{p.name} 超过 40KB")
        ring = ROOT / "img" / "nianlun" / "ring.png"
        self.assertTrue(ring.exists(), "缺 ring.png")
        self.assertLessEqual(ring.stat().st_size, 40 * 1024)
        for n in range(1, 6):
            self.assertIn(f"battery-{n}.svg", self.html)
        self.assertIn("ring.png", self.html)


if __name__ == "__main__":
    unittest.main()
