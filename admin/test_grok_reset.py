#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Grok E01/E02：官方规则快照、无样本边界与私密日历完整交互。"""
from __future__ import annotations

import datetime as dt
import functools
import http.server
import json
import threading
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import Route, sync_playwright
from visit_fixture import fulfill_visit_fixture


ROOT = Path(__file__).resolve().parents[1]
MOBILE = {"width": 390, "height": 844}


class GrokResetStaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = (ROOT / "codex.html").read_text(encoding="utf-8")
        cls.script = (ROOT / "reset-board.js").read_text(encoding="utf-8")
        cls.data = json.loads((ROOT / "data/grok-reset.json").read_text(encoding="utf-8"))
        cls.cost = (ROOT / "data/llm-cost.json").read_text(encoding="utf-8")
        cls.tags = (ROOT / "data/llm-cost-tags.json").read_text(encoding="utf-8")

    def test_official_snapshot_keeps_current_and_legacy_rules_separate(self) -> None:
        self.assertEqual(self.data["updated_at"], "2026-10-15")
        self.assertEqual(len(self.data["rules"]), 3)
        self.assertEqual({rule["source_kind"] for rule in self.data["rules"]}, {"official"})
        self.assertEqual({rule["audience"] for rule in self.data["rules"]}, {"current", "legacy"})
        self.assertTrue(all(rule["source_url"].startswith(("https://docs.x.ai/", "https://prod.cursor.com/"))
                            for rule in self.data["rules"]))
        self.assertEqual(self.data["prediction"]["state"], "insufficient_public_history")
        self.assertIsNone(self.data["prediction"]["probability_24h"])
        self.assertIsNone(self.data["prediction"]["probability_48h"])

    def test_page_removes_the_old_unconditional_separate_meter_claim(self) -> None:
        self.assertIn('id="grokCurrentTitle"', self.html)
        self.assertIn('id="grokLegacyTitle"', self.html)
        self.assertIn("Premium、Super、Ultra", self.data["rules"][0]["statement"])
        self.assertIn("Plus 与 Free 不含 Bot", self.data["rules"][0]["statement"])
        self.assertNotIn("Grok Bot：与 Grok 订阅用量分开", self.html)
        self.assertNotIn("Grok Bot 的额度另算，不能把两种产品的时间混在一起", self.html)
        self.assertIn("没有够用的公开历史样本，就不写一个漂亮数字", self.html)
        self.assertNotIn("Grok Bot 额度为单独一池，两边分开算", self.cost)
        self.assertNotIn("与 Grok Bot 额度分开算", self.tags)
        self.assertIn("当前 The X Subscription", self.cost)

    def test_private_calendar_contract_is_reachable_and_minimal(self) -> None:
        for needle in ("grokReminderForm", "grokReminderProduct", "grokReminderAt",
                       "grokReminderTimezone", "saveGrokReminder", "grokCalendarLink",
                       "copyGrokCalendar", "copyGrokManagement", "cancelGrokReminder"):
            self.assertIn(f'id="{needle}"', self.html)
        self.assertEqual(self.html.count('value="grok_'), 3)
        self.assertIn("手机已经响过", self.html)
        for needle in ('credentials: "omit"', 'referrerPolicy: "no-referrer"',
                       '"PATCH"', '"DELETE"', "second-person.grok-reminder.v1"):
            self.assertIn(needle, self.script)
        self.assertNotIn("password", self.script.lower())
        self.assertNotIn("cookie", self.script.lower())


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        return


class GrokResetBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_mobile_create_update_and_cancel_one_private_calendar(self) -> None:
        context = self.browser.new_context(viewport=MOBILE)
        page = context.new_page()
        errors: list[str] = []
        calls: list[tuple[str, dict]] = []
        state: dict[str, dict[str, object]] = {}
        next_id = 0
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("dialog", lambda dialog: dialog.accept())

        def route_public(route: Route) -> None:
            url = route.request.url
            if url == "https://codex-reset.com/api/forecast":
                route.fulfill(json={"probabilities": {"rounded_24h": 12, "rounded_48h": 24},
                                    "confidence": "low", "updated_at": dt.datetime.now(dt.UTC).isoformat(),
                                    "last_reset_at": "2026-10-14T01:00:00Z", "latest_alert": {}})
            elif url == "https://claude-resets.com/data/summary.json":
                route.fulfill(headers={"last-modified": "Wed, 15 Oct 2026 06:00:00 GMT"},
                              json={"lastResetAt": "2026-10-14T01:00:00Z"})
            elif url == "https://claude-resets.com/data/resets.json":
                route.fulfill(json={"providers": {"claude": {"events": [
                    {"date": "2026-10-14T01:00:00Z", "kind": "reset", "url": "https://x.com/ClaudeDevs/status/1"}
                ]}}})
            else:
                route.continue_()

        def route_api(route: Route) -> None:
            nonlocal next_id
            if fulfill_visit_fixture(route,include_identity=True): return
            request = route.request
            body = request.post_data_json or {}
            calls.append((request.method, body))
            if request.method == "POST":
                next_id += 1
                ident = "rr_" + ("a" if next_id == 1 else "b") * 32
                sub = {"id": ident, "product": body["product"],
                       "reset_at": body["reset_at"], "timezone": body["timezone"],
                       "reminders": body["reminders"], "expires_at": "2027-01-15T00:00:00Z"}
                state[ident] = sub
                route.fulfill(json={"ok": True, "subscription": sub,
                                    "manage_token": body["manage_token"],
                                    "feed_path": f"/api/reset-reminders/{ident}/calendar.ics?token={body['feed_token']}"})
            elif request.method == "PATCH":
                ident = request.url.split("/api/reset-reminders/", 1)[1]
                sub = {**state[ident], "product": body["product"], "reset_at": body["reset_at"],
                       "timezone": body["timezone"], "reminders": body["reminders"],
                       "expires_at": "2027-01-16T00:00:00Z"}
                state[ident] = sub
                route.fulfill(json={"ok": True, "subscription": sub})
            elif request.method == "DELETE":
                route.fulfill(json={"ok": True, "cancelled": True})
            else:
                route.fulfill(status=405, json={"ok": False})

        page.route("https://codex-reset.com/**", route_public)
        page.route("https://claude-resets.com/**", route_public)
        page.route("https://api.example.test/**", route_api)
        try:
            page.goto(f"{self.base}/codex.html?api=https%3A%2F%2Fapi.example.test", wait_until="networkidle")
            page.locator("#grokReminderForm").wait_for()
            self.assertEqual(page.locator("#grokSummary").inner_text(), "规则已核")
            self.assertEqual(page.locator("#grokPredictionValue").inner_text(), "不出概率")
            self.assertTrue(page.locator("#grokReminderTimezone").input_value())

            first = (dt.datetime.now() + dt.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
            page.locator("#grokReminderAt").fill(first)
            page.locator("#grokReminderTimezone").fill("Asia/Shanghai")
            page.locator('input[name="grok-reminder"][value="0"]').uncheck()
            page.locator("#saveGrokReminder").click()
            page.locator("#grokReminderStatus[data-state=ok]").wait_for()
            self.assertEqual(calls[0][0], "POST")
            self.assertEqual(calls[0][1]["reminders"], [1440, 60])
            self.assertRegex(calls[0][1]["feed_token"], r"^rrf_[a-z2-9]{48}$")
            self.assertRegex(calls[0][1]["manage_token"], r"^rrm_[a-z2-9]{48}$")
            expected = dt.datetime.strptime(first, "%Y-%m-%dT%H:%M").replace(
                tzinfo=ZoneInfo("Asia/Shanghai")).astimezone(dt.UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            self.assertEqual(calls[0][1]["reset_at"], expected)
            self.assertFalse(page.locator("#grokReminderActive").is_hidden())
            stored = page.evaluate("localStorage.getItem('second-person.grok-reminder.v1')")
            self.assertIn("rrm_", stored)
            self.assertIn('"version":2', stored)
            self.assertTrue(page.locator("#grokCalendarLink").get_attribute("href").startswith("webcal://"))

            second = (dt.datetime.now() + dt.timedelta(days=3)).strftime("%Y-%m-%dT%H:%M")
            page.locator("#grokReminderAt").fill(second)
            page.locator("#saveGrokReminder").click()
            page.wait_for_function("document.querySelector('#grokReminderStatus').textContent.includes('同一份日历已经更新')")
            self.assertEqual(calls[1][0], "PATCH")
            first_manage = calls[1][1]["manage_token"]

            page.locator("#grokReminderProduct").select_option("grok_bot_legacy")
            third = (dt.datetime.now() + dt.timedelta(days=4)).strftime("%Y-%m-%dT%H:%M")
            page.locator("#grokReminderAt").fill(third)
            page.locator("#grokReminderTimezone").fill("America/Los_Angeles")
            page.locator("#saveGrokReminder").click()
            page.locator("#grokReminderStatus[data-state=ok]").wait_for()
            self.assertEqual(calls[2][0], "POST")
            self.assertNotEqual(calls[2][1]["manage_token"], first_manage)
            store = json.loads(page.evaluate("localStorage.getItem('second-person.grok-reminder.v1')"))
            self.assertEqual(set(store["items"]), {"grok_shared", "grok_bot_legacy"})

            page.locator("#cancelGrokReminder").click()
            page.wait_for_function("document.querySelector('#grokReminderStatus').textContent.includes('已经取消')")
            self.assertEqual(calls[3][0], "DELETE")
            store = json.loads(page.evaluate("localStorage.getItem('second-person.grok-reminder.v1')"))
            self.assertEqual(set(store["items"]), {"grok_shared"})
            self.assertTrue(page.locator("#grokReminderActive").is_hidden())

            page.locator("#grokReminderProduct").select_option("grok_shared")
            self.assertFalse(page.locator("#grokReminderActive").is_hidden())
            page.locator("#cancelGrokReminder").click()
            page.wait_for_function("document.querySelector('#grokReminderStatus').textContent.includes('已经取消')")
            self.assertEqual(calls[4][0], "DELETE")
            store = json.loads(page.evaluate("localStorage.getItem('second-person.grok-reminder.v1')"))
            self.assertEqual(store["items"], {})

            widths = page.evaluate("() => ({inner:innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth})")
            self.assertEqual(widths, {"inner": 390, "doc": 390, "body": 390})
            small = page.evaluate("""() => [...document.querySelectorAll('#grokReminderForm input, #grokReminderForm select, #grokReminderForm button, #grokReminderActive a, #grokReminderActive button')]
              .filter(el => el.offsetParent !== null).map(el => el.getBoundingClientRect())
              .filter(r => r.width < 44 || r.height < 44).map(r => ({w:r.width,h:r.height}))""")
            self.assertEqual(small, [])
            self.assertEqual(errors, [])
        finally:
            context.close()

    def test_storage_denial_refuses_server_creation(self) -> None:
        context = self.browser.new_context(viewport=MOBILE)
        page = context.new_page()
        api_calls: list[str] = []
        page.add_init_script("""(() => {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key, value) {
            if (key === 'second-person.grok-reminder.v1') throw new DOMException('blocked', 'QuotaExceededError');
            return original.call(this, key, value);
          };
        })()""")
        page.route("https://codex-reset.com/**", lambda route: route.abort())
        page.route("https://claude-resets.com/**", lambda route: route.abort())
        page.route("https://api.example.test/**", lambda route: fulfill_visit_fixture(route,include_identity=True) or (api_calls.append(route.request.method),
                                                                   route.fulfill(json={"ok": True}))[1])
        try:
            page.goto(f"{self.base}/codex.html?api=https%3A%2F%2Fapi.example.test", wait_until="networkidle")
            future = (dt.datetime.now() + dt.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
            page.locator("#grokReminderAt").fill(future)
            page.locator("#grokReminderTimezone").fill("Asia/Shanghai")
            page.locator("#saveGrokReminder").click()
            page.locator("#grokReminderStatus[data-state=error]").wait_for()
            self.assertIn("没有向服务器建日历", page.locator("#grokReminderStatus").inner_text())
            self.assertEqual(api_calls, [])
            self.assertIsNone(page.evaluate("localStorage.getItem('second-person.grok-reminder.v1')"))
        finally:
            context.close()

    def test_lost_create_response_reuses_the_same_credentials(self) -> None:
        context = self.browser.new_context(viewport=MOBILE)
        page = context.new_page()
        bodies: list[dict] = []
        page.route("https://codex-reset.com/**", lambda route: route.abort())
        page.route("https://claude-resets.com/**", lambda route: route.abort())

        def route_api(route: Route) -> None:
            if fulfill_visit_fixture(route,include_identity=True): return
            body = route.request.post_data_json or {}
            bodies.append(body)
            if len(bodies) == 1:
                route.abort("failed")
                return
            ident = "rr_" + "c" * 32
            route.fulfill(json={"ok": True, "idempotent_replay": True,
                                "subscription": {"id": ident, "product": body["product"],
                                                 "reset_at": body["reset_at"], "timezone": body["timezone"],
                                                 "reminders": body["reminders"], "expires_at": "2027-01-15T00:00:00Z"},
                                "manage_token": body["manage_token"],
                                "feed_path": f"/api/reset-reminders/{ident}/calendar.ics?token={body['feed_token']}"})

        page.route("https://api.example.test/**", route_api)
        try:
            page.goto(f"{self.base}/codex.html?api=https%3A%2F%2Fapi.example.test", wait_until="networkidle")
            future = (dt.datetime.now() + dt.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
            page.locator("#grokReminderAt").fill(future)
            page.locator("#grokReminderTimezone").fill("Asia/Shanghai")
            page.locator("#saveGrokReminder").click()
            page.locator("#grokReminderStatus[data-state=error]").wait_for()
            page.locator("#saveGrokReminder").click()
            page.locator("#grokReminderStatus[data-state=ok]").wait_for()
            self.assertEqual(len(bodies), 2)
            self.assertEqual(bodies[0]["feed_token"], bodies[1]["feed_token"])
            self.assertEqual(bodies[0]["manage_token"], bodies[1]["manage_token"])
            self.assertIn("找回了刚才同一份", page.locator("#grokReminderStatus").inner_text())
        finally:
            context.close()

    def test_stale_grok_snapshot_hides_hardcoded_plan_claims(self) -> None:
        context = self.browser.new_context(viewport=MOBILE)
        page = context.new_page()
        stale = json.loads((ROOT / "data/grok-reset.json").read_text(encoding="utf-8"))
        stale["updated_at"] = "2025-01-01"
        page.route("https://codex-reset.com/**", lambda route: route.abort())
        page.route("https://claude-resets.com/**", lambda route: route.abort())
        page.route(f"{self.base}/data/grok-reset.json", lambda route: route.fulfill(json=stale))
        try:
            page.goto(f"{self.base}/codex.html", wait_until="networkidle")
            self.assertEqual(page.locator("#grokCurrentTitle").inner_text(), "当前方案待核")
            self.assertEqual(page.locator("#grokLegacyTitle").inner_text(), "旧版方案待核")
            self.assertNotIn("Premium／Super／Ultra", page.locator("#grokCurrentBody").inner_text())
            self.assertIn("不沿用", page.locator("#grokCurrentBody").inner_text())
        finally:
            context.close()

    def test_nonexistent_dst_wall_time_is_rejected_before_api(self) -> None:
        context = self.browser.new_context(viewport=MOBILE)
        page = context.new_page()
        api_calls: list[str] = []
        page.route("https://codex-reset.com/**", lambda route: route.abort())
        page.route("https://claude-resets.com/**", lambda route: route.abort())
        page.route("https://api.example.test/**", lambda route: fulfill_visit_fixture(route,include_identity=True) or (api_calls.append(route.request.method), route.abort())[1])
        try:
            page.goto(f"{self.base}/codex.html?api=https%3A%2F%2Fapi.example.test", wait_until="networkidle")
            page.locator("#grokReminderAt").fill("2027-03-14T02:30")
            page.locator("#grokReminderTimezone").fill("America/Los_Angeles")
            page.locator("#saveGrokReminder").click()
            page.locator("#grokReminderStatus[data-state=error]").wait_for()
            self.assertIn("夏令时", page.locator("#grokReminderStatus").inner_text())
            self.assertEqual(api_calls, [])
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main()
