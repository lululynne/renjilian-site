#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""百宝箱「先试玩」父页面壳。目录只放稳定项目 id，不放短期口令。"""
from __future__ import annotations

import copy
import functools
import http.server
import json
import queue
import re
import socket
import threading
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PREVIEW_URL = "https://" + ("cd" * 16) + ".renji-preview.com/"
CATALOG_ROUTE = re.compile(r"/data/mcps\.json")
PREVIEW_ROUTE = re.compile(r"https://[0-9a-f]{32}\.renji-preview\.com")


def injected_catalog() -> dict:
    payload = json.loads((ROOT / "data" / "mcps.json").read_text(encoding="utf-8"))
    experience = {
        "type": "sandbox",
        "label": "限时试玩",
        "caption": "演示数据，不是你的仓库。",
    }
    for item in payload["items"]:
        if item["id"] in {"sound-apple-music", "spicy-monopoly", "candidate-mcdonalds"}:
            item["experiences"] = list(item.get("experiences") or []) + [experience]
    source = next(item for item in payload["items"] if item["id"] == "candidate-mcdonalds")
    clone = copy.deepcopy(source)
    clone["id"] = "unavailable-probe"
    clone["name"] = "未上线探针"
    clone["status"] = "unavailable"
    clone["experiences"] = [experience]
    payload["items"].append(clone)
    return payload


class PreviewApiHandler(http.server.BaseHTTPRequestHandler):
    def _cors(self) -> dict[str, str]:
        return {
            "Access-Control-Allow-Origin": self.headers.get("Origin", "null"),
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Access-Control-Allow-Headers": "content-type,x-renji-preflight",
            "Cache-Control": "no-store",
        }

    def _record(self, body: str | None = None) -> None:
        with self.server.requests_lock:
            self.server.requests.append({
                "method": self.command,
                "url": f"http://{self.headers.get('Host')}{self.path}",
                "headers": {key.lower(): value for key, value in self.headers.items()},
                "body": body,
            })

    def do_OPTIONS(self) -> None:
        self._record()
        self.send_response(204)
        for key, value in self._cors().items():
            self.send_header(key, value)
        self.end_headers()

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        self._record(body)
        response = self.server.responses.get(timeout=10)
        if response["abort"]:
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        encoded = json.dumps(response["payload"]).encode("utf-8")
        self.send_response(response["status"])
        for key, value in self._cors().items():
            self.send_header(key, value)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, _format: str, *_args) -> None:
        return


class BaibaoPreviewBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        cls.catalog = injected_catalog()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self) -> None:
        self.api_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), PreviewApiHandler)
        self.api_server.requests = []
        self.api_server.requests_lock = threading.Lock()
        self.api_server.responses = queue.Queue()
        self.api_thread = threading.Thread(target=self.api_server.serve_forever, daemon=True)
        self.api_thread.start()
        self.api_url = f"http://localhost:{self.api_server.server_port}"
        self.addCleanup(self._close_api_server)

    def _close_api_server(self) -> None:
        self.api_server.shutdown()
        self.api_server.server_close()
        self.api_thread.join(timeout=2)

    def open_page(self, *, width: int = 1100, height: int = 900, inject: bool = True, cookies: bool = False):
        context = self.browser.new_context(viewport={"width": width, "height": height})
        if cookies:
            context.add_cookies([{
                "name": "session",
                "value": "should-not-leak",
                "url": self.base_url,
            }])
        page = context.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        if inject:
            body = json.dumps(self.catalog).encode("utf-8")
            page.route(CATALOG_ROUTE, lambda route: route.fulfill(
                status=200, content_type="application/json", body=body,
            ))
        page.route(PREVIEW_ROUTE, lambda route: route.fulfill(
            status=200, content_type="text/html", body="<!doctype html><p>preview</p>",
        ))
        self.addCleanup(context.close)
        return page, errors

    def goto_baibao(self, page) -> None:
        page.goto(f"{self.base_url}/baibao.html?api={self.api_url}", wait_until="networkidle")
        page.wait_for_selector("#treasure-grid .treasure-card")

    def fulfill_share(self, *, status: int, payload: dict | None = None, abort: str | None = None):
        self.api_server.responses.put({
            "status": status,
            "payload": payload or {},
            "abort": abort,
        })

    def api_requests(self) -> list[dict]:
        with self.api_server.requests_lock:
            return list(self.api_server.requests)

    def clear_api_requests(self) -> None:
        with self.api_server.requests_lock:
            self.api_server.requests.clear()

    def test_production_catalog_has_no_try_button(self) -> None:
        page, errors = self.open_page(inject=False)
        self.goto_baibao(page)
        self.assertEqual(page.locator("#treasure-grid .treasure-card").count(), 8)
        self.assertEqual(page.locator("[data-action='sandbox']").count(), 0)
        self.assertEqual(page.locator("[data-action='try']").count(), 4)
        self.assertEqual(errors, [])

    def test_ready_banner_iframe_and_credentials(self) -> None:
        page, errors = self.open_page(cookies=True)
        self.goto_baibao(page)

        sound = page.locator("#sound-apple-music")
        self.assertEqual(sound.locator("[data-action='sandbox']").count(), 1)
        self.assertEqual(page.locator("#candidate-mcdonalds [data-action='sandbox']").count(), 0)
        self.assertEqual(page.locator("#unavailable-probe [data-action='sandbox']").count(), 0)
        self.assertEqual(page.locator("#spicy-monopoly [data-action='sandbox']").count(), 0)

        sound.get_by_role("button", name="在线体验").click()
        try_panel = sound.locator("[data-panel='try']")
        self.assertTrue(try_panel.is_visible())
        self.assertNotIn("bp_", try_panel.inner_text())

        # Exercise the preflight endpoint across the exact page/API origins. Chromium can elide
        # automatic preflights for loopback origins, so send the OPTIONS probe explicitly while
        # leaving the real click path below unchanged.
        probe_status = page.evaluate(
            """async ({ api }) => {
              const response = await fetch(api + "/api/baibao/previews/open", {
                method: "OPTIONS",
                credentials: "omit",
                headers: { "X-Renji-Preflight": "1" },
              });
              return response.status;
            }""",
            {"api": self.api_url},
        )
        self.assertEqual(probe_status, 204)
        probe_requests = self.api_requests()
        preflight = next(item for item in probe_requests if item["method"] == "OPTIONS")
        self.assertEqual(preflight["headers"].get("origin"), self.base_url)
        self.assertEqual(preflight["headers"].get("sec-fetch-site"), "cross-site")
        self.clear_api_requests()

        sound.get_by_role("button", name="先试玩").click()
        status = sound.locator("[data-sandbox-status]")
        self.assertEqual(status.inner_text(), "启动中")
        for _ in range(50):
            if any(item["method"] == "POST" for item in self.api_requests()):
                break
            page.wait_for_timeout(20)
        requests = self.api_requests()
        seen = next(item for item in requests if item["method"] == "POST")
        self.assertEqual(status.inner_text(), "启动中")
        self.assertNotIn("should-not-leak", seen["headers"].get("cookie") or "")
        self.assertEqual(seen["headers"].get("origin"), self.base_url)
        self.assertEqual(seen["headers"].get("sec-fetch-site"), "cross-site")
        self.assertEqual(seen["method"], "POST")
        self.assertEqual(seen["url"], f"{self.api_url}/api/baibao/previews/open")
        self.assertEqual(json.loads(seen["body"] or "{}"), {"project_id": "sound-apple-music"})

        expires = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
        self.fulfill_share(status=200, payload={"ok": True, "previewUrl": PREVIEW_URL, "expiresAt": expires})
        page.wait_for_function(
            """() => {
              const el = document.querySelector("#sound-apple-music [data-sandbox-status]");
              return el && el.textContent === "就绪";
            }"""
        )
        banner = sound.locator(".treasure-sandbox-banner").inner_text()
        self.assertIn("演示数据", banner)
        self.assertIn("第三方内容", banner)
        self.assertIn("限时预览", banner)
        self.assertIn("还剩", banner)
        self.assertIn("返回原仓库", banner)
        repo = sound.locator("a.treasure-sandbox-repo")
        self.assertEqual(repo.get_attribute("href"), "https://github.com/seayniclabs/sound")
        self.assertIn("noopener", repo.get_attribute("rel") or "")
        self.assertIn("noreferrer", repo.get_attribute("rel") or "")
        self.assertEqual(repo.get_attribute("target"), "_blank")

        frame = sound.locator("iframe.treasure-sandbox-frame")
        self.assertEqual(frame.get_attribute("sandbox"), "allow-scripts")
        self.assertEqual(frame.get_attribute("referrerpolicy"), "no-referrer")
        self.assertIsNone(frame.get_attribute("allow"))
        self.assertEqual(frame.get_attribute("src"), PREVIEW_URL)
        for token in ("allow-same-origin", "allow-downloads", "allow-popups", "allow-top-navigation"):
            self.assertNotIn(token, (frame.get_attribute("sandbox") or "").split())

        boxes = page.evaluate(
            """() => {
              const banner = document.querySelector("#sound-apple-music .treasure-sandbox-banner");
              const frame = document.querySelector("#sound-apple-music .treasure-sandbox-frame");
              const a = banner.getBoundingClientRect();
              const b = frame.getBoundingClientRect();
              return {bannerBottom: a.bottom, frameTop: b.top, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth};
            }"""
        )
        self.assertLessEqual(boxes["bannerBottom"], boxes["frameTop"] + 1)
        self.assertLessEqual(boxes["scroll"], boxes["client"] + 1)

        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(100)
        mobile = page.evaluate(
            """() => ({
              scroll: document.documentElement.scrollWidth,
              client: document.documentElement.clientWidth,
              bannerBottom: document.querySelector("#sound-apple-music .treasure-sandbox-banner").getBoundingClientRect().bottom,
              frameTop: document.querySelector("#sound-apple-music .treasure-sandbox-frame").getBoundingClientRect().top,
            })"""
        )
        self.assertLessEqual(mobile["scroll"], mobile["client"] + 1)
        self.assertLessEqual(mobile["bannerBottom"], mobile["frameTop"] + 1)
        self.assertTrue(page.locator("#treasure-error").is_hidden())
        self.assertEqual(errors, [])

        sound.get_by_role("button", name="在线体验").click()
        self.assertEqual(sound.locator("iframe.treasure-sandbox-frame").count(), 0)

        page.locator("#spicy-monopoly").get_by_role("button", name="我已成年，查看项目").click()
        self.assertEqual(page.locator("#spicy-monopoly [data-action='sandbox']").count(), 1)
        self.assertEqual(page.locator("#spicy-monopoly [data-action='bring']").count(), 1)
        self.assertEqual(page.locator("#spicy-monopoly [data-action='try']").count(), 1)

    def _open_and_click(self, *, status: int = 200, payload: dict | None = None, abort: str | None = None):
        page, errors = self.open_page()
        self.fulfill_share(status=status, payload=payload, abort=abort)
        self.goto_baibao(page)
        page.locator("#sound-apple-music").get_by_role("button", name="先试玩").click()
        return page, errors

    def test_404_is_missing_not_a_card_error(self) -> None:
        page, errors = self._open_and_click(status=404, payload={"ok": False, "error": "找不到。"})
        page.wait_for_function(
            """() => document.querySelector("#sound-apple-music [data-sandbox-status]").textContent === "已过期或不存在" """
        )
        self.assertEqual(page.locator("#sound-apple-music iframe.treasure-sandbox-frame").count(), 0)
        self.assertIn("演示数据", page.locator("#sound-apple-music .treasure-sandbox-banner").inner_text())
        self.assertTrue(page.locator("#treasure-error").is_hidden())
        self.assertEqual(self.unexpected(errors), [])

    def test_expired_body_is_destroyed_without_iframe(self) -> None:
        page, errors = self._open_and_click(payload={
            "ok": True,
            "previewUrl": PREVIEW_URL,
            "expiresAt": "2000-01-01T00:00:00.000Z",
        })
        page.wait_for_function(
            """() => document.querySelector("#sound-apple-music [data-sandbox-status]").textContent === "已销毁" """
        )
        self.assertEqual(page.locator("#sound-apple-music iframe").count(), 0)
        self.assertIn("已到时", page.locator("#sound-apple-music .treasure-sandbox-banner").inner_text())
        self.assertTrue(page.locator("#treasure-error").is_hidden())
        self.assertEqual(errors, [])

    def test_foreign_preview_url_is_rejected(self) -> None:
        page, errors = self._open_and_click(payload={
            "ok": True,
            "previewUrl": "https://evil.example/",
            "expiresAt": "2099-01-01T00:00:00.000Z",
        })
        page.wait_for_function(
            """() => document.querySelector("#sound-apple-music [data-sandbox-status]").textContent === "网络错误" """
        )
        self.assertEqual(page.locator("#sound-apple-music iframe").count(), 0)
        self.assertTrue(page.locator("#treasure-error").is_hidden())
        self.assertEqual(errors, [])

    def test_network_abort_stays_on_the_card(self) -> None:
        page, errors = self._open_and_click(abort="failed")
        page.wait_for_function(
            """() => document.querySelector("#sound-apple-music [data-sandbox-status]").textContent === "网络错误" """
        )
        self.assertEqual(page.locator("#sound-apple-music iframe").count(), 0)
        self.assertTrue(page.locator("#treasure-error").is_hidden())
        self.assertEqual(self.unexpected(errors), [])

    @staticmethod
    def unexpected(errors: list[str]) -> list[str]:
        # 404 和主动断开是这一步要的结果。浏览器会把它们记成资源失败，那不是页面脚本异常。
        return [item for item in errors if not item.startswith("Failed to load resource")]

    def test_two_opaque_frames_cannot_read_each_other_or_the_parent(self) -> None:
        page, errors = self.open_page(inject=False)
        self.goto_baibao(page)
        result = page.evaluate(
            """async () => {
              localStorage.setItem("rj-sandbox-probe", "parent-secret");
              function frame(name, secret) {
                return new Promise((resolve) => {
                  const iframe = document.createElement("iframe");
                  iframe.setAttribute("sandbox", "allow-scripts");
                  iframe.setAttribute("title", name);
                  const finish = (payload) => {
                    let parentRead = "unread";
                    try {
                      parentRead = String(iframe.contentWindow.localStorage.getItem("rj-sandbox-slot"));
                    } catch (error) {
                      parentRead = "blocked:" + error.name;
                    }
                    iframe.remove();
                    resolve(Object.assign({parentRead}, payload));
                  };
                  const timer = setTimeout(() => finish({timeout: true, name}), 2000);
                  const onMessage = (event) => {
                    if (!event.data || event.data.probe !== name) return;
                    window.removeEventListener("message", onMessage);
                    clearTimeout(timer);
                    finish(event.data);
                  };
                  window.addEventListener("message", onMessage);
                  iframe.srcdoc = `<!doctype html><script>
                    var own = null, parentSeen = null, ownErr = null, parentErr = null;
                    try { localStorage.setItem("rj-sandbox-slot", ${JSON.stringify(secret)}); own = localStorage.getItem("rj-sandbox-slot"); }
                    catch (error) { ownErr = error.name; }
                    try { parentSeen = parent.localStorage.getItem("rj-sandbox-probe"); }
                    catch (error) { parentErr = error.name; }
                    parent.postMessage({probe: ${JSON.stringify(name)}, own, parentSeen, ownErr, parentErr}, "*");
                  </script>`;
                  document.body.appendChild(iframe);
                });
              }
              const alpha = await frame("alpha", "alpha-secret");
              const beta = await frame("beta", "beta-secret");
              const parentStill = localStorage.getItem("rj-sandbox-probe");
              localStorage.removeItem("rj-sandbox-probe");
              return {alpha, beta, parentStill};
            }"""
        )
        for side in (result["alpha"], result["beta"]):
            self.assertNotEqual(side.get("parentSeen"), "parent-secret", side)
            self.assertTrue(str(side.get("parentRead", "")).startswith("blocked:"), side)
            self.assertNotIn("parent-secret", str(side.get("parentRead")), side)
        self.assertNotEqual(result["beta"].get("own"), "alpha-secret", result)
        self.assertNotEqual(result["alpha"].get("own"), "beta-secret", result)
        self.assertEqual(result["parentStill"], "parent-secret")
        leaked = [item for item in errors if "parent-secret" in item or "alpha-secret" in item]
        self.assertEqual(leaked, [])


if __name__ == "__main__":
    unittest.main()
