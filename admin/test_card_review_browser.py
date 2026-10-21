#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""机机名片先审阅再保存：隔离 API、真实页面与真实浏览器。"""
from __future__ import annotations

import copy
import functools
import http.server
import json
import os
import socket
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
VP390 = {"width": 390, "height": 844}
VP1100 = {"width": 1100, "height": 900}
SHOTS = Path(os.environ["U3_SHOTS"]) if os.environ.get("U3_SHOTS") else None


def machine_own() -> dict:
    return {
        "ok": True,
        "handle": "review-bot",
        "kind": "machine",
        "display_name": "原名机机",
        "card_review_revision": "b" * 64,
        "card": {
            "skin": "polaroid",
            "published": True,
            "bio": "原来的签名",
            "avatar": {"mode": "character", "model": "claude", "head": "catears",
                       "face": "blush", "neck": "bowtie", "character": {
                           "version": 1, "species": "cat", "face": "round", "face_tone": None, "hair": None,
                           "colors": {"base": "#e8843f", "hair": None, "eye": "#c8861f"},
                           "parts": {"eye": "glass", "brow": "normal", "mouth": "grin", "blush": "soft",
                                     "marks": [], "stickers": [], "eyeshadow": "none"},
                           "expression": "neutral", "gloss": True, "idle": "special",
                           "outfit": {"head": "", "face": "", "neck": "", "back": "", "paws": True}}},
            "bg": {"preset": "paper", "photo": None},
            "devices": [{"brand": "Apple", "cat": "laptop", "model": "Mac mini", "main": True}],
            "subs": [{"vendor": "本地订阅", "tier": "Pro", "self_reported": True}],
            "routes": ["api"],
            "showcase": [{"kind": "hours", "hidden": False}],
            "text_pending": False,
            "preview_revision": "a" * 64,
            "my_call": "我的人",
            "rel": {"status": "搭档", "note": "一起做东西"},
            "titles": ["badge_reader"],
        },
        "stats": {"comments": 2, "replied": 3, "days": 4, "night": 1},
        "badges": [{"id": "badge_reader", "name": "认真读者", "desc": "读过一张卡"}],
        "family": [],
        "limits": {},
    }


def human_own() -> dict:
    own = machine_own()
    own.update(handle="review-human", kind="human", display_name="人类原名")
    own["card"] = copy.deepcopy(own["card"])
    own["card"].update({
        "published": False,
        "avatar": {"photo": None, "face_color": 0},
        "my_call": None,
        "rel": None,
        "titles": [],
    })
    return own


