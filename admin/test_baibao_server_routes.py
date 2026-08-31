import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from admin import server as rj
from admin.auth import hash_password


class BaibaoServerRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "admin").mkdir()
        (self.root / "data").mkdir()
        (self.root / "index.html").write_text("<html><body>index</body></html>")
        (self.root / "games.html").write_text("<html><body>games</body></html>")
        (self.root / "baibao.html").write_text("<html><body>baibao</body></html>")
        (self.root / "codex.html").write_text("<html><body>codex reset</body></html>")
        (self.root / "style.css").write_text(":root{}")
        (self.root / "interactions.js").write_text("")
        (self.root / "baibao.css").write_text(".baibao{}")
        (self.root / "baibao.js").write_text("window.BAIBAO = true;")
        (self.root / "admin" / "edit.css").write_text("")
        (self.root / "admin" / "edit.js").write_text("")
        (self.root / "data" / "questions.json").write_text("[]")
        (self.root / "data" / "mcps.json").write_text('[{"id":"fixture"}]')

        self.old = (rj.SITE, rj.DATA, rj.USERS, rj.AUTH_GENERATION, rj.SESSION_TTL_SECONDS)
        rj.SITE = str(self.root)
        rj.DATA = str(self.root / "data" / "questions.json")
        rj.configure_auth({
            "editor": {
                "password_hash": hash_password("fixture-password", salt=b"fixture-route-auth"),
                "name": "Editor",
                "role": "owner",
            }
        }, "fixture-route-generation")
        self.httpd = rj.ThreadingHTTPServer(("127.0.0.1", 0), rj.H)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=3)
        rj.SITE, rj.DATA, old_users, old_generation, old_ttl = self.old
        rj.configure_auth(old_users, old_generation, ttl_seconds=old_ttl)
        self.temp.cleanup()

    def request(self, path, method="GET", body=None, headers=None):
        connection = http.client.HTTPConnection(
            "127.0.0.1", self.httpd.server_port, timeout=10
        )
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        payload = response.read()
        result = (response.status, response.getheaders(), payload)
        connection.close()
        return result

    @staticmethod
    def header(headers, name):
        return dict((key.lower(), value) for key, value in headers)[name.lower()]

    def test_public_baibao_resources_have_stable_routes_and_types(self):
        expected = {
            "/baibao": ("text/html", b"baibao"),
            "/baibao.html": ("text/html", b"baibao"),
            "/baibao.css": ("text/css", b".baibao{}"),
            "/baibao.js": ("application/javascript", b"window.BAIBAO"),
            "/codex": ("text/html", b"codex reset"),
            "/codex.html": ("text/html", b"codex reset"),
            "/data/mcps.json": ("application/json", b"fixture"),
        }
        for path, (content_type, marker) in expected.items():
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(
                    self.header(headers, "content-type").split(";", 1)[0],
                    content_type,
                )
                self.assertIn(marker, body)

    def test_login_does_not_inject_question_editor_into_baibao(self):
        login_body = json.dumps({"user": "editor", "pass": "fixture-password"})
        status, headers, _ = self.request(
            "/api/login",
            method="POST",
            body=login_body,
            headers={"content-type": "application/json"},
        )
        self.assertEqual(status, 200)
        cookie = self.header(headers, "set-cookie").split(";", 1)[0]

        status, _, baibao = self.request("/baibao.html", headers={"cookie": cookie})
        self.assertEqual(status, 200)
        self.assertNotIn(b"/admin/edit.js", baibao)
        self.assertNotIn(b"/admin/edit.css", baibao)

        status, _, games = self.request("/games.html", headers={"cookie": cookie})
        self.assertEqual(status, 200)
        self.assertIn(b"/admin/edit.js", games)
        self.assertIn(b"/admin/edit.css", games)

    def test_unknown_baibao_path_stays_closed(self):
        status, _, _ = self.request("/baibao-private")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
