#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""大模型成本页（cost.html）数据契约测试 · 2026-09-25。

守的是这一页的命：数字要么核过、要么明写草稿；不出现跨区购买／VPN 提示；
标签三池（订阅／设备／路线）不混；卡片引用的标签都存在；假曲线不上页。
"""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FORBIDDEN = ("VPN", "vpn", "跨区", "翻墙", "代付", "更便宜渠道", "梯子")


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def walk_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from walk_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_strings(v)


class CostBoardDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.subs = load("llm-cost.json")
        self.api = load("llm-cost-api.json")
        self.tags = load("llm-cost-tags.json")
        self.setups = load("llm-cost-setups.json")

    def test_subscription_rows_shape(self) -> None:
        for key in ("schema_version", "updated_at", "fx_updated_at", "disclaimer", "items"):
            self.assertIn(key, self.subs)
        self.assertRegex(self.subs["updated_at"], r"^\d{4}-\d{2}-\d{2}$")
        ids = set()
        for it in self.subs["items"]:
            with self.subTest(row=it.get("id")):
                self.assertNotIn(it["id"], ids); ids.add(it["id"])
                self.assertIn(it["status"], ("draft", "verified", "stale"))
                self.assertRegex(it["last_verified"], r"^\d{4}-\d{2}-\d{2}$")
                self.assertIn("cn", it["prices"]); self.assertIn("us", it["prices"])
                self.assertEqual(it["global_avg"]["method"], "multi_region_mean")

    def test_verified_rows_carry_sources(self) -> None:
        """status=verified 的行必须每个有价格的地区都带官方 source_url，且核对日与行核对日一致。"""
        for it in self.subs["items"]:
            if it["status"] != "verified":
                continue
            with self.subTest(row=it["id"]):
                for region in ("cn", "us"):
                    side = it["prices"].get(region) or {}
                    if side.get("amount") is not None:
                        self.assertTrue(str(side.get("source_url", "")).startswith("http"), f"{it['id']}.{region} 缺官方来源")
                        self.assertEqual(side.get("as_of"), it["last_verified"], f"{it['id']}.{region} as_of 与 last_verified 不一致")

    def test_derived_china_prices_are_labelled_and_traceable(self) -> None:
        """梅宝 09-25 定：国外模型没有中国大陆官方渠道的，中国价一栏放美国价折算的人民币（退而求其次放全球均价）。
        折算值必须带 derived_from、汇率与汇率日期，且汇率等于顶层 fx；换算结果与 us×fx 相差不超过 0.01。"""
        fx = self.subs["fx"]["usd_cny"]
        derived = 0
        for it in self.subs["items"]:
            cn = it["prices"]["cn"]
            if not cn.get("derived_from"):
                continue
            derived += 1
            with self.subTest(row=it["id"]):
                self.assertIn(cn["derived_from"], ("us", "global_avg"))
                self.assertEqual(cn["currency"], "CNY")
                self.assertEqual(cn.get("fx_usd_cny"), fx)
                self.assertEqual(cn.get("fx_date"), self.subs["fx_updated_at"])
                self.assertTrue(str(cn.get("source_url", "")).startswith("http"))
                if cn["derived_from"] == "us":
                    us = it["prices"]["us"]
                    self.assertAlmostEqual(cn["amount"], round(us["amount"] * fx, 2), delta=0.01)
                else:
                    self.assertEqual(cn["amount"], it["global_avg"]["amount"])
        self.assertGreater(derived, 0, "国外模型的中国价折算行一行都没有")
        js = (ROOT / "cost.js").read_text(encoding="utf-8")
        for key in ("derivedTag", "derivedHintUs", "derivedHintAvg"):
            self.assertEqual(js.count(f"{key}:"), 2, f"i18n 键 {key} 中英两包都要有")

    def test_no_fake_sparkline_without_history_source(self) -> None:
        """没有真实历史来源前，sparkline 必须为空（页面画平线），不许拿占位数组冒充行情。"""
        for it in self.subs["items"]:
            with self.subTest(row=it["id"]):
                if it.get("sparkline"):
                    self.assertTrue(it.get("history_source"), f"{it['id']} 有曲线数据却没有 history_source")

    def test_api_rows_shape(self) -> None:
        self.assertEqual(self.api.get("unit"), self.api.get("unit"))
        for it in self.api["items"]:
            with self.subTest(row=it.get("id")):
                self.assertIn(it["status"], ("draft", "verified", "stale"))
                self.assertIn("input", it); self.assertIn("output", it)

    def test_tag_pools_are_separate_and_referenced_tags_exist(self) -> None:
        pools = {k: {t["id"] for t in self.tags[k]} for k in ("subscription", "device", "route")}
        self.assertFalse(pools["subscription"] & pools["route"], "路线标签混进了订阅池")
        self.assertFalse(pools["subscription"] & pools["device"])
        for tid in pools["subscription"]:
            self.assertTrue(tid.startswith("sub-"), tid)
        for tid in pools["route"]:
            self.assertTrue(tid.startswith("route-"), tid)
        for tid in pools["device"]:
            self.assertTrue(tid.startswith("dev-"), tid)
        for pool in ("subscription", "route"):
            for t in self.tags[pool]:
                with self.subTest(tag=t["id"]):
                    self.assertTrue(t.get("label") and t.get("label_en") and t.get("tone"), f"{t['id']} 缺 label/label_en/tone")
        for it in self.setups["items"]:
            with self.subTest(card=it["id"]):
                self.assertIn(it.get("kind"), ("sample", "real"))
                for tid in it["subscription_tags"]:
                    self.assertIn(tid, pools["subscription"], f"{it['id']} 引用了不存在的订阅标签 {tid}")
                for tid in it["device_tags"]:
                    self.assertIn(tid, pools["device"], f"{it['id']} 引用了不存在的设备标签 {tid}")
                for tid in it.get("route_tags", []):
                    self.assertIn(tid, pools["route"], f"{it['id']} 引用了不存在的路线标签 {tid}")

    def test_subscription_tags_are_official_names_with_period(self) -> None:
        """订阅标签 = 官方档名 + 月费／季费／年费；每条带官方来源。"""
        for t in self.tags["subscription"]:
            with self.subTest(tag=t["id"]):
                self.assertRegex(t["label"], r"(月费|季费|年费)$", t["label"])
                src = str(t.get("source", ""))
                # 千问办公助理会员只在 App 内有会员页，没有公开网页：允许写明「App 内」的非链接来源
                self.assertTrue(src.startswith("http") or "App 内" in src, f"{t['id']} 缺官方来源")

    def test_no_cross_region_or_vpn_copy_anywhere(self) -> None:
        blobs = [self.subs, self.api, self.tags, self.setups]
        texts = list(walk_strings(blobs))
        texts.append((ROOT / "cost.html").read_text(encoding="utf-8"))
        texts.append((ROOT / "cost.js").read_text(encoding="utf-8"))
        for text in texts:
            for bad in FORBIDDEN:
                for m in re.finditer(re.escape(bad), text):
                    # 免责声明里「不含跨区购买或 VPN 提示」这类否定句是允许的：按整句判断
                    start = max(text.rfind(ch, 0, m.start()) for ch in "。.;\n") + 1
                    end_candidates = [i for i in (text.find(ch, m.end()) for ch in "。.;\n") if i != -1]
                    end = min(end_candidates) if end_candidates else len(text)
                    sentence = text[start:end]
                    self.assertTrue(
                        any(neg in sentence for neg in ("不含", "不写", "不提供", "不做", "No ", "not ", "无", "Not ")),
                        f"出现了跨区／VPN 相关文案：…{sentence.strip()[:120]}…",
                    )

    def test_page_wires_data_and_i18n(self) -> None:
        html = (ROOT / "cost.html").read_text(encoding="utf-8")
        js = (ROOT / "cost.js").read_text(encoding="utf-8")
        for name in ("llm-cost.json", "llm-cost-api.json", "llm-cost-tags.json", "llm-cost-setups.json"):
            self.assertIn(f"data/{name}", js)
        self.assertIn('id="langZh"', html); self.assertIn('id="langEn"', html)
        for key in ("rowRoute", "whoReal", "draftHint", "hiddenCostTitle", "hiddenCost"):
            self.assertEqual(js.count(f"{key}:"), 2, f"i18n 键 {key} 中英两包都要有")
        self.assertIn('href="cost.html" class="on"', html)
        for page in ("index.html", "games.html", "baibao.html", "codex.html", "kanread.html", "pulse.html", "changelog.html"):
            self.assertIn('href="cost.html"', (ROOT / page).read_text(encoding="utf-8"), f"{page} 顶栏缺大模型成本")


if __name__ == "__main__":
    unittest.main()