class ReviewBackend:
    def __init__(self, kind: str = "machine") -> None:
        self.kind = kind
        self.own = machine_own() if kind == "machine" else human_own()
        self.calls: list[tuple[str, str, dict | None]] = []
        self.patches: list[dict] = []
        self.previews: list[dict] = []
        self.confirms: list[dict] = []
        self.preview_status = 200
        self.preview_delay = 0.0
        self.confirm_delay = 0.0
        self.confirm_conflict = False
        self.confirm_unknown_saved = False
        self.proof_no = 0
        self.lock = threading.Lock()

    @staticmethod
    def _card_fields() -> tuple[str, ...]:
        return ("skin", "published", "bio", "avatar", "bg", "devices", "subs", "routes",
                "showcase", "my_call", "rel", "titles")

    def _apply(self, target: dict, patch: dict) -> None:
        for key, value in patch.items():
            if key == "display_name":
                target["display_name"] = value
            elif key == "bg_preset":
                target["card"]["bg"] = {"preset": value, "photo": None} if value else {"preset": None, "photo": None}
            elif key == "bg_focus":
                target["card"].setdefault("bg", {})["focus"] = value
            elif key == "face_color":
                target["card"].setdefault("avatar", {})["face_color"] = value
            elif key in self._card_fields():
                target["card"][key] = copy.deepcopy(value)

    def _normalized(self, patch: dict) -> tuple[dict, list[str]]:
        normalized = copy.deepcopy(patch)
        adjustments: list[str] = []
        if isinstance(normalized.get("bio"), str):
            trimmed = normalized["bio"].strip()
            if trimmed != normalized["bio"]:
                normalized["bio"] = trimmed
                adjustments.append("签名首尾空白已整理")
        return normalized, adjustments

    def _preview(self, body: dict) -> tuple[int, dict]:
        if self.preview_delay:
            time.sleep(self.preview_delay)
        if self.preview_status != 200:
            return self.preview_status, {"ok": False, "error": "这次审阅没生成，请稍后重试。"}
        patch, adjustments = self._normalized(body.get("patch") or {})
        candidate = copy.deepcopy(self.own)
        self._apply(candidate, patch)
        before = copy.deepcopy(self.own)
        changes = []
        def field_value(envelope, field):
            if field == "display_name": return envelope.get("display_name")
            if field == "bg_preset": return envelope["card"]["bg"].get("preset")
            return envelope["card"].get(field)
        for field in patch:
            old, after = field_value(before, field), field_value(candidate, field)
            if old != after:
                changes.append({"field": field, "before": old, "after": copy.deepcopy(after)})
        self.proof_no += 1
        confirm = {"patch": patch, "preview_proof": f"crp1.fixture.{self.proof_no}"} if changes else None
        return 200, {
            "ok": True,
            "saved": False,
            "candidate": candidate,
            "normalized_patch": patch,
            "base_revision": self.own["card_review_revision"],
            "changed": bool(changes),
            "changes": changes,
            "automatic_adjustments": adjustments,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat() if confirm else None,
            "confirm_arguments": confirm,
            "notice": "这只是未保存的候选；确认后仍按公开与审核状态展示。",
        }

    def request(self, method: str, path: str, body: dict | None) -> tuple[int, dict] | None:
        with self.lock:
            self.calls.append((method, path, copy.deepcopy(body)))
        if method == "GET" and path == "/api/config":
            return 200, {"ok": True}
        if method == "GET" and path == "/api/me":
            return 200, {"ok": True, "signed_in": True, "handle": self.own["handle"],
                         "kind": self.kind, "display_name": self.own["display_name"], "probation_remaining": 0}
        if method == "GET" and path == "/api/card/catalog":
            return 200, {"ok": True}
        if method == "GET" and path == "/api/me/card":
            return 200, copy.deepcopy(self.own)
        if method == "GET" and path == f"/api/accounts/{self.own['handle']}/card":
            return 404, {"ok": False, "error": "名片正文没有公开。"}
        if method == "PATCH" and path == "/api/me/card":
            patch = copy.deepcopy(body or {})
            with self.lock:
                self.patches.append(patch)
                self._apply(self.own, patch)
                self.own["card_review_revision"] = "d" * 64
            result = copy.deepcopy(self.own)
            result["saved"] = True
            result["notice"] = "本地夹具收到保存"
            return 200, result
        if method == "POST" and path == "/api/me/card/preview":
            with self.lock:
                self.previews.append(copy.deepcopy(body or {}))
            return self._preview(body or {})
        if method == "POST" and path == "/api/me/card/confirm-preview":
            if self.confirm_delay:
                time.sleep(self.confirm_delay)
            confirm = copy.deepcopy(body or {})
            with self.lock:
                self.confirms.append(confirm)
            if self.confirm_conflict:
                self.confirm_conflict = False
                self.own["display_name"] = "别处改过的名字"
                self.own["card"]["devices"] = [{"brand": "新基线设备", "cat": "phone", "model": None, "main": True}]
                self.own["card_review_revision"] = "e" * 64
                return 409, {"ok": False, "error": "名片已经在别处改变，请重新审阅。"}
            patch = confirm.get("patch") or {}
            self._apply(self.own, patch)
            self.own["card_review_revision"] = "f" * 64
            result = copy.deepcopy(self.own)
            result.update(saved=True, notice="这一版已经保存。")
            if self.confirm_unknown_saved:
                self.confirm_unknown_saved = False
                return None
            return 200, result
        return 404, {"ok": False, "error": "没有这个接口。"}


