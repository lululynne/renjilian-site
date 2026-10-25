"""A17 browser behavior against a finite local HTTP fixture, never production."""
import copy
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import time
import unittest
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SESSIONS = {"A": "s_" + "a" * 32, "B": "s_" + "b" * 32}


class Backend:
    def __init__(self):
        self.lock = threading.Lock()
        self.calls = []
        self.display = {key: {"ok": True, "owner_id": "account-" + key.lower(),
            "display_enabled": False, "display_rev": 0, "slots": []} for key in SESSIONS}
        self.read_entered = threading.Event(); self.release_read = threading.Event()
        self.put_entered = threading.Event(); self.release_put = threading.Event()
        self.delay_read = False; self.delay_put = False; self.timeout_put = False
        self.put_status = 200

    def items(self, key):
        return [{"id": "item-" + key + "-one", "catalog_id": "base-v1:logo:head:tophat", "kind": "outfit",
            "name": key + "私人物品", "mode": "logo", "slot": "head", "available": True,
            "source_label": "基础免费", "license_note": "站内基础免费装扮。", "capabilities": ["avatar", "display"],
            "preview": {"mode": "logo", "slot": "head", "variant_id": "tophat"}},
            {"id": "item-" + key + "-two", "catalog_id": "base-v1:character:head:bow", "kind": "outfit",
            "name": key + "角色配件", "mode": "character", "slot": "head", "available": True,
            "source_label": "基础免费", "license_note": "站内基础免费装扮。", "capabilities": ["avatar", "display"],
            "preview": {"mode": "character", "slot": "head", "variant_id": "bow"}}]

    def request(self, method, path, key, body, selector):
        with self.lock:
            self.calls.append({"method": method, "path": path, "actor": key, "selector": selector, "body": copy.deepcopy(body)})
        if path == "/api/config": return 200, {"ok": True, "comments_enabled": True}
        if method == "POST" and path == "/api/sessions":
            chosen = "B" if body.get("handle") == "beta" else "A"
            return 200, {"ok": True, "session_id": SESSIONS[chosen], "handle": "beta" if chosen == "B" else "alpha"}
        if path == "/api/me":
            if not key: return 200, {"ok": True, "signed_in": False}
            return 200, {"ok": True, "signed_in": True, "session_id": SESSIONS[key],
                "handle": "alpha" if key == "A" else "beta", "display_name": key + "号", "kind": "machine", "unread_count": 0}
        if path == "/api/me/chest":
            if not key: return 401, {"ok": False, "error": "还没登录。"}
            if key == "A" and self.delay_read: self.read_entered.set(); self.release_read.wait(5)
            return 200, {"ok": True, "owner_id": "account-" + key.lower(), "items": self.items(key), "next_cursor": None}
        if path == "/api/me/card/display":
            if not key: return 401, {"ok": False, "error": "还没登录。"}
            if method == "GET":
                result = copy.deepcopy(self.display[key])
                for row in result["slots"]:
                    if row["target_type"] == "owned_item": row["item"] = next(x for x in self.items(key) if x["id"] == row["target_id"])
                return 200, result
            if self.put_status in [401, 403]: return self.put_status, {"ok": False, "error": "当前凭证已失效。"}
            with self.lock:
                current = self.display[key]
                if body.get("expected_owner_id") != current["owner_id"] or body.get("expected_display_rev") != current["display_rev"]:
                    return 409, {"ok": False, "error": "已有新版本。"}
                current.update(display_rev=current["display_rev"] + 1, display_enabled=body["display_enabled"], slots=copy.deepcopy(body["slots"]))
                result = copy.deepcopy(current)
            self.put_entered.set()
            if self.delay_put: self.release_put.wait(5)
            if self.timeout_put: time.sleep(.4)
            return self.put_status, result if self.put_status == 200 else {"ok": False, "error": "提交后的本机故障"}
        if path == "/api/card/catalog": return 200, {"ok": True}
        if path.startswith("/api/accounts/") and path.endswith("/card"):
            return 200, {"ok": True, "handle": "alpha", "kind": "machine", "published": True, "skin": "cabin",
                "avatar": {"model": "chatgpt", "mode": "logo"}, "bg": {"preset": "paper"}, "devices": [], "subs": [],
                "routes": [], "family": [], "showcase": [], "stats": {}, "display_v1": {"version": 1, "display_rev": 1, "available": True,
                    "slots": [{"position": 2, "target_type": "reading", "target_id": "r-one", "title": '<img src=x onerror="window.attacked=1">',
                        "href": "javascript:alert(1)", "available": True}]}}
        return 200, {"ok": True, "items": [], "enabled": False}


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def respond(self, status, body, content_type="application/json; charset=utf-8", cookie=None):
        data = body.encode() if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", content_type); self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        if cookie: self.send_header("Set-Cookie", cookie)
        self.end_headers()
        try: self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError): pass

    def dispatch(self, method):
        path = urlsplit(self.path).path
        if path == "/rj-config.js":
            return self.respond(200, "window.RJ_CONFIG={apiBase:location.origin};", "application/javascript")
        if path == "/data/ainotes.json": return self.respond(404, {})
        if path in ["/data/questions.json", "/data/mcps.json", "/data/kanread.json"]:
            bodies = {"/data/questions.json": [{"id": "q-one", "title": "成人原题不展开", "lv": "r18", "body": "not projected"}],
                "/data/mcps.json": {"schema_version": 2, "items": [{"id": "t-one", "name": "候选工具", "status": "candidate"}]},
                "/data/kanread.json": {"schema_version": 1, "items": [{"id": "r-one", "title": "阅读标题", "status": "verified", "machine_voice": "not projected"}]}}
            return self.respond(200, bodies[path])
        if not path.startswith("/api/"):
            return super().do_GET() if method == "GET" else self.respond(405, {})
        selector = self.headers.get("X-RJ-Session")
        key = next((key for key, value in SESSIONS.items() if value == selector), None)
        if not selector:
            cookie = self.headers.get("Cookie", "")
            key = "B" if "fixture_account=B" in cookie else "A" if "fixture_account=A" in cookie else None
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        status, result = self.server.backend.request(method, path, key, body, selector)
        cookie = "fixture_account=" + ("B" if body.get("handle") == "beta" else "A") + "; Path=/; SameSite=Lax" if path == "/api/sessions" else None
        self.respond(status, result, cookie=cookie)
    def do_GET(self): self.dispatch("GET")
    def do_POST(self): self.dispatch("POST")
    def do_PUT(self): self.dispatch("PUT")


class ChestBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.origin = "http://127.0.0.1:" + str(cls.server.server_address[1])
        cls.pw = sync_playwright().start(); cls.browser = cls.pw.chromium.launch(headless=True)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close(); cls.thread.join(timeout=3)
    def setUp(self): self.backend = Backend(); self.server.backend = self.backend; self.contexts = []
    def tearDown(self):
        self.backend.release_read.set(); self.backend.release_put.set()
        for context in self.contexts: context.close()
    def page(self, width=390, legacy=False, anonymous=False, timeout=False):
        context = self.browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce"); self.contexts.append(context)
        if not anonymous: context.add_cookies([{"name": "fixture_account", "value": "A", "url": self.origin}])
        if not legacy and not anonymous:
            context.add_init_script("localStorage.setItem('rj_session_selector',JSON.stringify(" + json.dumps({"session_id": SESSIONS["A"], "generation": 1}) + "))")
        if timeout: context.add_init_script("{const native=window.setTimeout;window.setTimeout=(f,ms,...a)=>native(f,ms===30000?120:ms,...a)}")
        page = context.new_page(); errors = []; page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(self.origin + "/chest.html")
        if not anonymous: page.locator("#chestApp").wait_for(state="visible")
        return page, errors
    def switch(self, page):
        page.evaluate("value=>{localStorage.setItem('rj_session_selector',JSON.stringify({session_id:value,generation:2}));window.dispatchEvent(new CustomEvent('rj-identity-change'))}", SESSIONS["B"])
    def pick(self, page): page.locator('[data-target-id="item-A-one"]').click()

    def test_full_edit_preview_save_remove_reorder_and_filter(self):
        page, errors = self.page()
        self.assertEqual(page.locator("#chestItems .chest-item").count(), 2)
        for card in page.locator("#chestItems .chest-item").all():
            self.assertEqual(card.locator(".collection-avatar").count(), 1, "each accessory needs its own preview")
            self.assertTrue(card.locator(".collection-avatar svg").first.is_visible())
        self.pick(page); page.locator('[data-target-id="item-A-two"]').click()
        page.locator('[aria-label="将第 2 格移到第 1 格"]').click()
        page.locator("#chestEnabled").check()
        self.assertTrue(page.locator("#chestSave").is_disabled())
        page.locator("#chestPreviewBtn").click(); page.locator("#chestPreview .collection-cell").first.wait_for()
        page.locator("#chestSave").click(); page.wait_for_function("document.querySelector('#chestSaveState').textContent.startsWith('已保存')")
        self.assertEqual(self.backend.display["A"]["display_rev"], 1)
        self.assertEqual(self.backend.display["A"]["slots"][0]["target_id"], "item-A-two")
        page.locator('#chestDisplayGrid [data-position="1"] button', has_text="移除").click()
        page.locator("#chestMode").select_option("character")
        self.assertEqual(page.locator("#chestItems .chest-item").count(), 1)
        page.locator("#chestKind").select_option("question")
        page.wait_for_function("document.querySelector('#chestItems').textContent.includes('成人问题')")
        self.assertNotIn("成人原题", page.locator("#chestItems").inner_text())
        self.assertNotIn("not projected", page.locator("#chestItems").inner_text())
        self.assertEqual(errors, [])

    def test_legacy_selector_bootstraps_before_private_reads_and_anonymous_stays_closed(self):
        page, errors = self.page(legacy=True)
        self.assertIn("A号", page.locator("#chestWho").inner_text())
        private = [x for x in self.backend.calls if x["path"] in ["/api/me/chest", "/api/me/card/display"]]
        self.assertTrue(private); self.assertTrue(all(x["selector"] == SESSIONS["A"] for x in private))
        anon, _ = self.page(anonymous=True)
        anon.locator("#chestLogin").wait_for(state="visible")
        self.assertTrue(anon.locator("#chestApp").is_hidden()); self.assertEqual(errors, [])

    def test_late_read_cannot_enter_the_next_account(self):
        self.backend.delay_read = True
        context = self.browser.new_context(); self.contexts.append(context)
        context.add_init_script("localStorage.setItem('rj_session_selector',JSON.stringify(" + json.dumps({"session_id": SESSIONS["A"], "generation": 1}) + "))")
        page = context.new_page(); page.goto(self.origin + "/chest.html")
        self.assertTrue(self.backend.read_entered.wait(3))
        self.switch(page)
        self.assertNotIn("A私人物品", page.locator("body").inner_text())
        self.backend.release_read.set()
        page.wait_for_function("document.querySelector('#chestWho').textContent.includes('B号')")
        self.assertNotIn("A私人物品", page.locator("#chestApp").inner_text())
        self.assertTrue(page.locator("#chestSave").is_disabled())

    def test_late_save_is_pinned_to_A_and_never_replayed_into_B(self):
        page, errors = self.page(); self.pick(page); page.locator("#chestPreviewBtn").click()
        self.backend.delay_put = True; page.locator("#chestSave").click()
        self.assertTrue(self.backend.put_entered.wait(3)); self.switch(page); self.backend.release_put.set()
        page.wait_for_function("document.querySelector('#chestWho').textContent.includes('B号')")
        writes = [x for x in self.backend.calls if x["method"] == "PUT"]
        self.assertEqual(len(writes), 1); self.assertEqual(writes[0]["selector"], SESSIONS["A"])
        self.assertEqual(writes[0]["body"]["expected_owner_id"], "account-a")
        self.assertEqual(self.backend.display["A"]["display_rev"], 1); self.assertEqual(self.backend.display["B"]["display_rev"], 0)
        self.assertEqual(page.locator("#chestDisplayGrid").inner_text().count("A私人物品"), 0); self.assertEqual(errors, [])

    def test_unknown_write_result_reads_back_without_resending(self):
        page, errors = self.page(timeout=True); self.pick(page); page.locator("#chestPreviewBtn").click()
        self.backend.timeout_put = True; page.locator("#chestSave").click()
        page.locator("#chestReadback").wait_for(state="visible"); page.locator("#chestReadback").click()
        page.wait_for_function("document.querySelector('#chestSaveState').textContent.includes('已核对')")
        self.assertEqual(len([x for x in self.backend.calls if x["method"] == "PUT"]), 1)
        self.assertTrue(page.locator("#chestSave").is_disabled()); self.assertEqual(errors, [])

    def test_server_error_after_commit_requires_readback(self):
        page, errors = self.page(); self.pick(page); page.locator("#chestPreviewBtn").click()
        self.backend.put_status = 503; page.locator("#chestSave").click()
        page.locator("#chestReadback").wait_for(state="visible", timeout=3000)
        self.assertTrue(page.locator("#chestSave").is_disabled())
        page.locator("#chestReadback").click()
        page.wait_for_function("document.querySelector('#chestSaveState').textContent.includes('已核对')")
        self.assertEqual(len([x for x in self.backend.calls if x["method"] == "PUT"]), 1)
        self.assertEqual(errors, [])

    def test_observed_revocation_clears_the_private_page(self):
        page, errors = self.page(); self.pick(page); page.locator("#chestPreviewBtn").click()
        self.backend.put_status = 401; page.locator("#chestSave").click()
        page.locator("#chestLogin").wait_for(state="visible")
        self.assertTrue(page.locator("#chestApp").is_hidden()); self.assertEqual(page.locator("#chestItems").inner_text(), "")
        self.assertEqual(page.locator("#chestPreview").inner_text(), ""); self.assertEqual(errors, [])

    def test_cross_tab_logout_and_lifecycle_clear_private_dom(self):
        page, errors = self.page(); other = page.context.new_page(); other.goto(self.origin + "/chest.html")
        other.locator("#chestApp").wait_for(state="visible")
        other.evaluate("()=>window.RJ_API.post('/api/sessions',{handle:'beta',recovery_code:'fixture-only'})")
        page.wait_for_function("document.querySelector('#chestWho').textContent.includes('B号')")
        page.evaluate("()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))")
        self.assertEqual(page.locator("#chestItems").inner_text(), ""); self.assertTrue(page.locator("#chestApp").is_hidden())
        page.evaluate("()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))")
        page.locator("#chestApp").wait_for(state="visible")
        page.evaluate("()=>{localStorage.setItem('rj_session_selector',JSON.stringify({session_id:null,generation:5}));window.dispatchEvent(new CustomEvent('rj-identity-change'))}")
        page.locator("#chestLogin").wait_for(state="visible")
        self.assertEqual(page.locator("#chestItems").inner_text(), ""); self.assertEqual(errors, [])

    def test_public_card_uses_safe_text_and_fixed_deep_links(self):
        page, errors = self.page(anonymous=True); page.goto(self.origin + "/card.html?u=alpha")
        page.locator("#collectionDisplaySection").wait_for(state="visible")
        link = page.locator("#collectionDisplay a"); self.assertEqual(link.get_attribute("href"), "kanread.html#r-one")
        self.assertIn("<img", link.inner_text()); self.assertEqual(page.locator("#collectionDisplay img").count(), 0)
        self.assertFalse(page.evaluate("Boolean(window.attacked)")); self.assertEqual(errors, [])

    def test_viewports_keyboard_touch_and_reduced_motion(self):
        directory = os.environ.get("RENJI_CHEST_EVIDENCE_DIR")
        if directory: Path(directory).mkdir(parents=True, exist_ok=True)
        for width in [320, 390, 1280]:
            with self.subTest(width=width):
                page, errors = self.page(width=width); self.pick(page); page.locator("#chestPreviewBtn").click()
                self.assertFalse(page.evaluate("document.documentElement.scrollWidth>innerWidth"))
                undersized = page.locator(".chest-page button:visible,.chest-actions a:visible").evaluate_all("els=>els.filter(e=>{const r=e.getBoundingClientRect();return r.height<43.5||r.width<43.5}).map(e=>e.textContent)")
                self.assertEqual(undersized, [])
                page.locator("#chestPreviewBtn").focus(); page.keyboard.press("Tab")
                self.assertEqual(page.locator(":focus").get_attribute("id"), "chestSave")
                self.assertTrue(page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"))
                if directory: page.screenshot(path=str(Path(directory) / ("chest-" + str(width) + ".png")), full_page=True)
                self.assertEqual(errors, [])


if __name__ == "__main__": unittest.main()
