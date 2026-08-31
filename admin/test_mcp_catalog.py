#!/opt/homebrew/opt/python@3.14/bin/python3.14
from __future__ import annotations

import json
import unittest
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "mcps.json"
SCHEMA_PATH = ROOT / "data" / "mcps.schema.json"


class McpCatalogContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        cls.items = cls.payload["items"]

    def test_schema_and_unique_ids(self) -> None:
        self.assertEqual(self.payload["schema_version"], 2)
        ids = [item["id"] for item in self.items]
        self.assertEqual(len(ids), len(set(ids)))

    def test_required_fields_and_enums(self) -> None:
        required = {
            "id", "name", "kind", "category", "summary", "status", "rating",
            "maintainer", "last_verified", "access_mode", "repo", "installations",
            "risks", "human_confirmation", "tags", "experiences", "verdict", "links",
        }
        risk_keys = {"permissions", "secrets", "network", "filesystem", "external_write", "payment", "adult"}
        for item in self.items:
            with self.subTest(item=item["id"]):
                self.assertTrue(required.issubset(item))
                self.assertIn(item["category"], {"life", "play"})
                self.assertIn(item["status"], {"candidate", "planned", "verified", "unavailable"})
                self.assertIn(item["access_mode"], {"direct", "assisted", "human-confirm"})
                self.assertIn(item["kind"], {"mcp", "skill", "app", "game", "connector"})
                self.assertIn(item["rating"], {"all", "r18"})
                self.assertEqual(set(item["risks"]), risk_keys)
                self.assertIn(item["risks"]["network"], {"none", "allowlist", "open", "unknown"})
                self.assertIn(item["risks"]["filesystem"], {"none", "read", "write", "unknown"})
                self.assertIsInstance(item["installations"], list)
                self.assertIsInstance(item["experiences"], list)
                self.assertIsInstance(item["human_confirmation"], list)
                self.assertIsInstance(item["tags"], list)
                self.assertIsInstance(item["links"], list)
                self.assertGreaterEqual(len(item["verdict"]), 8)
                for link in item["links"]:
                    self.assertEqual(urlparse(link["url"]).scheme, "https")

    def test_unverified_entries_publish_no_install_link(self) -> None:
        for item in self.items:
            if item["status"] in {"candidate", "planned"}:
                with self.subTest(item=item["id"]):
                    self.assertEqual(item["links"], [])
                    self.assertIsNone(item["last_verified"])
                    self.assertIsNone(item["repo"])
                    self.assertEqual(item["installations"], [])
                    self.assertEqual(item["experiences"], [])

    def test_payment_requires_explicit_human_confirmation(self) -> None:
        for item in self.items:
            if item["risks"].get("payment"):
                with self.subTest(item=item["id"]):
                    self.assertEqual(item["access_mode"], "human-confirm")
                    confirmations = " ".join(item["human_confirmation"])
                    self.assertRegex(confirmations, r"付款|扣款|支付")

    def test_public_assets_reference_catalog(self) -> None:
        html = (ROOT / "baibao.html").read_text(encoding="utf-8")
        script = (ROOT / "baibao.js").read_text(encoding="utf-8")
        self.assertIn('src="baibao.js"', html)
        self.assertIn("data/mcps.json", script)
        self.assertIn("人机百宝箱", html)
        self.assertIn("MCP / Skills", html)

    def test_routed_catalog_is_linked_from_live_pages(self) -> None:
        for filename in ("index.html", "games.html"):
            with self.subTest(filename=filename):
                live_page = (ROOT / filename).read_text(encoding="utf-8")
                self.assertIn('href="baibao.html"', live_page)

    def test_planned_entries_do_not_claim_direct_or_known_safe_access(self) -> None:
        for item in self.items:
            if item["status"] == "planned":
                with self.subTest(item=item["id"]):
                    self.assertNotEqual(item["access_mode"], "direct")
                    self.assertEqual(item["risks"]["network"], "unknown")
                    self.assertTrue(item["human_confirmation"])

    def test_aisay_is_verified_but_lutopia_mcp_stays_planned(self) -> None:
        by_id = {item["id"]: item for item in self.items}
        aisay = by_id["verified-aisay-entry"]
        self.assertEqual(aisay["status"], "verified")
        self.assertEqual(aisay["last_verified"], "2026-08-10")
        self.assertEqual(
            {link["url"] for link in aisay["links"]},
            {
                "https://aisay.top/chatroom/about.html",
                "https://aisay.top/chatroom/mcp",
            },
        )

        lutopia = by_id["planned-lutopia-entry"]
        self.assertEqual(lutopia["status"], "planned")
        self.assertIsNone(lutopia["last_verified"])
        self.assertEqual(lutopia["links"], [])
        self.assertEqual(lutopia["risks"]["network"], "unknown")

    def test_schema_file_declares_v2_and_stage1_levels(self) -> None:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["schema_version"]["const"], 2)
        experience = schema["$defs"]["experience"]["oneOf"]
        allowed_levels = {ref["$ref"].rsplit("/", 1)[-1] for ref in experience}
        self.assertEqual(allowed_levels, {"replay", "remote"})

    def test_first_batch_cards_facts(self) -> None:
        by_id = {item["id"]: item for item in self.items}
        expected = {
            "spicy-monopoly": (
                "https://github.com/RennAkira/spicy-monopoly", "forbidden", 530,
            ),
            "sound-apple-music": (
                "https://github.com/seayniclabs/sound", "allowed", 1,
            ),
            "mixcraft": (
                "https://github.com/schuettc/mixcraft-app", "unknown", 2,
            ),
        }
        for item_id, (url, commercial, stars) in expected.items():
            with self.subTest(item=item_id):
                item = by_id[item_id]
                self.assertEqual(item["status"], "verified")
                self.assertEqual(item["last_verified"], "2026-08-30")
                self.assertEqual(item["repo"]["url"], url)
                self.assertEqual(item["repo"]["license"]["commercial_use"], commercial)
                cache = item["repo"]["stars_cache"]
                self.assertEqual(cache["count"], stars)
                self.assertEqual(cache["source"], "github-api")
                self.assertTrue(cache["fetched_at"])
        spicy = by_id["spicy-monopoly"]
        self.assertEqual(spicy["rating"], "r18")
        self.assertTrue(spicy["risks"]["adult"])
        self.assertEqual(
            spicy["repo"]["license"]["name"], "CC BY-NC 4.0",
        )
        mixcraft = by_id["mixcraft"]
        self.assertIn("README", mixcraft["repo"]["license"]["name"])

    def test_readme_declared_license_is_not_upgraded(self) -> None:
        by_id = {item["id"]: item for item in self.items}
        mixcraft = by_id["mixcraft"]
        self.assertEqual(mixcraft["repo"]["license"]["commercial_use"], "unknown")

    def test_stars_cache_always_has_fetch_time(self) -> None:
        for item in self.items:
            if item["repo"] is not None:
                with self.subTest(item=item["id"]):
                    cache = item["repo"]["stars_cache"]
                    self.assertTrue(cache["fetched_at"])
                    self.assertEqual(cache["source"], "github-api")
                    self.assertIsInstance(cache["count"], int)

    def test_only_placeholder_secrets_appear(self) -> None:
        import re

        suspicious = re.compile(r"(?i)\b(sk|pk|api|token|key)[-_][A-Za-z0-9]{16,}\b")
        for item in self.items:
            for installation in item["installations"]:
                with self.subTest(item=item["id"], client=installation["client"]):
                    copy_text = installation.get("copy_text") or ""
                    self.assertIsNone(suspicious.search(copy_text))
                    if installation["needs_secret"]:
                        requirements = " ".join(installation.get("requirements", []))
                        self.assertIn("<YOUR_KEY>", requirements)

    def test_adult_monopoly_lineage_upgrade(self) -> None:
        by_id = {item["id"]: item for item in self.items}
        self.assertNotIn("planned-adult-monopoly", by_id)
        spicy = by_id["spicy-monopoly"]
        self.assertEqual(spicy["status"], "verified")
        self.assertEqual(spicy["name"], "色色大富翁")
        self.assertEqual(spicy["rating"], "r18")

    def test_verified_entries_carry_actions_payload(self) -> None:
        for item in self.items:
            if item["status"] == "verified":
                with self.subTest(item=item["id"]):
                    self.assertTrue(item["installations"] or item["experiences"])
                    for experience in item["experiences"]:
                        self.assertIn(experience["level"], {"replay", "remote"})

    def test_all_outbound_urls_are_https(self) -> None:
        for item in self.items:
            with self.subTest(item=item["id"]):
                for link in item["links"]:
                    self.assertEqual(urlparse(link["url"]).scheme, "https")
                if item["repo"] is not None:
                    self.assertEqual(urlparse(item["repo"]["url"]).scheme, "https")
                    self.assertEqual(urlparse(item["repo"]["license"]["source_url"]).scheme, "https")
                for experience in item["experiences"]:
                    if experience["level"] == "remote":
                        self.assertEqual(urlparse(experience["url"]).scheme, "https")

    def test_verified_has_at_least_one_installation_and_experience(self) -> None:
        for item in self.items:
            if item["status"] == "verified":
                with self.subTest(item=item["id"]):
                    self.assertGreaterEqual(len(item["installations"]), 1)
                    self.assertGreaterEqual(len(item["experiences"]), 1)

    def test_r18_rating_and_adult_risk_are_bidirectionally_consistent(self) -> None:
        for item in self.items:
            with self.subTest(item=item["id"]):
                self.assertEqual(item["rating"] == "r18", item["risks"]["adult"])

    def test_sound_has_dual_client_installations(self) -> None:
        by_id = {item["id"]: item for item in self.items}
        sound = by_id["sound-apple-music"]
        clients = [installation["client"] for installation in sound["installations"]]
        self.assertEqual(clients, ["claude-code", "generic-mcp"])
        manual = sound["installations"][1]
        self.assertEqual(manual["method"], "json")
        self.assertIn('"mcpServers"', manual["copy_text"])
        self.assertIn('"sound"', manual["copy_text"])


if __name__ == "__main__":
    unittest.main()
