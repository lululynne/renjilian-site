#!/opt/homebrew/opt/python@3.14/bin/python3.14
from __future__ import annotations

import json
import os
import struct
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

    def test_account_page_mounts_a_human_only_updates_surface(self) -> None:
        html = (ROOT / "account.html").read_text(encoding="utf-8")
        account = (ROOT / "account.js").read_text(encoding="utf-8")
        updates = (ROOT / "account-updates.js").read_text(encoding="utf-8")
        push = (ROOT / "friend-push.js").read_text(encoding="utf-8")
        for name in ("account-updates.js", "friend-push.js", "sw.js", "manifest.webmanifest"):
            self.assertTrue((ROOT / name).exists(), name)
        self.assertIn('id="humanUpdatesBox" hidden', html)
        for node in ("huChannelMachine", "huChannelKanread", "huChannelReset", "huConnect",
                     "huDevices", "huTokenIssue", "huTokenPlain", "huTokenList",
                     "huUpdatesList", "huMarkSeen", "huUpdatesMore"):
            self.assertIn(f'id="{node}"', html)
        self.assertLess(html.index('src="friend-push.js'), html.index('src="account-updates.js'))
        self.assertLess(html.index('src="account-updates.js'), html.index('src="account.js'))
        self.assertIn("window.RJ_ACCOUNT_UPDATES.paint(me, cfg)", account)
        self.assertIn('account&&account.kind==="human"', updates)
        self.assertIn('cfg.human_updates_available===true', updates)
        self.assertNotIn("Notification.requestPermission", updates)
        self.assertIn("Notification.requestPermission", push)
        self.assertNotIn("innerHTML", updates + push)

    def test_manifest_and_install_assets_are_closed_and_real(self) -> None:
        manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["start_url"], "/account.html#updates")
        self.assertEqual(manifest["scope"], "/")
        self.assertEqual(manifest["display"], "standalone")
        self.assertEqual([i["sizes"] for i in manifest["icons"]], ["192x192", "512x512"])
        expected = {"icon-180.png": (180, 180), "icon-192.png": (192, 192), "icon-512.png": (512, 512)}
        for name, dimensions in expected.items():
            raw = (ROOT / "img" / "app" / name).read_bytes()
            self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(struct.unpack(">II", raw[16:24]), dimensions)
        html = (ROOT / "account.html").read_text(encoding="utf-8")
        self.assertIn('rel="manifest" href="manifest.webmanifest"', html)
        self.assertIn('rel="apple-touch-icon" href="img/app/icon-180.png"', html)

    def test_service_worker_has_only_closed_push_and_click_behavior(self) -> None:
        sw = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn('addEventListener("push"', sw)
        self.assertIn('addEventListener("notificationclick"', sw)
        self.assertNotIn('addEventListener("fetch"', sw)
        self.assertNotIn("caches.", sw)
        self.assertIn('API_ORIGIN="https://api.renji.love"', sw)
        self.assertIn('credentials:"omit"', sw)
        self.assertIn('redirect:"error"', sw)
        self.assertNotIn("cookie", sw.lower())
        for route in ("account_updates", "card", "kanread", "pulse", "reset_claude", "reset_codex", "reset_grok"):
            self.assertIn(f'"{route}"', sw)

    def test_privacy_discloses_local_dedupe_and_server_delivery_truth(self) -> None:
        privacy = (ROOT / "privacy.html").read_text(encoding="utf-8")
        for phrase in ("VAPID 公钥版本", "最近已经显示过的事件编号", "最多保留 7 天",
                       "推送服务接收不等于你已经在设备上看到", "看过／撤下的收件账保留 90 天"):
            self.assertIn(phrase, privacy)


if __name__ == "__main__":
    unittest.main()
