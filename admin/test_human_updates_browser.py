#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""N20 account UI with a contract fake backend. No production account, push service or permission prompt."""
from __future__ import annotations

import functools
import http.server
import json
import re
import threading
import unittest
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

from test_p25_machine_keys import MOCK, ROOT, VP390, FakeBackend, QuietHandler


TOKEN = "rj_h_" + "a" * 60
INBOX_ID = "hui_" + "x" * 100
SESSION_ID = "s_" + "h" * 32


class UpdateBackend(FakeBackend):
    def __init__(self, kind: str = "human", with_device: bool = True):
        super().__init__(kind, [])
        self.with_device = with_device
        self.version = 0
        self.channels = {"bound_machine_public_activity": False, "kanread_updates": False,
                         "reset_updates": False}
        self.token_items: list[dict] = []
        self.seen = False
        self.last_test = None

    def update_status(self) -> dict:
        devices = []
        if self.with_device:
            devices.append({"id": "hps_" + "d" * 32, "label": "测试设备", "active": True,
                            "created_day": "2031-01-02", "vapid_key_version": 1,
                            "last_test": self.last_test})
        return {"ok": True, "version": self.version, "channels": self.channels,
                "bound_machines": [{"handle": "fake-bot", "display_name": "小机机"}],
                "unread_count": 0 if self.seen else 1, "delivery_health": "push_connected",
                "devices": {"active_count": len(devices), "limit": 5, "items": devices},
                "push_config": {"available": True, "vapid_public_key": "B" + "a" * 86,
                                "vapid_key_version": 1},
                "activation_enabled": True, "delivery_enabled": True}

    def handle_route(self, route) -> None:
        req = route.request
        parsed = urlparse(req.url)
        path, method = parsed.path, req.method
        if method == "OPTIONS":
            return super().handle_route(route)
        body = json.loads(req.post_data) if req.post_data else None
        full = path + ("?" + parsed.query if parsed.query else "")
        if path == "/api/me":
            self.calls.append((method, full, body))
            return self.reply(route, 200, {"ok": True, "signed_in": True, "handle": self.handle,
                                           "kind": self.kind, "probation_remaining": 0,
                                           "session_id": SESSION_ID})
        if path == "/api/config":
            self.calls.append((method, full, body))
            return self.reply(route, 200, {"ok": True, "human_updates_available": True})
        if path == "/api/me/updates/status" and method == "GET":
            self.calls.append((method, full, body))
            return self.reply(route, 200, self.update_status())
        if path == "/api/human-update-tokens" and method == "GET":
            self.calls.append((method, full, body))
            return self.reply(route, 200, {"ok": True, "items": self.token_items,
                                           "active_count": len(self.token_items), "limit": 5})
        if path == "/api/human-update-tokens" and method == "POST":
            self.calls.append((method, full, body))
            item = {"id": "ht_" + "k" * 32, "label": body.get("label"),
                    "scopes": body["scopes"], "created_day": "2031-01-02",
                    "expires_day": "2031-07-01", "last_used_day": None,
                    "revoked": False, "active": True}
            self.token_items = [item]
            return self.reply(route, 200, {"ok": True, "token": TOKEN, "key": item})
        if re.fullmatch(r"/api/human-update-tokens/ht_[a-z]+", path) and method == "DELETE":
            self.calls.append((method, full, body)); self.token_items = []
            return self.reply(route, 200, {"ok": True})
        if path == "/api/me/updates" and method == "GET":
            self.calls.append((method, full, body))
            return self.reply(route, 200, {"ok": True, "items": [{
                "id": INBOX_ID, "event_id": "ue_public", "channel": "kanread_updates",
                "kind": "kanread_published", "created_at_ms": 2, "occurred_at_ms": 1,
                "seen": self.seen, "withdrawn": False, "actionable": True,
                "title": "刊读有一篇新文章", "body": "已经公开，可以打开阅读。",
                "route_key": "kanread", "route_ref": "kr-one"}], "next_cursor": None})
        if path == "/api/me/updates/channels" and method == "PUT":
            self.calls.append((method, full, body)); self.version += 1; self.channels = body["channels"]
            return self.reply(route, 200, {"ok": True, "version": self.version,
                                           "channels": self.channels})
        if path == "/api/me/updates/disable-all" and method == "POST":
            self.calls.append((method, full, body)); self.version += 1
            self.channels = {key: False for key in self.channels}
            return self.reply(route, 200, {"ok": True, "version": self.version,
                                           "channels": self.channels})
        if path == "/api/me/updates/seen" and method == "POST":
            self.calls.append((method, full, body)); self.seen = True
            return self.reply(route, 200, {"ok": True, "seen_ids": body["ids"]})
        if re.fullmatch(r"/api/me/updates/devices/hps_[a-z]+/test", path) and method == "POST":
            self.calls.append((method, full, body))
            self.last_test = {"id": "pd_probe", "evidence_state": "show_notification_completed",
                              "send_disposition": "closed", "work_closed": True}
            return self.reply(route, 200, {"ok": True, "test": {"id": "pd_probe",
                                           "evidence_state": "queued", "send_disposition": "ready"}})
        if re.fullmatch(r"/api/me/updates/devices/hps_[a-z]+", path) and method == "DELETE":
            self.calls.append((method, full, body)); self.with_device = False
            return self.reply(route, 200, {"ok": True, "device": {"active": False}})
        return super().handle_route(route)


class HumanUpdatesBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(QuietHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.site = f"http://127.0.0.1:{cls.server.server_port}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()
        cls.thread.join(timeout=2)

    def open(self, fake: UpdateBackend):
        context = self.browser.new_context(viewport=VP390)
        context.grant_permissions(["clipboard-read", "clipboard-write"], origin=self.site)
        page = context.new_page(); errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.route(MOCK + "/**", fake.handle_route)
        page.goto(f"{self.site}/account.html?api={MOCK}", wait_until="networkidle")
        page.locator("#panelMe").wait_for(state="visible")
        return context, page, errors

    def test_human_channels_tokens_feed_and_device_actions(self) -> None:
        fake = UpdateBackend()
        context, page, errors = self.open(fake)
        try:
            page.locator("#humanUpdatesBox").wait_for(state="visible")
            self.assertIn("设备通知已连接", page.locator("#huState").inner_text())
            self.assertFalse(any(call[1] == "/api/me/updates/seen" for call in fake.calls),
                             "打开列表就自动清了已读")

            page.locator("#huChannelKanread").check()
            page.locator("#huSave").click()
            page.wait_for_function("document.getElementById('huChannelNote').textContent.includes('保存好了')")
            saved = [call for call in fake.calls if call[1] == "/api/me/updates/channels"][-1][2]
            self.assertEqual(saved["version"], 0)
            self.assertEqual(saved["expected_handle"], fake.handle)
            self.assertEqual(saved["expected_session_id"], SESSION_ID)
            self.assertEqual(saved["channels"], {"bound_machine_public_activity": False,
                                                  "kanread_updates": True,
                                                  "reset_updates": False})

            page.locator("#huTokenLabel").fill("家里电脑")
            page.locator("#huTokenManage").check()
            page.locator("#huTokenIssue").click()
            page.locator("#huTokenPlain").wait_for(state="visible")
            self.assertEqual(page.locator("#huTokenValue").inner_text(), TOKEN)
            issued = [call for call in fake.calls if call[1] == "/api/human-update-tokens" and call[0] == "POST"][-1][2]
            self.assertEqual(issued["scopes"], ["updates:read", "updates:manage"])
            self.assertNotIn(TOKEN, page.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)"))
            page.locator("#huTokenHide").click()
            self.assertEqual(page.locator("#huTokenValue").inner_text(), "")

            page.locator("#huMarkSeen").click()
            page.wait_for_function("document.getElementById('huUpdatesNote').textContent.includes('标为已读')")
            seen = [call for call in fake.calls if call[1] == "/api/me/updates/seen"][-1][2]
            self.assertEqual(seen["ids"], [INBOX_ID])

            page.get_by_role("button", name="发一条测试通知").click()
            page.wait_for_function("document.getElementById('huDeviceNote').textContent.includes('排队')")
            page.wait_for_function("document.getElementById('huDevices').textContent.includes('系统显示步骤已完成')")
            test_call = [call for call in fake.calls if call[1].endswith("/test")][-1][2]
            self.assertEqual(test_call, {"expected_handle": fake.handle,
                                         "expected_session_id": SESSION_ID})

            self.assertEqual(page.evaluate("document.documentElement.scrollWidth"), 390)
            small = page.evaluate("""() => [...document.querySelectorAll('#humanUpdatesBox button, #humanUpdatesBox .rju-channel, #humanUpdatesBox .rju-manage')]
              .filter(x => x.offsetParent !== null).map(x => { const r=x.getBoundingClientRect(); return [x.textContent.trim(),r.width,r.height]; })
              .filter(x => x[1] < 44 || x[2] < 44)""")
            self.assertEqual(small, [])
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            context.close()

    def test_machine_account_never_sees_or_fetches_human_update_panel(self) -> None:
        fake = UpdateBackend(kind="machine", with_device=False)
        context, page, errors = self.open(fake)
        try:
            self.assertTrue(page.locator("#humanUpdatesBox").is_hidden())
            self.assertFalse(any(call[1].startswith("/api/me/updates") or
                                 call[1].startswith("/api/human-update-tokens") for call in fake.calls))
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            context.close()

    def test_root_service_worker_registers_without_requesting_notification_permission(self) -> None:
        fake = UpdateBackend()
        context, page, errors = self.open(fake)
        try:
            before = page.evaluate("Notification.permission")
            result = page.evaluate("""async () => {
              const registration = await navigator.serviceWorker.register('/sw.js', {scope: '/'});
              await navigator.serviceWorker.ready;
              const answer = {scope: registration.scope, script: registration.active && registration.active.scriptURL};
              await registration.unregister();
              return answer;
            }""")
            self.assertEqual(result["scope"], self.site + "/")
            self.assertEqual(result["script"], self.site + "/sw.js")
            self.assertEqual(page.evaluate("Notification.permission"), before)
            self.assertEqual([e for e in errors if "Failed to load resource" not in e], [])
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main()