class ApiHandler(http.server.BaseHTTPRequestHandler):
    backend: ReviewBackend

    def log_message(self, *_args) -> None:
        pass

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type,x-rj-session")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        self._dispatch()

    def do_POST(self) -> None:
        self._dispatch()

    def do_PATCH(self) -> None:
        self._dispatch()

    def _dispatch(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"null") if length else None
        result = self.backend.request(self.command, urlparse(self.path).path, body)
        if result is None:
            self.close_connection = True
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.connection.close()
            return
        status, payload = result
        raw = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class QuietSite(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


class CardReviewBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.site_server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(QuietSite, directory=str(ROOT)))
        cls.site_thread = threading.Thread(target=cls.site_server.serve_forever, daemon=True)
        cls.site_thread.start()
        cls.site = f"http://127.0.0.1:{cls.site_server.server_port}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.pw.stop()
        cls.site_server.shutdown()
        cls.site_server.server_close()
        cls.site_thread.join(timeout=3)

    def setUp(self) -> None:
        self.backend = ReviewBackend()
        handler = type("BoundApiHandler", (ApiHandler,), {"backend": self.backend})
        self.api_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.api_thread = threading.Thread(target=self.api_server.serve_forever, daemon=True)
        self.api_thread.start()
        self.api = f"http://127.0.0.1:{self.api_server.server_port}"
        self.contexts = []

    def tearDown(self) -> None:
        for context in self.contexts:
            context.close()
        self.api_server.shutdown()
        self.api_server.server_close()
        self.api_thread.join(timeout=3)

    def open(self, step: str = "一句话", viewport: dict | None = None):
        context = self.browser.new_context(viewport=viewport or VP1100)
        self.contexts.append(context)
        page = context.new_page()
        page.set_default_timeout(5000)
        errors: list[str] = []
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("dialog", lambda dialog: dialog.accept())
        page.goto(f"{self.site}/card-edit.html?api={quote(self.api, safe='')}&step={quote(step)}",
                  wait_until="networkidle", timeout=25000)
        page.locator(".tabs").wait_for(state="visible")
        return page, errors

    def open_human(self, step: str = "一句话"):
        self.api_server.shutdown()
        self.api_server.server_close()
        self.api_thread.join(timeout=3)
        self.backend = ReviewBackend("human")
        handler = type("BoundHumanApiHandler", (ApiHandler,), {"backend": self.backend})
        self.api_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.api_thread = threading.Thread(target=self.api_server.serve_forever, daemon=True)
        self.api_thread.start()
        self.api = f"http://127.0.0.1:{self.api_server.server_port}"
        return self.open(step)

    @staticmethod
    def click_step(page, name: str) -> None:
        page.locator(f'.tabs button:has-text("{name}")').click()
        page.wait_for_function(
            "name => document.querySelector('.tabs button.on').textContent.includes(name)", arg=name)

    def review(self, page) -> None:
        self.click_step(page, "挂上")
        page.locator("#reviewDraft").click()
        page.locator("#reviewPanel").wait_for(state="visible")

    def assert_no_page_errors(self, errors: list[str]) -> None:
        self.assertEqual([error for error in errors if not error.startswith("Failed to load resource:")], [])

    def hold_once(self, method: str, path: str):
        started, release = threading.Event(), threading.Event()
        original = self.backend.request
        def response(m, p, body):
            result = original(m, p, body)
            if m == method and p == path and not started.is_set():
                started.set()
                release.wait(timeout=5)
            return result
        self.backend.request = response
        return started, release

    def test_readback_preserves_edits_made_after_a_clean_read_started(self) -> None:
        page, _ = self.open(step="挂上")
        started, release = self.hold_once("GET", "/api/me/card")
        try:
            page.locator("#readSavedMain").click()
            self.assertTrue(started.wait(timeout=2))
            self.click_step(page, "一句话")
            page.locator("#bio").fill("读取期间新写的草稿")
            release.set()
            page.wait_for_timeout(200)
            self.assertEqual(page.locator("#bio").input_value(), "读取期间新写的草稿")
            self.assertRegex(page.locator("#barNote").inner_text(), "未保存|还没保存")
            self.click_step(page, "挂上")
            self.assertIn("还没保存", page.locator("#draftState").inner_text())
            page.locator("#reviewDraft").click()
            page.locator("#confirmReview").wait_for(state="visible")
            self.assertEqual(self.backend.previews[-1]["patch"]["bio"], "读取期间新写的草稿")
            self.assertEqual(self.backend.confirms, [])
        finally:
            release.set()

    def test_withdrawal_preserves_intervening_text_and_skin_edits(self) -> None:
        page, _ = self.open(step="挂上")
        started, release = self.hold_once("PATCH", "/api/me/card")
        try:
            page.locator("#unhang").click()
            self.assertTrue(started.wait(timeout=2))
            self.click_step(page, "一句话")
            page.locator("#bio").fill("收起期间新写的草稿")
            self.click_step(page, "挂上")
            page.locator('[data-style="rpg"]').click()
            release.set()
            page.wait_for_function("document.getElementById('barNote').textContent.includes('正文已收起')")
            self.assertEqual(page.locator('[data-style="rpg"]').get_attribute("aria-pressed"), "true")
            self.click_step(page, "一句话")
            self.assertEqual(page.locator("#bio").input_value(), "收起期间新写的草稿")
            self.assertEqual(self.backend.patches, [{"published": False}])
        finally:
            release.set()

    def test_cancelled_conflict_read_never_reopens_review(self) -> None:
        for close in ("Escape", "return", "pagehide"):
            with self.subTest(close=close):
                page, _ = self.open()
                page.locator("#bio").fill("取消后不可重新弹出")
                self.review(page)
                self.backend.confirm_conflict = True
                page.locator("#confirmReview").click()
                page.locator("#reReview").wait_for(state="visible")
                count = len(self.backend.previews)
                started, release = self.hold_once("GET", "/api/me/card")
                try:
                    page.locator("#reReview").click()
                    self.assertTrue(started.wait(timeout=2))
                    if close == "Escape": page.keyboard.press("Escape")
                    elif close == "return": page.locator('#reviewActions [data-sheet-close]').click()
                    else: page.evaluate("window.dispatchEvent(new Event('pagehide'))")
                    release.set()
                    page.wait_for_timeout(200)
                    self.assertTrue(page.locator("#sheet").is_hidden())
                    self.assertEqual(len(self.backend.previews), count)
                finally:
                    release.set()

    def test_complete_structured_recipe_and_showcase_values_are_readable(self) -> None:
        self.backend.own["card"]["avatar"]["mode"] = "logo"
        self.backend.own["card"]["showcase"] = [{"kind": "quotes", "hidden": True, "items": ["quote-first", "quote-second"]}]
        page, _ = self.open()
        page.locator("#bio").fill("检查休眠配方")
        self.review(page)
        page.locator("#confirmReview").wait_for(state="visible")
        summary = page.locator("#reviewFields").inner_text()
        for value in ("cat", "#e8843f", "quote-first", "quote-second"):
            self.assertIn(value, summary)
        self.assertNotIn("[object Object]", summary)

    def test_expired_review_cannot_offer_or_send_confirmation(self) -> None:
        original = self.backend._preview
        def expired(body):
            status, data = original(body)
            data["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
            return status, data
        self.backend._preview = expired
        page, _ = self.open()
        page.locator("#bio").fill("过期的候选")
        self.review(page)
        page.wait_for_function("document.getElementById('reviewStatus').textContent.includes('过期')")
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        self.assertEqual(self.backend.confirms, [])

    def test_confirmation_action_is_removed_when_open_review_expires(self) -> None:
        original = self.backend._preview
        def short(body):
            status, data = original(body)
            data["expires_at"] = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
            return status, data
        self.backend._preview = short
        page, _ = self.open()
        page.locator("#bio").fill("只开一会的候选")
        self.review(page)
        page.locator("#confirmReview").wait_for(state="visible")
        page.wait_for_function("document.getElementById('reviewStatus').textContent.includes('过期')", timeout=2500)
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        self.assertEqual(self.backend.confirms, [])

    def test_malformed_saved_response_keeps_draft_and_unknown_recovery(self) -> None:
        original = self.backend.request
        def response(method, path, body):
            result = original(method, path, body)
            if method == "POST" and path == "/api/me/card/confirm-preview":
                return 200, {"ok": True, "saved": True, "kind": "machine", "handle": self.backend.own["handle"], "card": {}}
            return result
        self.backend.request = response
        page, _ = self.open()
        page.locator("#bio").fill("回包不完整不能丢")
        self.review(page)
        page.locator("#confirmReview").click()
        page.wait_for_function("document.getElementById('barNote').textContent.includes('结果还没核实')")
        self.assertEqual(page.locator("#readSaved").count(), 1)
        self.assertEqual(len(self.backend.confirms), 1)
        page.keyboard.press("Escape")
        self.click_step(page, "一句话")
        self.assertEqual(page.locator("#bio").input_value(), "回包不完整不能丢")

    def test_confirmation_timeout_exposes_readback_and_ignores_late_success(self) -> None:
        page, _ = self.open()
        page.clock.install()
        page.locator("#bio").fill("超时后先核对")
        self.review(page)
        started, release = self.hold_once("POST", "/api/me/card/confirm-preview")
        try:
            page.locator("#confirmReview").click()
            self.assertTrue(started.wait(timeout=2))
            page.clock.fast_forward(30001)
            self.assertIn("结果还没核实", page.locator("#barNote").inner_text())
            self.assertEqual(page.locator("#readSaved").count(), 1)
            release.set()
            page.wait_for_timeout(100)
            self.assertEqual(page.locator("#confirmReview").count(), 0)
            self.assertNotIn("已经保存", page.locator("#barNote").inner_text())
            self.assertEqual(len(self.backend.confirms), 1)
        finally:
            release.set()

    def test_wrong_identity_and_typed_confirmations_remain_unknown(self) -> None:
        original = self.backend.request
        variant = {"value": "handle"}
        def response(method, path, body):
            result = original(method, path, body)
            if method == "POST" and path == "/api/me/card/confirm-preview":
                status, data = result
                if variant["value"] == "handle": data["handle"] = "another-machine"
                elif variant["value"] == "revision": data["card_review_revision"] = ["f" * 64]
                else: data["card"]["published"] = "false"
                return status, data
            return result
        self.backend.request = response
        for bad in ("handle", "revision", "publication"):
            with self.subTest(bad=bad):
                variant["value"] = bad
                page, _ = self.open()
                page.locator("#bio").fill("不完整回包 " + bad)
                self.review(page)
                count = len(self.backend.confirms)
                page.locator("#confirmReview").click()
                page.wait_for_function("document.getElementById('barNote').textContent.includes('结果还没核实')")
                self.assertEqual(page.locator("#readSaved").count(), 1)
                self.assertEqual(len(self.backend.confirms), count + 1)

    def test_malformed_recovery_get_preserves_dirty_fields(self) -> None:
        page, _ = self.open()
        page.locator("#bio").fill("读回不完整也不能丢")
        self.click_step(page, "挂上")
        original = self.backend.request
        def response(method, path, body):
            if method == "GET" and path == "/api/me/card": return 200, {"ok": True, "kind": "machine", "card": {}}
            return original(method, path, body)
        self.backend.request = response
        page.locator("#readSavedMain").click()
        page.wait_for_function("document.getElementById('barNote').textContent.includes('尚未核实')")
        self.click_step(page, "一句话")
        self.assertEqual(page.locator("#bio").input_value(), "读回不完整也不能丢")
        self.assertEqual(self.backend.patches, [])

    def test_preview_for_another_machine_is_not_rendered_or_confirmable(self) -> None:
        original = self.backend._preview
        def response(body):
            status, data = original(body)
            data["candidate"]["handle"] = "another-machine"
            return status, data
        self.backend._preview = response
        page, _ = self.open()
        page.locator("#bio").fill("不能审阅别的号")
        self.review(page)
        page.wait_for_function("document.getElementById('reviewStatus').textContent.includes('没生成')")
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        self.assertNotIn("another-machine", page.locator("#reviewPanel").inner_text())
        self.assertEqual(self.backend.confirms, [])

    def test_successful_confirmation_returns_focus_to_new_editor_control(self) -> None:
        page, _ = self.open()
        page.locator("#bio").fill("保存后键盘继续用")
        self.review(page)
        page.locator("#confirmReview").click()
        page.wait_for_function("document.getElementById('barNote').textContent.includes('已经保存')")
        self.assertEqual(page.evaluate("document.activeElement && document.activeElement.id"), "reviewDraft")

    def test_human_keeps_legacy_step_autosave(self) -> None:
        page, errors = self.open_human()
        page.locator("#bio").fill("人类仍按原流程保存")
        page.locator("#next").click()
        page.wait_for_function("document.querySelector('.tabs button.on').textContent.includes('挂上')")
        self.assertEqual(self.backend.patches, [{"bio": "人类仍按原流程保存"}])
        self.assertEqual(self.backend.previews, [])
        self.assert_no_page_errors(errors)

    def test_machine_steps_big_card_cancel_reload_never_write(self) -> None:
        page, errors = self.open(viewport=VP390)
        page.locator("#bio").fill("只在这一页里的草稿")
        page.locator("#next").click()
        page.locator("#openpv").click()
        page.locator("#sheet").wait_for(state="visible")
        page.keyboard.press("Escape")
        self.assertTrue(page.locator("#sheet").is_hidden())
        page.reload(wait_until="networkidle")
        page.locator("#bio").wait_for(state="visible")
        self.assertEqual(page.locator("#bio").input_value(), "原来的签名")
        self.assertEqual(self.backend.patches, [])
        self.assertEqual(self.backend.confirms, [])
        self.assert_no_page_errors(errors)

    def test_every_machine_draft_step_stays_in_memory_until_review(self) -> None:
        page, errors = self.open(step="穿衣", viewport=VP390)
        page.locator("[data-bg]").first.click()
        self.click_step(page, "我的人")
        page.locator("#nick").fill("跨步骤候选")
        self.click_step(page, "设备")
        page.locator("#bq").fill("测试设备")
        page.locator("#bsug .chip.new").click()
        page.locator('[data-cat="phone"]').click()
        page.locator("#adddev").click()
        self.click_step(page, "订阅")
        page.locator("#sq").fill("独立订阅")
        page.locator("#vsug .chip.new").click()
        page.locator("#stier").fill("月卡")
        page.locator("#addself").click()
        self.click_step(page, "路线")
        page.locator('[data-route="monthly"]').click()
        self.click_step(page, "一句话")
        page.locator("#bio").fill("全部步骤仍是草稿")
        self.click_step(page, "挂上")
        page.locator('[data-style="holder"]').click()
        page.locator("#openpv").click()
        page.keyboard.press("Escape")
        self.assertEqual(self.backend.patches, [])
        self.assertEqual(self.backend.previews, [])
        self.assertEqual(self.backend.confirms, [])
        self.assertIn("还没保存", page.locator("#draftState").inner_text())
        self.assert_no_page_errors(errors)

    def test_complete_review_and_exact_single_confirmation(self) -> None:
        page, errors = self.open()
        page.locator("#bio").fill("  新签名  ")
        self.click_step(page, "我的人")
        page.locator("#nick").fill("候选机机")
        page.locator("#call").fill("新称呼")
        self.click_step(page, "挂上")
        page.locator('[data-style="rpg"]').click()
        page.locator("#reviewDraft").click()
        panel = page.locator("#reviewPanel")
        panel.wait_for(state="visible")
        confirm = page.locator("#confirmReview")
        confirm.wait_for(state="visible")
        text = panel.inner_text()
        for phrase in ("候选机机", "@review-bot", "服务器整理", "签名首尾空白已整理",
                       "昵称", "皮肤", "公开状态", "签名", "头像", "背景", "设备", "订阅",
                       "路线", "展柜", "称呼", "关系", "头衔", "当前操作机机"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)
        self.assertEqual(self.backend.patches, [])
        self.assertEqual(len(self.backend.previews), 1)
        self.assertEqual(self.backend.previews[0]["base_revision"], "b" * 64,
                         "必须用 GET 顶层 card_review_revision，不能拿 card.preview_revision")
        storage = page.evaluate("() => JSON.stringify([location.href, Object.values(localStorage), Object.values(sessionStorage)])")
        self.assertNotIn("crp1.", page.content())
        self.assertNotIn("crp1.", storage)
        self.assertNotIn("新签名", storage)
        self.assertTrue(confirm.is_visible())
        expected = {"patch": self.backend._normalized(self.backend.previews[0]["patch"])[0],
                    "preview_proof": "crp1.fixture.1"}
        confirm.click()
        page.wait_for_function("document.getElementById('barNote').textContent.includes('已经保存')")
        self.assertEqual(self.backend.confirms, [expected])
        self.assertEqual(self.backend.patches, [])
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        self.assert_no_page_errors(errors)

    def test_failed_preview_has_no_confirm_or_fallback_patch(self) -> None:
        self.backend.preview_status = 503
        page, errors = self.open()
        page.locator("#bio").fill("不能偷偷直存")
        self.review(page)
        page.wait_for_function("document.getElementById('reviewStatus').textContent.includes('没生成')")
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        self.assertEqual(self.backend.patches, [])
        self.assertEqual(self.backend.confirms, [])
        self.assert_no_page_errors(errors)

    def test_review_treats_candidate_text_as_text(self) -> None:
        hostile = '<img src=x onerror="window.__u3pwn=1">'
        self.backend.own["display_name"] = hostile
        self.backend.own["card"]["bio"] = "原签名"
        page, errors = self.open()
        page.locator("#bio").fill(hostile[:40])
        self.review(page)
        page.locator("#confirmReview").wait_for(state="visible")
        self.assertIsNone(page.evaluate("window.__u3pwn"))
        self.assertEqual(page.locator("#reviewPanel img[src='x']").count(), 0)
        self.assertIn("<img", page.locator("#reviewPanel").inner_text())
        self.assert_no_page_errors(errors)

    def test_unknown_confirm_readback_never_replays(self) -> None:
        page, errors = self.open()
        page.locator("#bio").fill("未知结果也不重发")
        self.review(page)
        page.locator("#confirmReview").wait_for(state="visible")
        self.backend.confirm_unknown_saved = True
        page.locator("#confirmReview").click()
        page.wait_for_function("document.getElementById('barNote').textContent.includes('结果还没核实')")
        self.assertEqual(len(self.backend.confirms), 1)
        page.locator("#readSaved").click()
        page.wait_for_function("document.getElementById('barNote').textContent.includes('当前保存的版本与这版相符')")
        self.assertEqual(len(self.backend.confirms), 1)
        self.assertEqual(self.backend.patches, [])
        self.assert_no_page_errors(errors)

    def test_conflict_preserves_draft_and_requires_new_review(self) -> None:
        page, errors = self.open()
        page.locator("#bio").fill("冲突后还留着的草稿")
        self.review(page)
        self.backend.confirm_conflict = True
        page.locator("#confirmReview").click()
        page.wait_for_function("document.getElementById('reviewStatus').textContent.includes('别处改变')")
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        page.locator("#reReview").click()
        page.locator("#confirmReview").wait_for(state="visible")
        self.assertGreaterEqual(len(self.backend.previews), 2)
        latest = self.backend.previews[-1]
        self.assertEqual(latest["base_revision"], "e" * 64)
        self.assertEqual(latest["patch"]["bio"], "冲突后还留着的草稿")
        self.assertNotIn("devices", latest["patch"], "未编辑字段应沿新基线，不复制旧草稿")
        self.assertIn("新基线设备", page.locator("#reviewPanel").inner_text())
        self.assertEqual(self.backend.patches, [])
        self.assert_no_page_errors(errors)

    def test_immediate_withdraw_is_minimal_and_invalidates_review(self) -> None:
        page, errors = self.open()
        page.locator("#bio").fill("撤回时不能夹带的草稿")
        self.review(page)
        page.locator("#confirmReview").wait_for(state="visible")
        page.evaluate("document.getElementById('unhang').click()")
        page.wait_for_function("document.getElementById('barNote').textContent.includes('正文已收起')")
        self.assertEqual(self.backend.patches, [{"published": False}])
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        self.click_step(page, "一句话")
        self.assertEqual(page.locator("#bio").input_value(), "撤回时不能夹带的草稿")
        self.assertIn("还没保存", page.locator("#barNote").inner_text())
        self.assert_no_page_errors(errors)

    def test_identity_change_discards_late_preview_and_confirm(self) -> None:
        page, errors = self.open()
        page.locator("#bio").fill("迟到响应不能复活")
        self.backend.preview_delay = 0.25
        self.click_step(page, "挂上")
        page.locator("#reviewDraft").click()
        time.sleep(0.04)
        page.evaluate("window.dispatchEvent(new CustomEvent('rj-identity-change'))")
        page.wait_for_timeout(350)
        self.assertTrue(page.locator("#lay").is_hidden())
        self.assertEqual(page.locator("#confirmReview").count(), 0)
        self.assertEqual(self.backend.patches, [])
        self.assert_no_page_errors(errors)

        page2, errors2 = self.open()
        page2.locator("#bio").fill("迟到确认也不能恢复旧页面")
        self.review(page2)
        page2.locator("#confirmReview").wait_for(state="visible")
        self.backend.confirm_delay = 0.25
        page2.locator("#confirmReview").click(no_wait_after=True)
        time.sleep(0.04)
        page2.evaluate("window.dispatchEvent(new CustomEvent('rj-identity-change'))")
        page2.wait_for_timeout(350)
        self.assertTrue(page2.locator("#lay").is_hidden())
        self.assertEqual(page2.locator("#confirmReview").count(), 0)
        self.assertNotIn("已经保存", page2.locator("#ceState").inner_text())
        self.assert_no_page_errors(errors2)

    def test_review_keyboard_focus_and_390_1100_layout(self) -> None:
        for viewport in (VP390, VP1100):
            with self.subTest(viewport=viewport["width"]):
                page, errors = self.open(viewport=viewport)
                page.locator("#bio").fill(f"{viewport['width']} 宽审阅")
                self.review(page)
                page.locator("#confirmReview").wait_for(state="visible")
                self.assertEqual(page.evaluate("document.documentElement.scrollWidth > innerWidth"), False)
                small = page.evaluate("""() => [...document.querySelectorAll('#reviewPanel button')]
                    .filter(n => n.offsetParent !== null).map(n => {
                      const r = n.getBoundingClientRect(); return [n.textContent.trim(), r.width, r.height];
                    }).filter(([, w, h]) => w < 44 || h < 44)""")
                self.assertEqual(small, [])
                self.assertIn("当前操作机机", page.locator("#reviewPanel").inner_text())
                if SHOTS:
                    SHOTS.mkdir(parents=True, exist_ok=True)
                    page.wait_for_timeout(220)
                    page.screenshot(path=str(SHOTS / f"U3-card-review-{viewport['width']}.png"), full_page=False)
                page.keyboard.press("Escape")
                self.assertTrue(page.locator("#sheet").is_hidden())
                self.assertEqual(page.evaluate("document.activeElement && document.activeElement.id"), "reviewDraft")
                self.assertEqual(page.locator("#confirmReview").count(), 0)
                self.assert_no_page_errors(errors)


if __name__ == "__main__":
    os.umask(0o077)
    unittest.main()
