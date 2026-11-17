#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Private avatar praise: actual pages/fetch against public-only browser fixtures.

These tests do not prove Worker authorization, D1 behavior, or production rollout.
The existing public fixture supplies committed public AIN data; never serve a
canonical checkout's private data directly.
"""
from __future__ import annotations

import copy
import functools
import http.server
import json
import re
import threading
import time
import unittest
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

from playwright.sync_api import Error as PlaywrightError, expect, sync_playwright

from test_account_entry import PublicFixtureHandler, public_browser_context
from test_card_review_browser import ReviewBackend, machine_own
from visit_fixture import visit_response

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:9"
TARGET = "praise-target"
DAY = "2031-01-02"
REVISION = "a" * 64
CURSOR = "praise1." + "a" * 80
PARTS = [
    {"part": "overall", "part_value": "avatar", "part_label": "整体"},
    {"part": "eyes", "part_value": "glass", "part_label": "眼睛"},
    {"part": "hat", "part_value": "catears", "part_label": "帽子"},
    {"part": "blush", "part_value": "soft", "part_label": "腮红"},
    {"part": "motion", "part_value": "special", "part_label": "动作"},
]
SAFE = "abcdefghijkmnpqrstuvwxyz23456789"
# A test-only observer records storage at the native fetch boundary. It forwards
# the same request untouched; production code needs no export or feature flag.
FETCH_OBSERVER = """(() => {
  const original = window.fetch;
  const evidence = [];
  Object.defineProperty(window, '__avatarPraiseFetchEvidence', {value: evidence});
  window.fetch = function(input, options) {
    let parsed;
    try { parsed = new URL(typeof input === 'string' ? input : input.url, location.href); } catch (_) {}
    if (parsed && parsed.pathname === '/api/avatar-praises'
        && options && options.method === 'POST') {
      let body = null, records = [];
      try { body = JSON.parse(options.body); } catch (_) {}
      try {
        records = Object.keys(localStorage).map(key => {
          const raw = localStorage.getItem(key);
          let value = null;
          try { value = JSON.parse(raw); } catch (_) {}
          return {key, raw, value};
        });
      } catch (_) {}
      evidence.push({body, records});
    }
    return original.apply(this, arguments);
  };
})();"""
STORED = """() => Object.keys(localStorage).map(key => {
  const raw = localStorage.getItem(key);
  let value = null;
  try { value = JSON.parse(raw); } catch (_) {}
  return {key, raw, value};
})"""


def receipt_id(number):
    return "ap_" + "a" * 30 + SAFE[number // len(SAFE)] + SAFE[number % len(SAFE)]


def sent_item(number, handle):
    return {"id": receipt_id(number), "target_handle": handle, "day": DAY,
            "created_at_ms": 1925078400000 + number, "withdrawn_by_you": False}


def sent_envelope(items=(), more=False, cursor=None):
    return {"ok": True, "items": copy.deepcopy(list(items)), "has_more": more,
            "next_cursor": cursor, "private": True,
            "retention": "until_withdrawal_or_deletion"}


def matching_intent(value, secret):
    """Discover a persisted intent without coupling tests to its storage schema."""
    if isinstance(value, dict):
        if value.get("withdraw_secret") == secret:
            return value
        for nested in value.values():
            found = matching_intent(nested, secret)
            if found is not None:
                return found
    elif isinstance(value, list):
        for nested in value:
            found = matching_intent(nested, secret)
            if found is not None:
                return found
    return None


class PraiseBackend(ReviewBackend):
    """Reuse public card data and neutral routes; preserve query and identity.

    rj_praise_fixture is a synthetic HttpOnly cookie, not a production credential.
    Its pairing with the real X-RJ-Session selector verifies browser transport;
    authoritative authentication remains a separate Worker integration test.
    """

    def __init__(self):
        super().__init__("human")
        self.actor = None
        self.session = None
        self.generation = 0
        self.target = machine_own()
        self.target.update(handle=TARGET, display_name="夸夸目标机")
        self.published = False
        self.options_status = 200
        self.parts = copy.deepcopy(PARTS)
        self.revision = REVISION
        self.identity_status = 200
        self.requests = []
        self.private_reads = []
        self.transport_errors = []
        self.accepted = {}
        self.outgoing = {}
        self.pages = {}
        self.send_reply = None
        self.send_status = 200
        self.withdraw_reply = None
        self.hold_next = None
        self.held = None

    def identity(self, kind=None, handle=None):
        self.generation += 1
        self.kind = kind or "human"
        self.actor = handle or ("praise-human" if kind == "human" else "praise-machine") if kind else None
        self.session = "s_" + SAFE[self.generation] * 32 if kind else None
        if kind:
            self.own = machine_own()
            self.own.update(handle=self.actor, kind=kind, display_name="当前公开名字")
            if kind == "human":
                self.own["card"]["avatar"] = {"photo": None, "face_color": 0}

    @staticmethod
    def reply(route, status, payload):
        origin = route.request.headers.get("origin", "*")
        route.fulfill(status=status, content_type="application/json",
                      body=json.dumps(payload, ensure_ascii=False),
                      headers={"access-control-allow-origin": origin,
                               "access-control-allow-credentials": "true",
                               "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
                               "access-control-allow-headers": "content-type,x-rj-session"})

    def release(self):
        held, self.held = self.held, None
        if held is None:
            raise AssertionError("Expected a held request")
        route, status, payload = held
        try:
            self.reply(route, status, payload)
        except PlaywrightError as error:
            # An identity change may correctly abort the intercepted fetch.
            if not re.search(r"closed|already handled|Invalid InterceptionId|intercept.*invalid",
                             str(error), re.I):
                raise

    def dispatch(self, route):
        request = route.request
        parsed = urlsplit(request.url)
        path, query, method = parsed.path, parse_qs(parsed.query), request.method
        if method == "OPTIONS":
            return self.reply(route, 204, None)
        body = request.post_data_json if request.post_data else None
        headers = request.all_headers()
        call = {"method": method, "path": path, "query": query,
                "body": copy.deepcopy(body), "headers": headers, "actor": self.actor}
        self.requests.append(call)
        if path.startswith("/api/avatar-praises") or path == "/api/me/avatar-praises":
            if self.actor and (headers.get("x-rj-session") != self.session
                              or "rj_praise_fixture=" + self.actor not in headers.get("cookie", "")):
                self.transport_errors.append((method, path))
                return self.reply(route, 401, {"ok": False, "error": "登录凭据已经失效。"})
            if method == "POST" and path == "/api/avatar-praises":
                # The observer captured this synchronously before native fetch.
                evidence = request.frame.page.evaluate("window.__avatarPraiseFetchEvidence")
                matching = [entry for entry in evidence if entry["body"] == body]
                call["storage_before_send"] = matching[-1]["records"] if matching else None
        result = self.response(method, path, query, body)
        if self.hold_next == (method, path):
            self.hold_next = None
            self.held = (route, result[0], copy.deepcopy(result[1]))
            return
        self.reply(route, *result)

    def response(self, method, path, query, body):
        if path == "/api/me" and method == "GET":
            if self.identity_status != 200:
                return self.identity_status, {"ok": False, "error": "暂时无法确认当前登录身份。"}
            if not self.actor:
                return 200, {"ok": True, "signed_in": False}
            return 200, {"ok": True, "signed_in": True, "handle": self.actor,
                         "kind": self.kind, "display_name": "当前公开名字", "probation_remaining": 0}
        if path == "/api/accounts/" + TARGET + "/card":
            target = copy.deepcopy(self.target)
            return 200, {"ok": True, "handle": TARGET, "kind": target["kind"],
                         "display_name": target["display_name"], "published": self.published,
                         "card": target["card"] if self.published else None,
                         "avatar": target["card"]["avatar"], "stats": target["stats"],
                         "badges": [], "family": [], "is_me": self.actor == TARGET}
        if path == "/api/avatar-praises/options" and method == "GET":
            if query.get("handle") != [TARGET]:
                return 400, {"ok": False, "error": "目标不正确。"}
            if self.options_status != 200:
                return self.options_status, {"ok": False, "error": "这个目标暂时不能接收夸夸。"}
            return 200, {"ok": True, "handle": TARGET, "avatar_revision": self.revision,
                         "parts": copy.deepcopy(self.parts)}
        if path == "/api/avatar-praises" and method == "POST":
            if self.send_status != 200:
                return self.send_status, {"ok": False, "error": "Synthetic send rejection"}
            body = body or {}
            key = (self.actor, body.get("idem_key"))
            replay = key in self.accepted
            if not replay:
                item = sent_item(len(self.accepted) + 1, body.get("handle"))
                self.accepted[key] = {"body": copy.deepcopy(body), "item": item,
                                      "actor": self.actor, "withdrawn": False}
                if self.actor:
                    self.outgoing.setdefault(self.actor, []).insert(0, item)
            record = self.accepted[key]
            if body != record["body"]:
                return 409, {"ok": False, "error": "请保留原来的发送内容。"}
            result = {"ok": True, "id": record["item"]["id"], "recorded": not replay,
                      "replayed": replay, "day": DAY}
            if self.send_reply is not None:
                result, self.send_reply = self.send_reply, None
            return 200, result
        if path == "/api/me/avatar-praises":
            if query.get("view") != ["sent"] or query.get("limit") != ["20"]:
                self.private_reads.append(query)
                return 403, {"ok": False, "error": "网页只能读取当前身份的发出记录。"}
            if not self.actor:
                return 401, {"ok": False, "error": "请先登录。"}
            cursor = query.get("cursor", [None])[0]
            return copy.deepcopy(self.pages.get(
                (self.actor, cursor), (200, sent_envelope(self.outgoing.get(self.actor, [])))))
        match = re.fullmatch(r"/api/avatar-praises/(ap_[a-km-np-z2-9]{32})/withdraw", path)
        if match and method == "POST":
            wanted = match.group(1)
            record = next((r for r in self.accepted.values() if r["item"]["id"] == wanted), None)
            own = next((r for r in self.outgoing.get(self.actor, []) if r["id"] == wanted), None)
            if record and record["actor"] is None:
                if body != {"withdraw_secret": record["body"]["withdraw_secret"]}:
                    return 403, {"ok": False, "error": "撤回凭据不正确。"}
            elif not own or body != {}:
                return 403, {"ok": False, "error": "只能撤回当前账号发出的记录。"}
            if record:
                record["withdrawn"] = True
            if own:
                own["withdrawn_by_you"] = True
            result = {"ok": True, "withdrawn": True}
            if self.withdraw_reply is not None:
                result, self.withdraw_reply = self.withdraw_reply, None
            return 200, result
        neutral = {
            "/api/me/bindings": {"ok": True, "items": [], "slots": {"left": 1}},
            "/api/me/notifications": {"ok": True, "items": [], "unread_count": 0, "next_cursor": None},
            "/api/me/profile": {"ok": True, "handle": self.actor, "wall_public": False,
                                "tags": {}, "limits": {"subscription": 8, "device": 6, "route": 3}},
            "/api/me/mailbox/overview": {"ok": True, "items": []},
            "/api/me/mailbox/settings": {"ok": True, "mailbox": {"enabled": False,
                "visibility": "friends", "address": None, "accept_requests": True, "human_view_open": False}},
            "/api/machine-tokens": {"ok": True, "machine": self.actor, "items": [],
                                    "active_count": 0, "limit": 5},
            "/api/sessions": {"ok": True, "items": []},
        }
        if method == "GET" and path in neutral:
            return 200, neutral[path]
        visit = visit_response(method, path + ("?" + "&".join(
            key + "=" + quote(value[0]) for key, value in query.items()) if query else ""), body)
        if visit is not None:
            return 200, visit
        return super().request(method, path, body)


class QuietPraiseSite(PublicFixtureHandler):
    def log_message(self, *_args):
        pass


class AvatarPraiseBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(QuietPraiseSite, directory=str(ROOT)))
        cls.server.private_data_requests = 0
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.site = "http://127.0.0.1:" + str(cls.server.server_port)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        if cls.server.private_data_requests:
            raise AssertionError("Browser reached the protected private AIN path")

    def setUp(self):
        self.backend = PraiseBackend()
        self.contexts = []
        self.console = []
        self.page_errors = []

    def tearDown(self):
        for context in self.contexts:
            context.close()
        self.assertEqual(self.backend.private_reads, [], "A website route tried a private received view")
        self.assertEqual(self.backend.transport_errors, [], "Lost cookie/session identity")
        self.assertEqual(self.page_errors, [])

    def context(self, kind=None, width=390, init=None):
        self.backend.identity(kind)
        context = public_browser_context(self.browser, viewport={"width": width, "height": 900})
        self.contexts.append(context)
        context.route(API + "/**", self.backend.dispatch)
        context.add_init_script(FETCH_OBSERVER)
        if kind:
            context.add_cookies([{"name": "rj_praise_fixture", "value": self.backend.actor,
                                  "url": self.site, "httpOnly": True, "sameSite": "Lax"}])
            value = {"session_id": self.backend.session, "generation": self.backend.generation}
            context.add_init_script(
                "if(!localStorage.getItem('rj_session_selector')){"
                "localStorage.setItem('rj_session_selector'," + json.dumps(json.dumps(value)) + ");"
                "localStorage.setItem('rj_signed_in','1');}")
        if init:
            context.add_init_script(init)
        return context

    def open(self, context, account=False, require_area=True):
        page = context.new_page()
        page.set_default_timeout(6000)
        page.on("console", lambda message: self.console.append(message.text))
        page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        page.on("dialog", lambda dialog: dialog.accept())
        route = "account.html" if account else "card.html?u=" + TARGET
        join = "?" if account else "&"
        page.goto(self.site + "/" + route + join + "api=" + quote(API, safe=""), wait_until="networkidle")
        if require_area:
            expect(page.locator("#avatarPraiseSent" if account else "#avatarPraise")).to_be_visible()
        return page

    @staticmethod
    def area(page):
        return page.locator("#avatarPraise")

    @staticmethod
    def submit(page):
        return page.locator("#avatarPraise").get_by_role("button", name="送出夸夸", exact=True)

    @staticmethod
    def retry(page):
        return page.get_by_role("button", name="核对上次发送", exact=True)

    @staticmethod
    def withdraw(page):
        return page.get_by_role("button", name="撤回", exact=True)

    def part(self, page, value):
        marker = self.area(page).locator('[data-part="' + value + '"]').first
        expect(marker).to_be_attached()
        if marker.evaluate("e=>e.matches('input[type=radio],[role=radio]')"):
            return marker
        radio = marker.locator('input[type=radio],[role=radio]')
        if radio.count():
            return radio.first
        # data-part may live on an explicit label using a for association.
        control_id = marker.get_attribute("for")
        if control_id:
            return page.locator('[id="' + control_id + '"]')
        self.fail("A visible part must have a keyboard-operable radio control")

    def choose(self, page, value="eyes"):
        radio = self.part(page, value)
        radio.check()
        expect(radio).to_be_checked()

    def posts(self, path="/api/avatar-praises"):
        return [r for r in self.backend.requests if r["method"] == "POST" and r["path"] == path]

    def send(self, page):
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"
                                  and r.request.method == "POST"):
            self.submit(page).click()

    def stored_record(self, records, body):
        matches = [r for r in records if matching_intent(r["value"], body["withdraw_secret"]) is not None]
        self.assertEqual(len(matches), 1, "One separate complete intent must hold this credential")
        record = matches[0]
        intent = matching_intent(record["value"], body["withdraw_secret"])
        self.assertEqual({key: intent.get(key) for key in body}, body)
        self.assertNotIn(record["key"], ("rj_signed_in", "rj_session_selector"))
        self.assertNotIn(body["withdraw_secret"], record["key"])
        versioned = re.search(r'"(?:v|version)"\s*:\s*(?:[1-9]\d*|"[^"]+")', record["raw"])
        self.assertTrue(versioned or re.search(r"(?:^|[_:.-])v[1-9]\d*(?:[_:.-]|$)", record["key"]))
        return record

    def assert_secret_private(self, page, body):
        secret = body["withdraw_secret"]
        self.assertNotIn(secret, page.content())
        self.assertNotIn(secret, page.url)
        self.assertTrue(all(secret not in text for text in self.console))
        for call in self.backend.requests:
            self.assertNotIn(secret, call["path"])
            self.assertNotIn(secret, json.dumps(call["query"]))

    def refresh_sent(self, page):
        button = page.locator("#avatarPraiseSent").get_by_role(
            "button", name=re.compile("查看我发出的夸夸|刷新发出记录"))
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/me/avatar-praises"):
            button.click()

    def wait_held(self, page):
        """Wait for the route callback, not merely the earlier request event."""
        deadline = time.monotonic() + 5
        while self.backend.held is None and time.monotonic() < deadline:
            # Pump Playwright's dispatcher until the explicit fixture condition.
            # This is a bounded condition wait, not a delay used as an assertion.
            page.wait_for_timeout(10)
        self.assertIsNotNone(self.backend.held, "The fixture did not hold the expected request")

    def switch(self, context, kind, handle=None):
        """A second real page writes the selector, causing the native storage event."""
        self.backend.identity(kind, handle)
        context.clear_cookies(name="rj_praise_fixture")
        if kind:
            context.add_cookies([{"name": "rj_praise_fixture", "value": self.backend.actor,
                                  "url": self.site, "httpOnly": True, "sameSite": "Lax"}])
        peer = context.new_page()
        peer.goto(self.site + "/privacy.html", wait_until="load")
        peer.evaluate("""value => localStorage.setItem('rj_session_selector', JSON.stringify(value))""",
                      {"session_id": self.backend.session, "generation": self.backend.generation})
        peer.close()

    def test_anonymous_persists_complete_intent_before_send_without_leaking_secret(self):
        page = self.open(self.context())
        self.assertEqual(self.posts(), [])
        self.choose(page)
        self.assertEqual(self.posts(), [], "Selecting a part must never send")
        self.send(page)
        expect(self.withdraw(page)).to_be_visible()
        call = self.posts()[0]
        body = call["body"]
        self.assertEqual(set(body), {"handle", "part", "avatar_revision", "idem_key", "withdraw_secret"})
        self.assertEqual((body["handle"], body["part"], body["avatar_revision"]), (TARGET, "eyes", REVISION))
        self.assertRegex(body["withdraw_secret"], r"^[0-9a-f]{64}$")
        self.assertTrue(isinstance(body["idem_key"], str) and body["idem_key"])
        self.assertNotEqual(body["idem_key"], body["withdraw_secret"])
        self.assertIsNotNone(call["storage_before_send"], "Native fetch observer missed the request")
        self.stored_record(call["storage_before_send"], body)
        self.assert_secret_private(page, body)
        expect(self.area(page)).to_contain_text(re.compile("请求.*(?:受理|接受)"))
        expect(self.area(page)).to_contain_text(re.compile("浏览器"))
        expect(self.area(page)).to_contain_text(re.compile("清除|清理|清空"))
        expect(self.area(page)).to_contain_text(re.compile("丢失|失去|无法撤回"))

    def test_storage_write_readback_and_crypto_failures_never_send_anonymously(self):
        failures = [
            "Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}});",
            """const originalGet=Storage.prototype.getItem;
               Storage.prototype.getItem=function(key){
                 return /^(rj_signed_in|rj_session_selector)$/.test(key)
                   ? originalGet.call(this,key) : null;
               };""",
            """Object.defineProperty(crypto,'getRandomValues',{value(){
                 throw new DOMException('disabled','OperationError');
               }});""",
        ]
        for script in failures:
            with self.subTest(failure=script[:45]):
                page = self.open(self.context(init=script))
                self.choose(page)
                self.submit(page).click()
                expect(self.area(page).locator(".avatar-praise-status").first).to_have_text(
                    "这个浏览器没能安全保存撤回凭据，所以这次没有发送匿名夸夸，以免之后无法撤回。可以换一个能保存本机数据的浏览器，或登录后再发送。")
                page.wait_for_load_state("networkidle")
                self.assertEqual(self.posts(), [])
                page.context.close()
                self.contexts.remove(page.context)

    def test_human_signature_is_explicit_default_off_and_only_opt_in_sends_name(self):
        for signed in (False, True):
            with self.subTest(signed=signed):
                page = self.open(self.context("human"))
                checkbox = self.area(page).get_by_role("checkbox", name=re.compile("署名"))
                expect(checkbox).not_to_be_checked()
                self.choose(page)
                if signed:
                    checkbox.check()
                self.send(page)
                expect(self.withdraw(page)).to_be_visible()
                body = self.posts()[-1]["body"]
                required = {"handle", "part", "avatar_revision", "idem_key"}
                self.assertTrue(required <= set(body) <= required | {"sign_name"})
                self.assertIs(body.get("sign_name", False), signed)
                page.context.close()
                self.contexts.remove(page.context)

    def test_machine_send_is_own_signed_actor_without_human_or_anonymous_fields(self):
        page = self.open(self.context("machine"))
        self.choose(page, "overall")
        self.send(page)
        expect(self.withdraw(page)).to_be_visible()
        call = self.posts()[0]
        self.assertNotEqual(call["actor"], call["body"]["handle"])
        self.assertEqual(set(call["body"]), {"handle", "part", "avatar_revision", "idem_key"})
        signature = self.area(page).get_by_role("checkbox", name=re.compile("署名"))
        if signature.count():
            expect(signature).to_be_disabled()

    def test_unknown_response_blocks_duplicate_and_retries_the_exact_original_intent(self):
        page = self.open(self.context())
        self.choose(page, "hat")
        self.backend.send_reply = {"ok": True, "id": receipt_id(1), "day": DAY,
                                   "recorded": True, "replayed": True}  # XOR violation
        self.backend.hold_next = ("POST", "/api/avatar-praises")
        with page.expect_request(lambda r: urlsplit(r.url).path == "/api/avatar-praises"
                                 and r.method == "POST"):
            self.submit(page).click()
        self.wait_held(page)
        expect(self.submit(page)).to_be_disabled()
        self.submit(page).dispatch_event("click")
        self.assertEqual(len(self.posts()), 1)
        original = copy.deepcopy(self.posts()[0]["body"])
        self.backend.release()
        expect(self.retry(page)).to_be_visible()
        page.wait_for_load_state("networkidle")
        self.assertEqual(len(self.posts()), 1, "Uncertainty must never auto-replay")
        self.backend.revision = "b" * 64
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"):
            self.retry(page).click()
        expect(self.withdraw(page)).to_be_visible()
        self.assertEqual([c["body"] for c in self.posts()], [original, original])
        self.assertEqual(len(self.backend.accepted), 1)

    def test_signed_unknown_retry_preserves_actor_signature_and_exact_intent(self):
        for kind, signed in (("human", False), ("human", True), ("machine", None)):
            with self.subTest(kind=kind, signed=signed):
                context = self.context(kind)
                page = self.open(context)
                self.choose(page, "eyes")
                if signed:
                    self.area(page).locator(".avatar-praise-sign input").check()
                self.backend.send_reply = {"ok": True, "id": "malformed"}
                before = len(self.backend.accepted)
                self.send(page)
                original = copy.deepcopy(self.posts()[-1]["body"])
                expect(self.retry(page)).to_be_visible()
                expect(self.area(page).locator(".avatar-praise-send")).to_be_disabled()
                if kind == "human":
                    self.assertEqual(original["sign_name"], signed)
                    expect(self.area(page).locator(".avatar-praise-sign input")).to_be_disabled()
                else:
                    self.assertNotIn("sign_name", original)
                self.assertNotIn("withdraw_secret", original)
                with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"
                                          and r.request.method == "POST"):
                    self.retry(page).click()
                expect(self.withdraw(page)).to_be_visible()
                self.assertEqual(self.posts()[-1]["body"], original)
                self.assertEqual(self.posts()[-1]["actor"], self.backend.actor)
                self.assertEqual(len(self.backend.accepted), before + 1)
                context.close()
                self.contexts.remove(context)

    def test_anonymous_reload_recovers_exact_intent_and_hidden_target_keeps_withdrawal(self):
        context = self.context()
        page = self.open(context)
        self.choose(page)
        self.backend.send_reply = {"ok": True}  # Accepted by fixture, receipt lost.
        self.send(page)
        expect(self.retry(page)).to_be_visible()
        original = copy.deepcopy(self.posts()[0]["body"])
        page.reload(wait_until="networkidle")
        expect(self.retry(page)).to_be_visible()
        self.assertEqual(len(self.posts()), 1)
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"):
            self.retry(page).click()
        expect(self.withdraw(page)).to_be_visible()
        self.assertEqual(self.posts()[-1]["body"], original)
        self.backend.options_status = 404
        account = self.open(context, account=True)
        expect(account.get_by_text(re.compile(TARGET)).first).to_be_visible()
        expect(self.withdraw(account)).to_be_visible()
        self.withdraw(account).click()
        expect(account.get_by_text(re.compile("已撤回|已经撤回")).first).to_be_visible()
        self.assertEqual(self.posts("/api/avatar-praises/" + receipt_id(1) + "/withdraw")[-1]["body"],
                         {"withdraw_secret": original["withdraw_secret"]})
        self.stored_record(account.evaluate(STORED), original)
        self.assert_secret_private(account, original)

    def test_malformed_anonymous_withdrawal_keeps_credential_and_requires_explicit_retry(self):
        page = self.open(self.context())
        self.choose(page)
        self.send(page)
        expect(self.withdraw(page)).to_be_visible()
        body = self.posts()[0]["body"]
        path = "/api/avatar-praises/" + receipt_id(1) + "/withdraw"
        self.backend.withdraw_reply = {"ok": True, "withdrawn": "true"}
        with page.expect_response(lambda r: urlsplit(r.url).path == path):
            self.withdraw(page).click()
        expect(self.area(page)).to_contain_text(re.compile("未确认|未知|核对|重试"))
        pending_withdraw = page.get_by_role("button", name=re.compile("撤回")).first
        expect(pending_withdraw).to_be_visible()
        self.stored_record(page.evaluate(STORED), body)
        page.wait_for_load_state("networkidle")
        self.assertEqual(len(self.posts(path)), 1)
        pending_withdraw.click()
        expect(self.area(page)).to_contain_text(re.compile("已撤回|已经撤回"))
        self.assertEqual([r["body"] for r in self.posts(path)],
                         [{"withdraw_secret": body["withdraw_secret"]}] * 2)
        self.assert_secret_private(page, body)

    def test_two_tabs_preserve_distinct_records_and_never_overwrite_corruption(self):
        context = self.context()
        first = self.open(context)
        second = self.open(context)
        self.choose(first, "eyes")
        self.backend.hold_next = ("POST", "/api/avatar-praises")
        self.submit(first).click()
        self.wait_held(first)
        self.choose(second, "blush")
        self.send(second)
        # Both pages see the other tab's distinct intent through live storage events.
        expect(first.locator(".avatar-praise-local .avatar-praise-row")).to_have_count(2)
        expect(second.locator(".avatar-praise-local .avatar-praise-row")).to_have_count(2)
        self.backend.release()
        expect(self.withdraw(first)).to_have_count(2)
        expect(self.withdraw(second)).to_have_count(2)
        first_body, second_body = [call["body"] for call in self.posts()]
        self.assertNotEqual(first_body["withdraw_secret"], second_body["withdraw_secret"])
        records = first.evaluate(STORED)
        first_record = self.stored_record(records, first_body)
        second_record = self.stored_record(records, second_body)
        self.assertNotEqual(first_record["key"], second_record["key"])
        corrupt = "{corrupt-preserve-this-record"
        first.evaluate("x=>localStorage.setItem(x.key,x.value)",
                       {"key": first_record["key"], "value": corrupt})
        second.reload(wait_until="networkidle")
        self.assertEqual(second.evaluate("key=>localStorage.getItem(key)", first_record["key"]), corrupt)
        self.stored_record(second.evaluate(STORED), second_body)
        self.assertEqual(len(self.posts()), 2)
        self.assert_secret_private(second, second_body)

    def test_send_http_rejections_and_unknown_retries_remain_honest(self):
        for status in (400, 401, 403, 404, 409, 429, 503):
            with self.subTest(status=status):
                context = self.context()
                page = self.open(context)
                self.choose(page)
                self.backend.send_status = status
                before = len(self.posts())
                self.send(page)
                original = copy.deepcopy(self.posts()[-1]["body"])
                record = self.stored_record(page.evaluate(STORED), original)
                self.assertEqual(record["value"]["state"], "unknown" if status == 503 else "rejected")
                self.assertEqual(len(self.posts()), before + 1)
                self.assertEqual(self.backend.accepted, {})
                expect(self.area(page).locator(".avatar-praise-status").first).not_to_contain_text("请求已被接受")
                if status == 503:
                    expect(self.retry(page)).to_be_enabled()
                    self.backend.send_status = 409
                    with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"):
                        self.retry(page).click()
                    self.assertEqual(self.posts()[-1]["body"], original)
                    self.assertEqual(self.stored_record(page.evaluate(STORED), original)["value"]["state"], "unknown")
                    expect(self.retry(page)).to_be_enabled()
                context.close()
                self.contexts.remove(context)
        self.backend.send_status = 200

    def test_network_failure_keeps_exact_anonymous_intent_for_manual_retry(self):
        page = self.open(self.context())
        self.choose(page)
        page.route(API + "/api/avatar-praises", lambda route: route.abort("failed"), times=1)
        self.submit(page).click()
        expect(self.retry(page)).to_be_enabled()
        original = page.evaluate("window.__avatarPraiseFetchEvidence[0].body")
        self.stored_record(page.evaluate(STORED), original)
        self.assertEqual(self.posts(), [])
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"):
            self.retry(page).click()
        expect(self.withdraw(page)).to_be_visible()
        self.assertEqual(self.posts()[0]["body"], original)
        self.assertEqual(len(self.backend.accepted), 1)

    def test_real_send_deadline_keeps_accepted_request_retry_idempotent(self):
        page = self.open(self.context())
        self.choose(page)
        self.backend.hold_next = ("POST", "/api/avatar-praises")
        self.submit(page).click()
        self.wait_held(page)
        original = copy.deepcopy(self.posts()[-1]["body"])
        # Use the actual 20-second production deadline; no fake timer or shortened constant.
        expect(self.retry(page)).to_be_enabled(timeout=25000)
        self.backend.release()
        self.assertEqual(len(self.posts()), 1)
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"):
            self.retry(page).click()
        expect(self.withdraw(page)).to_be_visible()
        self.assertEqual(self.posts()[-1]["body"], original)
        self.assertEqual(len(self.backend.accepted), 1)

    def test_unconfirmed_identity_or_invalid_credentials_never_become_anonymous(self):
        for kind, status in ((None, 503), ("human", 401)):
            with self.subTest(kind=kind, status=status):
                context = self.context(kind)
                self.backend.identity_status = status
                page = self.open(context)
                expect(self.area(page).locator(".avatar-praise-status").first).to_have_text(
                    "当前登录身份未确认，暂时不能发送。这不会被当作未登录。")
                expect(self.area(page).get_by_role("button", name="重新核对身份")).to_be_visible()
                expect(self.area(page).locator(".avatar-praise-form")).to_be_hidden()
                expect(self.area(page).locator(".avatar-praise-send")).to_be_disabled()
                self.assertEqual(self.posts(), [])
                self.assertFalse(any(isinstance(r["value"], dict) and "withdraw_secret" in r["value"]
                                     for r in page.evaluate(STORED)))
                context.close()
                self.contexts.remove(context)
                self.backend.identity_status = 200

    def test_unpublished_machine_door_uses_only_api_parts_and_rejects_human_self_targets(self):
        page = self.open(self.context())
        self.backend.parts = [copy.deepcopy(PARTS[0]), copy.deepcopy(PARTS[1])]
        literal_label = "眼睛 <img id='praise-injected' src='invalid'>"
        self.backend.parts[1]["part_label"] = literal_label
        page.reload(wait_until="networkidle")
        expect(self.area(page)).to_contain_text(literal_label)
        self.assertEqual(page.locator("#praise-injected").count(), 0)
        self.assertEqual(self.area(page).locator("[data-part=hat]").count(), 0)
        self.assertEqual(self.area(page).locator("[data-part=blush]").count(), 0)
        self.assertEqual(self.area(page).locator("[data-part=motion]").count(), 0)
        self.choose(page)
        self.send(page)
        expect(self.withdraw(page)).to_be_visible()
        self.assertFalse(self.backend.published)
        for kind, self_target in (("human", False), ("machine", True)):
            with self.subTest(target_kind=kind, self_target=self_target):
                context = self.context("machine" if self_target else None)
                self.backend.target["kind"] = kind
                if self_target:
                    self.backend.actor = TARGET
                    context.clear_cookies(name="rj_praise_fixture")
                    context.add_cookies([{"name": "rj_praise_fixture", "value": TARGET,
                                          "url": self.site, "httpOnly": True, "sameSite": "Lax"}])
                self.backend.options_status = 403
                options_before = sum(r["path"] == "/api/avatar-praises/options"
                                     for r in self.backend.requests)
                blocked = self.open(context, require_area=kind != "human")
                if kind == "human":
                    expect(self.area(blocked)).to_be_hidden()
                    self.assertEqual(sum(r["path"] == "/api/avatar-praises/options"
                                         for r in self.backend.requests), options_before)
                button = self.submit(blocked)
                if button.count() and button.is_visible():
                    expect(button).to_be_disabled()
                self.assertEqual(len(self.posts()), 1)
                context.close()
                self.contexts.remove(context)

    def test_identity_switch_discards_delayed_send_and_resets_human_signature(self):
        context = self.context("human")
        page = self.open(context)
        checkbox = self.area(page).get_by_role("checkbox", name=re.compile("署名"))
        checkbox.check()
        self.choose(page)
        self.backend.hold_next = ("POST", "/api/avatar-praises")
        with page.expect_request(lambda r: urlsplit(r.url).path == "/api/avatar-praises"
                                 and r.method == "POST"):
            self.submit(page).click()
        self.wait_held(page)
        expect(self.submit(page)).to_be_disabled()
        first_actor = self.posts()[0]["actor"]
        self.switch(context, "human", "second-human")
        page.wait_for_function("g=>RJ_API.sessionGeneration()===g", arg=self.backend.generation)
        self.backend.release()
        page.wait_for_load_state("networkidle")
        self.assertNotIn(receipt_id(1), self.area(page).inner_text())
        self.assertEqual(self.retry(page).count(), 0)
        self.assertEqual(self.withdraw(page).count(), 0, "Old identity must lose its receipt action")
        current = self.area(page).get_by_role("checkbox", name=re.compile("署名"))
        if current.count():
            expect(current).not_to_be_checked()
        self.assertEqual(len(self.posts()), 1)
        self.assertNotEqual(first_actor, self.backend.actor)
        # A deliberate reload must still default to unsigned for the new identity.
        page.reload(wait_until="networkidle")
        expect(self.area(page).get_by_role("checkbox", name=re.compile("署名"))).not_to_be_checked()
        self.choose(page)
        self.send(page)
        self.assertIs(self.posts()[-1]["body"].get("sign_name", False), False)
        self.assertEqual(self.posts()[-1]["actor"], "second-human")

    def test_sent_failures_and_malformed_envelopes_are_not_rendered_as_empty(self):
        cases = [
            (503, {"ok": False, "error": "发出记录暂时不可用。"}),
            (200, {"ok": True, "items": []}),
            (200, dict(sent_envelope(), items="not-a-list")),
            (200, dict(sent_envelope(), has_more=True, next_cursor=None)),
        ]
        for status, payload in cases:
            with self.subTest(status=status, payload=payload):
                context = self.context("human")
                self.backend.pages[(self.backend.actor, None)] = (status, payload)
                page = self.open(context, account=True)
                self.refresh_sent(page)
                section = page.locator("#avatarPraiseSent")
                expect(section).to_contain_text(re.compile("暂时|失败|无法|异常|未能|重试|不完整|未确认"))
                # An honest error may say "这不代表没有发出记录".
                # Reject only a standalone affirmative empty-state sentence.
                empty_sentence = re.compile(
                    r"^(?:(?:你)?(?:还)?没有(?:发出(?:过)?的?夸夸|发出记录)"
                    r"|暂无(?:发出的夸夸|发出记录))[。.!！]?$")
                for line in section.inner_text().splitlines():
                    self.assertNotRegex(line.strip(), empty_sentence)
                context.close()
                self.contexts.remove(context)
        context = self.context("human")
        self.backend.pages[(self.backend.actor, None)] = (200, sent_envelope())
        page = self.open(context, account=True)
        self.refresh_sent(page)
        expect(page.locator("#avatarPraiseSent")).to_contain_text(re.compile("还没有|暂无|没有发出"))

    def test_authenticated_sent_pagination_dedupes_and_withdraws_only_own_receipts(self):
        for kind in ("human", "machine"):
            with self.subTest(kind=kind):
                context = self.context(kind)
                one, two = sent_item(11, "first-target"), sent_item(12, "second-target")
                self.backend.outgoing[self.backend.actor] = [one, two]
                self.backend.pages[(self.backend.actor, None)] = (200, sent_envelope([one], True, CURSOR))
                self.backend.pages[(self.backend.actor, CURSOR)] = (200, sent_envelope([one, two]))
                page = self.open(context, account=True)
                self.refresh_sent(page)
                section = page.locator("#avatarPraiseSent")
                expect(section.get_by_text(re.compile("first-target")).first).to_be_visible()
                with page.expect_response(lambda r: parse_qs(urlsplit(r.url).query).get("cursor") == [CURSOR]):
                    section.get_by_role("button", name=re.compile("更多|下一页|再读一些")).click()
                expect(section.get_by_text(re.compile("second-target")).first).to_be_visible()
                self.assertEqual(section.get_by_role("button", name="撤回", exact=True).count(), 2)
                self.assertNotRegex(section.inner_text(), r"眼睛|帽子|腮红|动作|收到的夸夸|收到了.*次")
                with page.expect_response(lambda r: urlsplit(r.url).path.endswith("/withdraw")):
                    section.get_by_role("button", name="撤回", exact=True).first.click()
                expect(section).to_contain_text(re.compile("已撤回|已经撤回"))
                latest = [r for r in self.backend.requests if r["method"] == "POST"
                          and r["path"].endswith("/withdraw")][-1]
                self.assertEqual(latest["body"], {})
                self.assertEqual(latest["actor"], self.backend.actor)
                self.assertIn(latest["path"].split("/")[-2], {one["id"], two["id"]})
                context.close()
                self.contexts.remove(context)

    def test_withdrawal_blocks_refresh_and_pagination_until_confirmed(self):
        context = self.context("human")
        item = sent_item(22, "withdraw-race-target")
        self.backend.outgoing[self.backend.actor] = [item]
        self.backend.pages[(self.backend.actor, None)] = (200, sent_envelope([item], True, CURSOR))
        page = self.open(context, account=True)
        self.refresh_sent(page)
        section = page.locator("#avatarPraiseSent")
        refresh = section.get_by_role("button", name="刷新发出记录", exact=True)
        more = section.get_by_role("button", name="再读一些", exact=True)
        self.backend.hold_next = ("POST", "/api/avatar-praises/" + item["id"] + "/withdraw")
        section.get_by_role("button", name="撤回", exact=True).click()
        self.wait_held(page)
        try:
            expect(refresh).to_be_disabled()
            expect(more).to_be_disabled()
            reads = len([r for r in self.backend.requests if r["path"] == "/api/me/avatar-praises"])
            # Dispatch bypasses native disabled-click handling, exercising the entry guard too.
            refresh.dispatch_event("click")
            more.dispatch_event("click")
            page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
            self.assertEqual(reads, len([r for r in self.backend.requests
                                       if r["path"] == "/api/me/avatar-praises"]))
        finally:
            self.backend.release()
        expect(section).to_contain_text("服务器已确认撤回这条夸夸。")
        expect(section).to_contain_text("你已撤回")
        expect(refresh).to_be_enabled()
        expect(more).to_be_enabled()

    def test_persisted_restore_revalidates_account_identity_before_actions(self):
        context = self.context("human")
        old_actor = self.backend.actor
        page = self.open(context, account=True)
        section = page.locator("#avatarPraiseSent")
        expect(section).to_contain_text("当前账号 @" + old_actor)
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))")
        # Exercise the event boundary explicitly: a frozen page may miss storage events.
        # This is a lifecycle simulation, not proof of Chromium's real BFCache eligibility.
        self.backend.identity("machine", "restored-machine")
        context.add_cookies([{"name": "rj_praise_fixture", "value": self.backend.actor,
                              "url": self.site, "httpOnly": True, "sameSite": "Lax"}])
        selector = {"session_id": self.backend.session, "generation": self.backend.generation}
        page.evaluate("s => localStorage.setItem('rj_session_selector', JSON.stringify(s))", selector)
        self.backend.hold_next = ("GET", "/api/me")
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        self.wait_held(page)
        expect(section).not_to_contain_text("当前账号 @" + old_actor)
        expect(section.get_by_role("button", name="查看我发出的夸夸", include_hidden=True)).to_be_hidden()
        self.backend.release()
        expect(section).to_contain_text("当前账号 @restored-machine")
        self.refresh_sent(page)
        reads = [r for r in self.backend.requests if r["path"] == "/api/me/avatar-praises"]
        self.assertTrue(reads)
        self.assertTrue(all(r["actor"] == "restored-machine" for r in reads))

    def test_card_restore_reload_keeps_anonymous_pending_intent(self):
        context = self.context()
        page = self.open(context)
        self.choose(page, "eyes")
        self.backend.hold_next = ("POST", "/api/avatar-praises")
        self.submit(page).click()
        self.wait_held(page)
        original = copy.deepcopy(self.posts()[-1]["body"])
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))")
        expect(self.area(page).locator(".avatar-praise-form")).to_be_hidden()
        expect(self.area(page).locator(".avatar-praise-receipt")).to_be_hidden()
        self.backend.release()
        self.backend.identity_status = 503
        # Existing card.js deliberately reloads a restored card to clear private media.
        # Do not weaken that behavior to preserve a signed request's in-memory state.
        with page.expect_navigation(wait_until="networkidle"):
            page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        expect(self.area(page).get_by_role("button", name="重新核对身份")).to_be_visible()
        expect(self.area(page).locator(".avatar-praise-receipt")).to_be_hidden()
        expect(self.retry(page)).to_be_disabled()
        self.stored_record(page.evaluate(STORED), original)
        self.assertEqual(len(self.posts()), 1)
        self.backend.identity_status = 200
        self.area(page).get_by_role("button", name="重新核对身份").click()
        expect(self.retry(page)).to_be_visible()
        expect(self.retry(page)).to_be_enabled()
        with page.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"
                                  and r.request.method == "POST"):
            self.retry(page).click()
        expect(self.withdraw(page)).to_be_visible()
        self.assertEqual(self.posts()[-1]["body"], original)
        self.assertRegex(original["withdraw_secret"], r"^[0-9a-f]{64}$")
        self.assertEqual(len(self.backend.accepted), 1)

    def test_delayed_outgoing_response_cannot_reappear_after_identity_switch(self):
        context = self.context("human")
        old_actor = self.backend.actor
        old = sent_item(20, "old-private-target")
        self.backend.pages[(old_actor, None)] = (200, sent_envelope([old]))
        page = self.open(context, account=True)
        self.backend.hold_next = ("GET", "/api/me/avatar-praises")
        button = page.locator("#avatarPraiseSent").get_by_role(
            "button", name=re.compile("查看我发出的夸夸|刷新发出记录"))
        with page.expect_request(lambda r: urlsplit(r.url).path == "/api/me/avatar-praises"):
            button.click()
        self.wait_held(page)
        # This real cross-tab selector event resets old rows/cursor synchronously.
        self.switch(context, "machine")
        new_actor = self.backend.actor
        new = sent_item(21, "new-private-target")
        self.backend.outgoing[new_actor] = [new]
        page.wait_for_function("g=>RJ_API.sessionGeneration()===g", arg=self.backend.generation)
        expect(page.locator("#avatarPraiseSent")).not_to_contain_text("old-private-target")
        self.backend.release()
        page.wait_for_load_state("networkidle")
        expect(page.locator("#avatarPraiseSent")).not_to_contain_text("old-private-target")
        self.refresh_sent(page)
        expect(page.locator("#avatarPraiseSent")).to_contain_text("new-private-target")
        recent_reads = [r for r in self.backend.requests if r["path"] == "/api/me/avatar-praises"
                        and r["actor"] == new_actor]
        self.assertTrue(recent_reads)
        self.assertTrue(all("cursor" not in r["query"] for r in recent_reads))

    def test_keyboard_touch_targets_live_status_and_no_overflow_at_three_widths(self):
        for width in (360, 390, 1100):
            with self.subTest(width=width):
                page = self.open(self.context("human", width=width))
                self.assertFalse(self.area(page).evaluate("e=>!!e.closest('#hero')"))
                for part in ("overall", "eyes", "hat", "blush", "motion"):
                    radio = self.part(page, part)
                    radio.focus()
                    expect(radio).to_be_focused()
                    radio.press("Space")
                    expect(radio).to_be_checked()
                    size = radio.evaluate("""e => {
                      const target = e.labels && e.labels[0] || e.closest('label') || e;
                      const r = target.getBoundingClientRect(); return [r.width, r.height];
                    }""")
                    self.assertGreaterEqual(size[0], 44)
                    self.assertGreaterEqual(size[1], 44)
                self.assertEqual(self.posts(), [], "Keyboard selection must not send")
                submit = self.submit(page)
                submit.focus()
                expect(submit).to_be_focused()
                focus_visible = submit.evaluate("""e=>{
                  const s=getComputedStyle(e);
                  return (s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0)
                    || s.boxShadow!=='none';
                }""")
                self.assertTrue(focus_visible)
                box = submit.bounding_box()
                self.assertGreaterEqual(box["width"], 44)
                self.assertGreaterEqual(box["height"], 44)
                self.assertGreater(self.area(page).locator('[role=status],[aria-live]').count(), 0)
                self.assertFalse(page.evaluate("document.documentElement.scrollWidth>innerWidth+1"))
                self.assertEqual(self.area(page).locator('textarea,input[type=text]').count(), 0)
                page.context.close()
                self.contexts.remove(page.context)


    def test_self_target_is_blocked_even_when_options_backend_would_succeed(self):
        context = self.context("machine")
        self.backend.actor = TARGET
        self.backend.own['handle'] = TARGET
        self.backend.options_status = 200
        context.clear_cookies(name="rj_praise_fixture")
        context.add_cookies([{"name": "rj_praise_fixture", "value": TARGET,
                              "url": self.site, "httpOnly": True, "sameSite": "Lax"}])
        page = self.open(context)
        expect(self.area(page)).to_contain_text('自己的头像')
        self.assertEqual([call for call in self.backend.requests
                          if call['path'] == '/api/avatar-praises/options'], [])
        expect(self.area(page).get_by_role('button', name='送出夸夸', exact=True, include_hidden=True)).to_be_disabled()
        self.assertEqual(self.posts(), [])

    def test_account_page_can_recover_an_unknown_anonymous_request(self):
        context = self.context()
        page = self.open(context)
        self.backend.send_reply = {"ok": True, "id": "unconfirmed"}
        self.choose(page)
        self.send(page)
        expect(self.retry(page)).to_be_visible()
        original = copy.deepcopy(self.posts()[0]["body"])
        account = self.open(context, account=True)
        with account.expect_response(lambda r: urlsplit(r.url).path == "/api/avatar-praises"):
            self.retry(account).click()
        expect(self.withdraw(account)).to_be_visible()
        self.assertEqual(self.posts()[-1]["body"], original)
        self.assert_secret_private(account, original)

    def test_older_sent_receipts_remain_reachable_beyond_two_hundred(self):
        context = self.context("human")
        for page_index in range(11):
            cursor = None if page_index == 0 else "praise1." + str(page_index).zfill(80)
            more = page_index < 10
            next_cursor = "praise1." + str(page_index + 1).zfill(80) if more else None
            first = page_index * 20 + 1
            items = [sent_item(number, "older-target-" + str(number))
                     for number in range(first, min(first + 20, 202))]
            self.backend.pages[(self.backend.actor, cursor)] = (200, sent_envelope(items, more, next_cursor))
        page = self.open(context, account=True)
        self.refresh_sent(page)
        for page_index in range(1, 11):
            cursor = "praise1." + str(page_index).zfill(80)
            with page.expect_response(lambda r: parse_qs(urlsplit(r.url).query).get("cursor") == [cursor]):
                page.locator("#avatarPraiseSent").get_by_role("button", name="再读一些", exact=True).click()
        expect(page.locator("#avatarPraiseSent").get_by_text("@older-target-201", exact=True)).to_be_visible()


if __name__ == "__main__":
    unittest.main()
