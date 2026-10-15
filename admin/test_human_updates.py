#!/opt/homebrew/opt/python@3.14/bin/python3.14
from __future__ import annotations

import json
import os
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = Path(os.environ.get("RENJI_API_ROOT") or (Path.home() / "renji-api"))
SITE_FIXTURE = ROOT / "admin" / "fixtures" / "human-push-envelope-v1.json"


class HumanUpdateContractTests(unittest.TestCase):
    def test_api_and_site_share_exact_push_envelope_fixture(self) -> None:
        api_fixture = API_ROOT / "test" / "fixtures" / "human-push-envelope-v1.json"
        self.assertTrue(api_fixture.exists(), "renji-api N20 fixture is missing")
        self.assertEqual(SITE_FIXTURE.read_bytes(), api_fixture.read_bytes())
        payload = json.loads(SITE_FIXTURE.read_text(encoding="utf-8"))
        self.assertEqual(payload["version"], 1)
        self.assertLessEqual(payload["max_serialized_bytes"], 3993)
        self.assertNotIn("url", payload["sample"])
        self.assertNotIn("endpoint", payload["sample"])
        self.assertEqual(set(payload["sample"]), set(payload["allowed_fields"]))

    def test_schema_source_declares_v13_and_all_n20_stores(self) -> None:
        schema = (API_ROOT / "src" / "schema.js").read_text(encoding="utf-8")
        config = (API_ROOT / "src" / "config.js").read_text(encoding="utf-8")
        self.assertIn("export const SCHEMA_VERSION = 13", schema)
        for table in (
            "human_update_tokens",
            "human_update_preferences",
            "human_push_subscriptions",
            "update_events",
            "event_fanout_jobs",
            "human_update_inbox",
            "push_deliveries",
            "update_source_state",
        ):
            self.assertIn(f"CREATE TABLE IF NOT EXISTS {table}", schema)
        self.assertRegex(config, r"human_updates_activation:\s*'0'")
        self.assertRegex(config, r"human_updates_delivery:\s*'0'")


if __name__ == "__main__":
    unittest.main()
