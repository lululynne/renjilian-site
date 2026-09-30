#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""小纸条（刊读词下注）契约测试（2026-09-30，刀 1）。

守五条边界：
- 公开词条文件只放已核对条目，草稿文件被 .gitignore 挡住；
- 每条公开词条字段齐、一句话够短、来源全 https；
- 标记文件里的每一处都真落在刊读正文上（位置对得上、不重叠、正文没有 BMP 外字符）；
- 页面与样式：开关文案、存储键、弹层语义都在；小纸条样式块不新增色值；
- 数据信封跟 data/ainotes.schema.json（JSON Schema 2020-12，additionalProperties: false）一致，
  用一个只认本 schema 用到的关键字的小校验器验，不引第三方库。
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOTES = "data/ainotes.json"
MARKS = "data/ainotes.marks.json"
SCHEMA = "data/ainotes.schema.json"
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ID = re.compile(r"^bk-[a-z0-9-]+$")
# 开头段要让新手读得懂：完整的句子，说清它是什么、谁给的、用完会怎样（梅宝 2026-09-30 15:13 定）。
# 太短多半是只丢了个名词短语；太长就该挪进「展开」。
LINE_MIN = 40
LINE_MAX = 200


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def load(name: str):
    return json.loads(read(name))


def check(instance, schema, path: str) -> list[str]:
    """只认本仓库 schema 用到的关键字：type/const/enum/required/properties/
    additionalProperties/pattern/minLength/maxLength/minItems/items。"""
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


class AinotesDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.data = load(NOTES)
        self.schema = load(SCHEMA)

    def test_public_file_carries_no_drafts(self) -> None:
        """公开数据一推上去人人可读：只许 verified；草稿文件必须被 .gitignore 挡住。"""
        for e in self.data["items"]:
            self.assertEqual(e.get("status"), "verified",
                             f"{e.get('id')} 未核对，应放 data/ainotes.drafts.json")
        self.assertIn("data/ainotes.drafts.json", read(".gitignore"))

    def test_every_entry_carries_the_contract_fields(self) -> None:
        for e in self.data["items"]:
            with self.subTest(entry=e.get("id")):
                self.assertRegex(e["id"], ID)
                self.assertTrue(e["zh"].strip())
                self.assertTrue(e["line"].strip())
                self.assertLessEqual(len(e["line"]), LINE_MAX, "开头段超过 200 字，多出来的挪进展开")
                self.assertGreaterEqual(len(e["line"]), LINE_MIN, "开头段太短：要写成新手读得懂的完整句子")
                self.assertTrue(e["line"].endswith("。"), "开头段要以句号收住，不许是半截话")
                self.assertTrue(e["brief"].strip(), "简洁版不能空")
                self.assertLessEqual(len(e["brief"]), 60, "简洁版超过 60 字，就不叫简洁了")
                first = e["line"].split("。")[0]
                self.assertRegex(first, "是|指", "第一句必须是「X 是……」这样的完整判断句，先说清它是什么")
                self.assertGreaterEqual(len(e["sources"]), 1, "至少一条来源")
                for s in e["sources"]:
                    self.assertTrue(s["name"].strip())
                    self.assertTrue(s["url"].startswith("https://"), "来源必须 https")
                self.assertRegex(e["last_verified"], DATE)
                self.assertRegex(e["added_at"], DATE)

    def test_ids_unique(self) -> None:
        ids = [e["id"] for e in self.data["items"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_schema_is_2020_12_and_closed(self) -> None:
        self.assertEqual(self.schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertFalse(self.schema["additionalProperties"])
        self.assertFalse(self.schema["properties"]["items"]["items"]["additionalProperties"])

    def test_data_validates_against_schema(self) -> None:
        errs = check(self.data, self.schema, "$")
        self.assertEqual(errs, [], "数据不符合 ainotes.schema.json：\n" + "\n".join(errs))


class AinotesMarksTests(unittest.TestCase):
    def setUp(self) -> None:
        self.marks = load(MARKS)["readings"]
        self.readings = {it["id"]: it for it in load("data/kanread.json")["items"]}

    def test_every_marked_reading_exists(self) -> None:
        for rid in self.marks:
            self.assertIn(rid, self.readings, f"标记指向不存在的精读 {rid}")

    def test_marks_land_on_the_text(self) -> None:
        for rid, voices in self.marks.items():
            it = self.readings[rid]
            for voice_name, marks in voices.items():
                with self.subTest(reading=rid, voice=voice_name):
                    voice = it[voice_name]
                    # Python 按码点、JS 按 UTF-16 码元数下标；正文没有 BMP 外字符两者才等价
                    self.assertTrue(all(ord(ch) <= 0xFFFF for ch in voice),
                                    "正文出现 BMP 外字符，at 下标在 JS 里会偏")
                    prev_end = -1
                    for mk in marks:
                        at, text = mk["at"], mk["text"]
                        self.assertEqual(voice[at:at + len(text)], text,
                                         f"at={at} 处不是 {text!r}")
                        self.assertGreaterEqual(at, prev_end, "标记重叠或未按 at 升序")
                        prev_end = at + len(text)


class AinotesPageTests(unittest.TestCase):
    def test_page_carries_the_switch_and_dialog(self) -> None:
        html = read("kanread.html")
        # 刀 2：三档选一（radiogroup + 关/简洁/详细），不再是「小纸条：开／关」
        self.assertIn("小纸条", html)
        self.assertIn('role="radiogroup"', html)
        self.assertIn('role="radio"', html)
        for label in ('"brief", "简洁"', '"full", "详细"', '"off", "关"'):
            self.assertIn(label, html, f"三档定义缺 {label}")
        self.assertIn('aria-checked', html)
        self.assertIn('data-mode="', html)
        # 存储键换成 rj.ainotes.mode；旧键 rj.ainotes.on 的迁移代码必须在（读完就删旧键）
        self.assertIn("rj.ainotes.mode", html)
        self.assertIn('localStorage.getItem("rj.ainotes.on")', html, "缺旧键迁移读取")
        self.assertIn('localStorage.removeItem("rj.ainotes.on")', html, "迁移后必须删掉旧键")
        self.assertIn('role="dialog"', html)
        self.assertIn('aria-modal="true"', html)
        self.assertIn("data/ainotes.json", html)
        self.assertIn("data/ainotes.marks.json", html)
        self.assertIn("看不太懂？说详细点", html)
        self.assertIn("展开来龙去脉", html)

    def test_ainotes_styles_add_no_new_colour(self) -> None:
        """色板是拍过板的：小纸条样式块只准复用既有 token，不准新增色值。"""
        css = read("style.css")
        at = css.find("/* 小纸条 ainotes */")
        self.assertNotEqual(at, -1, "style.css 缺少小纸条样式块")
        block = css[at:]
        self.assertEqual(re.findall(r"#[0-9a-fA-F]{3,8}\b", block), [],
                         "小纸条样式里出现裸色值，应改用 var(--…) token")
        self.assertEqual(re.findall(r"\b(?:rgb|hsl)a?\(", block), [],
                         "小纸条样式里出现 rgb()/hsl()，应改用 var(--…) token")

    def test_off_state_has_no_focusable_marks(self) -> None:
        """关掉时标记不可聚焦：渲染代码里必须真的写 tabindex=-1。"""
        html = read("kanread.html")
        self.assertIn('"tabindex", "-1"', html)


if __name__ == "__main__":
    unittest.main()
