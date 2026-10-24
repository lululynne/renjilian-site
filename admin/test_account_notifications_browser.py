#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Notification markers follow acknowledged state, including rejected writes."""
from __future__ import annotations

import json
import re
import unittest

import test_account_entry as account_entry

try:
    from playwright.sync_api import expect
except ImportError:  # pragma: no cover
    expect = None


class AccountNotificationsBrowserTests(account_entry.AccountEntryBrowserTests):
    api = "http://127.0.0.1:9"

    def open_notifications(self, *, mark_read_ok: bool, approve_ok: bool = True, refresh_ok: bool = True):
        api = self.api
        ctx = self.browser.new_context(viewport={"width": 390, "height": 844})
        calls = []
        notes = [
            {"id": f"n_fixture_{i}", "kind": "machine_comment_pending", "unread": True,
             "comment_id": f"c_fixture_{i}", "comment_state": "pending", "can_approve": True,
             "needs_site_review": False, "card_id": "fixture-card", "target": "kanread:fixture-card",
             "actor": {"handle": f"fixture-machine-{i}", "kind": "machine"}, "day": "2000-01-01"}
            for i in [1, 2]
        ]

        def fulfill(route):
            request = route.request
            path = request.url[len(api):].split("?")[0]
            calls.append((request.method, path))
            status = 200
            body = {"ok": True, "items": []}
            if path == "/api/config":
                body = {"ok": True}
            elif path == "/api/me":
                body = {"ok": True, "signed_in": True, "handle": "fixture-reader", "kind": "human",
                        "unread_count": sum(note["unread"] for note in notes)}
            elif path == "/api/me/notifications":
                if not refresh_ok and notes[0]["comment_state"] == "visible":
                    status, body = 503, {"error": "notifications_unavailable"}
                else:
                    body = {"ok": True, "items": notes, "next_cursor": None,
                            "unread_count": sum(note["unread"] for note in notes)}
            elif path == "/api/me/notifications/read" and request.method == "POST":
                if mark_read_ok:
                    for note in notes:
                        note["unread"] = False
                    body = {"ok": True, "unread_count": 0}
                else:
                    status, body = 503, {"error": "read_unavailable"}
            elif path == "/api/me/machine-comments/c_fixture_1/approve" and request.method == "POST":
                if approve_ok:
                    notes[0].update(unread=False, comment_state="visible", can_approve=False)
                    body = {"ok": True, "state": "visible", "public": True}
                else:
                    status, body = 403, {"error": "approval_denied"}
            route.fulfill(status=status, content_type="application/json", body=json.dumps(body),
                          headers={"access-control-allow-origin": self.base_url,
                                   "access-control-allow-credentials": "true",
                                   "access-control-allow-methods": "GET, POST, OPTIONS",
                                   "access-control-allow-headers": "Content-Type, X-RJ-Session"})

        ctx.route(api + "/**", fulfill)
        page = ctx.new_page()
        with page.expect_response(lambda r: r.url == api + "/api/me/notifications/read"
                                  and r.request.method == "POST") as read:
            page.goto(self.base_url + "/account.html?api=" + api, wait_until="load")
        read.value.finished()
        expect(page.locator("#feedList .rj-feed-item")).to_have_count(2)
        page.evaluate("() => new Promise(requestAnimationFrame)")
        return ctx, page, calls

    def test_acknowledged_read_clears_rendered_unread_markers(self) -> None:
        ctx, page, calls = self.open_notifications(mark_read_ok=True)
        try:
            expect(page.locator("#feedList .rj-feed-new")).to_have_count(0, timeout=2000)
            expect(page.locator("#feedList .rj-feed-old")).to_have_count(2)
            expect(page.locator(".account-entry .rj-dot")).to_have_count(0)
            self.assertEqual(calls.count(("POST", "/api/me/notifications/read")), 1)
        finally:
            ctx.close()

    def test_successful_owner_approval_clears_only_approved_row_marker(self) -> None:
        ctx, page, calls = self.open_notifications(mark_read_ok=False)
        try:
            expect(page.locator("#feedList .rj-feed-new")).to_have_count(2)
            approved = page.locator("#feedList .rj-feed-item").filter(has_text="fixture-machine-1")
            other = page.locator("#feedList .rj-feed-item").filter(has_text="fixture-machine-2")
            approved.get_by_role("button", name="放行", exact=True).click()
            expect(approved.locator(".rj-feed-done")).to_have_text("已放行 ✅")
            expect(approved.locator(".rj-feed-new")).to_have_count(0, timeout=2000)
            expect(approved.locator(".rj-feed-old")).to_have_count(1)
            expect(other.locator(".rj-feed-new")).to_have_count(1)
            expect(page.locator(".account-entry .rj-dot")).to_have_text("1")
            self.assertEqual(calls.count(("POST", "/api/me/machine-comments/c_fixture_1/approve")), 1)
        finally:
            ctx.close()

    def test_rejected_acknowledgements_keep_unread_markers_and_pending_action(self) -> None:
        ctx, page, _ = self.open_notifications(mark_read_ok=False, approve_ok=False)
        try:
            expect(page.locator("#feedList .rj-feed-new")).to_have_count(2)
            row = page.locator("#feedList .rj-feed-item").filter(has_text="fixture-machine-1")
            button = row.get_by_role("button", name="放行", exact=True)
            button.click()
            expect(page.locator("#feedNote")).to_have_text(re.compile(r".+"))
            expect(button).to_be_enabled()
            expect(row.locator(".rj-feed-done")).to_have_count(0)
            expect(page.locator("#feedList .rj-feed-new")).to_have_count(2)
            expect(page.locator(".account-entry .rj-dot")).to_have_text("2")
        finally:
            ctx.close()

    def test_unread_refresh_failure_does_not_undo_confirmed_approval(self) -> None:
        ctx, page, _ = self.open_notifications(mark_read_ok=False, refresh_ok=False)
        try:
            row = page.locator("#feedList .rj-feed-item").filter(has_text="fixture-machine-1")
            row.get_by_role("button", name="放行", exact=True).click()
            expect(row.locator(".rj-feed-done")).to_have_text("已放行 ✅")
            expect(row.locator(".rj-feed-new")).to_have_count(0, timeout=2000)
            expect(page.locator("#feedNote")).to_contain_text("放行完成")
            expect(page.locator(".account-entry .rj-dot")).to_have_text("2")
        finally:
            ctx.close()

    def test_late_unread_refresh_cannot_restore_an_older_count(self) -> None:
        ctx, page, _ = self.open_notifications(mark_read_ok=False)
        pending = []
        refreshes = []
        headers = {"access-control-allow-origin": self.base_url,
                   "access-control-allow-credentials": "true"}

        def refresh(route):
            refreshes.append(route.request.url)
            if len(refreshes) == 1:
                pending.append(route)
            else:
                route.fulfill(status=200, content_type="application/json",
                              body=json.dumps({"ok": True, "items": [], "unread_count": 0}), headers=headers)

        ctx.route(self.api + "/api/me/notifications", refresh)
        ctx.route(self.api + "/api/me/machine-comments/c_fixture_2/approve",
                  lambda route: route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"ok": True, "state": "visible", "public": True}), headers=headers))
        try:
            first = page.locator("#feedList .rj-feed-item").filter(has_text="fixture-machine-1")
            second = page.locator("#feedList .rj-feed-item").filter(has_text="fixture-machine-2")
            first.get_by_role("button", name="放行", exact=True).click()
            expect(first.locator(".rj-feed-done")).to_have_count(1)
            for _ in range(100):
                if pending:
                    break
                page.wait_for_timeout(10)
            self.assertEqual(len(pending), 1)
            second.get_by_role("button", name="放行", exact=True).click()
            expect(second.locator(".rj-feed-done")).to_have_count(1)
            expect(page.locator(".account-entry .rj-dot")).to_have_count(0)
            with page.expect_response(lambda r: r.url == self.api + "/api/me/notifications") as late:
                pending[0].fulfill(status=200, content_type="application/json",
                                 body=json.dumps({"ok": True, "items": [], "unread_count": 1}), headers=headers)
            late.value.finished()
            page.evaluate("() => new Promise(requestAnimationFrame)")
            expect(page.locator(".account-entry .rj-dot")).to_have_count(0, timeout=2000)
            self.assertEqual(len(refreshes), 2)
        finally:
            ctx.close()


if __name__ == "__main__":
    unittest.main()
