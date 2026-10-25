"""Real browser + isolated local Worker/D1. Requires the finite API test harness."""
import functools
import http.cookies
import http.server
import json
import os
from pathlib import Path
import secrets
import threading
import unittest
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
API = os.environ.get("RENJI_API", "")


class Site(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/data/ainotes.json": self.send_error(404); return
        if path in ["/rj-config.js", "/chest-away.html"]:
            text = "window.RJ_CONFIG={apiBase:" + json.dumps(API) + "};" if path.endswith(".js") else "<!doctype html><html lang='zh-CN'><title>本机返回测试</title><p>返回宝箱</p></html>"
            body = text.encode(); self.send_response(200)
            self.send_header("Content-Type", "application/javascript" if path.endswith(".js") else "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        super().do_GET()


class ChestApiBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not API: raise unittest.SkipTest("Run with the isolated local API harness.")
        if urlsplit(API).scheme != "http" or urlsplit(API).hostname not in ["127.0.0.1", "localhost"]:
            raise RuntimeError("This test refuses non-local APIs.")
        port = int(os.environ.get("RENJI_CHEST_SITE_PORT", "8800"))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Site, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True); cls.thread.start()
        cls.origin = "http://127.0.0.1:" + str(cls.server.server_address[1])
        directory = os.environ.get("RENJI_CHEST_EVIDENCE_DIR")
        if directory: Path(directory).mkdir(parents=True, exist_ok=True)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, channel="chromium", ignore_default_args=["--disable-back-forward-cache"])
        cls.api("POST", "/api/admin/flags", {"key": "registration_open", "value": "1"}, admin=True)
        cls.evidence = []
    @classmethod
    def tearDownClass(cls):
        directory = os.environ.get("RENJI_CHEST_EVIDENCE_DIR")
        if directory:
            Path(directory).mkdir(parents=True, exist_ok=True)
            (Path(directory) / "real-api-browser.json").write_text(json.dumps({"local_only": True, "real_worker_d1": True,
                "production_requests": 0, "checks": cls.evidence}, ensure_ascii=False, indent=2) + "\n")
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close(); cls.thread.join(timeout=3)
    @classmethod
    def api(cls, method, path, body=None, actor=None, admin=False):
        headers = {"Origin": cls.origin, "Content-Type": "application/json", "X-Real-IP": "10.7." + str(secrets.randbelow(250) + 1) + "." + str(secrets.randbelow(250) + 1)}
        if actor: headers.update({"Cookie": actor["cookie"], "X-RJ-Session": actor["session_id"]})
        if admin: headers["Authorization"] = "Bearer " + os.environ.get("RENJI_ADMIN_TOKEN", "")
        request = urllib.request.Request(API + path, method=method, headers=headers, data=None if body is None else json.dumps(body).encode())
        try: response = urllib.request.urlopen(request, timeout=15)
        except urllib.error.HTTPError as error: response = error
        with response:
            data = json.load(response); status = response.status; cookies = response.headers.get_all("Set-Cookie") or []
        return status, data, cookies
    def setUp(self):
        self.actors = []; self.contexts = []
        for _ in range(2):
            handle = "chest" + secrets.token_hex(6)
            status, data, raw = self.api("POST", "/api/accounts", {"handle": handle, "kind": "machine"})
            self.assertEqual(status, 200, data)
            jar = http.cookies.SimpleCookie()
            for cookie in raw: jar.load(cookie)
            actor = {"handle": handle, "session_id": data["session_id"], "recovery_code": data["recovery_code"],
                "cookies": [{"name": key, "value": morsel.value, "domain": "127.0.0.1", "path": "/", "httpOnly": True, "sameSite": "Lax"} for key, morsel in jar.items()],
                "cookie": "; ".join(key + "=" + morsel.value for key, morsel in jar.items())}
            self.actors.append(actor)
        self.a, self.b = self.actors
    def tearDown(self):
        for context in self.contexts: context.close()
        for actor in self.actors:
            status, _, _ = self.api("DELETE", "/api/me", {"comments": "delete", "expected_handle": actor["handle"]}, actor=actor)
            if status == 401:
                status, data, raw = self.api("POST", "/api/sessions", {"handle": actor["handle"], "recovery_code": actor["recovery_code"]})
                self.assertEqual(status, 200, data)
                jar = http.cookies.SimpleCookie()
                for cookie in raw: jar.load(cookie)
                actor.update(session_id=data["session_id"], cookie="; ".join(key + "=" + morsel.value for key, morsel in jar.items()))
                status, _, _ = self.api("DELETE", "/api/me", {"comments": "delete", "expected_handle": actor["handle"]}, actor=actor)
            self.assertEqual(status, 200, "local synthetic actor cleanup")
    def page(self, hold=None, timeout=False):
        context = self.browser.new_context(viewport={"width": 390, "height": 900}, reduced_motion="reduce"); self.contexts.append(context)
        context.add_cookies(self.a["cookies"] + self.b["cookies"])
        context.add_init_script("if(!localStorage.getItem('rj_session_selector'))localStorage.setItem('rj_session_selector',JSON.stringify(" + json.dumps({"session_id": self.a["session_id"], "generation": 1}) + "))")
        if hold:
            context.add_init_script("""{const native=window.fetch;window.fetch=(url,init)=>native(url,init).then(response=>{
              const path=new URL(url,location.href).pathname;
              if(!window.heldOnce&&((HOLD==='read'&&path==='/api/me/chest')||(HOLD==='save'&&path==='/api/me/card/display'&&init.method==='PUT'))){
                window.heldOnce=true;window.held=true;return new Promise(resolve=>{window.releaseHeld=()=>resolve(response)});
              }return response;});}""".replace("HOLD", json.dumps(hold)))
        if timeout: context.add_init_script("{const native=setTimeout;window.setTimeout=(f,ms,...a)=>native(f,ms===30000?120:ms,...a)}")
        page = context.new_page(); calls = []; errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: calls.append({"method": request.method, "path": urlsplit(request.url).path,
            "selector": request.headers.get("x-rj-session"), "body": request.post_data_json if request.post_data else None}) if request.url.startswith(API + "/api/") else None)
        page.goto(self.origin + "/chest.html", wait_until="domcontentloaded")
        return page, calls, errors
    def switch(self, page):
        page.evaluate("sid=>{localStorage.setItem('rj_session_selector',JSON.stringify({session_id:sid,generation:2}));window.dispatchEvent(new CustomEvent('rj-identity-change'))}", self.b["session_id"])
    def current(self, actor):
        status, data, _ = self.api("GET", "/api/me/card/display", actor=actor); self.assertEqual(status, 200, data); return data
    def ready(self, page): page.locator("#chestApp").wait_for(state="visible")
    def pick(self, page): page.locator("#chestItems .chest-item button").first.click(); page.locator("#chestPreviewBtn").click()

    def test_real_free_inventory_preview_save_and_public_projection(self):
        page, calls, errors = self.page(); self.ready(page)
        self.assertEqual(page.locator("#chestItems .chest-item").count(), 60)
        self.assertEqual(page.locator("#chestItems .collection-avatar").count(), 60)
        self.pick(page); page.locator("#chestEnabled").check(); page.locator("#chestPreviewBtn").click(); page.locator("#chestSave").click()
        page.wait_for_function("document.querySelector('#chestSaveState').textContent.startsWith('已保存')")
        saved = self.current(self.a); self.assertEqual(saved["display_rev"], 1); self.assertEqual(len(saved["slots"]), 1)
        self.assertEqual(self.current(self.b)["display_rev"], 0)
        status, data, _ = self.api("PATCH", "/api/me/card", {"published": True}, actor=self.a); self.assertEqual(status, 200, data)
        status, public, _ = self.api("GET", "/api/accounts/" + self.a["handle"] + "/card"); self.assertEqual(status, 200, public)
        self.assertEqual(len(public["display_v1"]["slots"]), 1); self.assertNotIn(saved["slots"][0]["target_id"], json.dumps(public["display_v1"]))
        directory = os.environ.get("RENJI_CHEST_EVIDENCE_DIR")
        if directory: page.screenshot(path=str(Path(directory) / "real-api-chest.png"), full_page=True)
        writes = [x for x in calls if x["method"] == "PUT"]
        self.assertEqual(len(writes), 1); self.assertEqual(writes[0]["body"]["expected_owner_id"], saved["owner_id"])
        self.assertEqual(errors, []); self.evidence.append({"test": "real inventory/save/public", "owned": 60, "previewed": 60, "A_rev": 1, "B_rev": 0})

    def test_real_late_read_and_save_cannot_cross_owner(self):
        page, calls, errors = self.page(hold="read")
        page.wait_for_function("window.held===true"); self.switch(page); page.evaluate("window.releaseHeld()")
        self.ready(page); page.wait_for_function("handle=>document.querySelector('#chestPublic').href.includes(handle)", arg=self.b["handle"])
        ids = page.locator("#chestItems button").evaluate_all("els=>els.map(x=>x.dataset.targetId)")
        _, b_box, _ = self.api("GET", "/api/me/chest", actor=self.b)
        self.assertEqual(set(ids), {x["id"] for x in b_box["items"]}); self.assertEqual(errors, [])
        page2, calls2, errors2 = self.page(hold="save"); self.ready(page2); self.pick(page2); page2.locator("#chestSave").click()
        page2.wait_for_function("window.held===true"); self.switch(page2); page2.evaluate("window.releaseHeld()")
        page2.wait_for_function("handle=>document.querySelector('#chestPublic').href.includes(handle)", arg=self.b["handle"])
        self.assertEqual(self.current(self.a)["display_rev"], 1); self.assertEqual(self.current(self.b)["display_rev"], 0)
        writes = [x for x in calls2 if x["method"] == "PUT"]
        self.assertEqual(len(writes), 1); self.assertEqual(writes[0]["selector"], self.a["session_id"])
        self.assertEqual(errors2, []); self.evidence.append({"test": "real delayed read/save switch", "A_rev": 1, "B_rev": 0, "PUTs": 1})

    def test_real_unknown_result_reads_back_and_logout_clears(self):
        page, calls, errors = self.page(hold="save", timeout=True); self.ready(page); self.pick(page); page.locator("#chestSave").click()
        page.locator("#chestReadback").wait_for(state="visible"); page.locator("#chestReadback").click()
        page.wait_for_function("document.querySelector('#chestSaveState').textContent.includes('已核对')")
        self.assertEqual(len([x for x in calls if x["method"] == "PUT"]), 1)
        page.evaluate("window.releaseHeld()")
        page.evaluate("()=>window.RJ_API.del('/api/sessions')")
        page.locator("#chestLogin").wait_for(state="visible")
        self.assertEqual(page.locator("#chestItems").inner_text(), ""); self.assertTrue(page.locator("#chestApp").is_hidden())
        self.assertEqual(errors, []); self.evidence.append({"test": "real unknown result/readback/logout", "PUTs": 1, "private_dom_cleared": True})

    def test_native_back_forward_cache_restores_only_the_new_owner(self):
        page, calls, errors = self.page(); self.ready(page)
        page.evaluate("addEventListener('pageshow',e=>sessionStorage.setItem('chest-bfcache',String(e.persisted)))")
        page.wait_for_load_state("networkidle")
        page.goto(self.origin + "/chest-away.html", wait_until="domcontentloaded")
        self.switch(page); page.evaluate("history.back()")
        page.wait_for_function("location.pathname==='/chest.html'")
        self.ready(page); page.wait_for_function("handle=>document.querySelector('#chestPublic').href.includes(handle)", arg=self.b["handle"])
        persisted = page.evaluate("sessionStorage.getItem('chest-bfcache')")
        diagnostics = page.evaluate("performance.getEntriesByType('navigation')[0].toJSON()")
        self.evidence.append({"test": "native BFCache", "persisted": persisted, "owner_after_back": "B", "browser_version": self.browser.version, "navigation": diagnostics})
        self.assertEqual(persisted, "true", "native BFCache must be observed; lifecycle fixtures alone do not prove this gate")
        self.assertEqual(errors, [])


if __name__ == "__main__": unittest.main()
