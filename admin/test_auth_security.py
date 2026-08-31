from __future__ import annotations

import contextlib
import http.client
import io
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from admin import auth
from admin import rotate_credentials as rotator
from admin import server as rj


FIXTURE_PASSWORD = "fixture-password"


def fixture_users():
    return {
        "editor": {
            "name": "Editor",
            "role": "owner",
            "password_hash": auth.hash_password(
                FIXTURE_PASSWORD, salt=b"fixture-auth-salt"
            ),
        }
    }


def auth_payload():
    return {
        "version": 1,
        "generation": "fixture-generation-1",
        "users": fixture_users(),
    }


class MemoryKeychain:
    def __init__(self, initial=None, fail_account=None):
        self.values = dict(initial or {})
        self.fail_account = fail_account

    def get(self, service, account):
        return self.values.get((service, account))

    def set(self, service, account, password):
        if account == self.fail_account:
            raise RuntimeError("fixture keychain failure")
        self.values[(service, account)] = password

    def delete(self, service, account):
        self.values.pop((service, account), None)


class AuthPrimitiveTests(unittest.TestCase):
    def write_auth(self, root: Path, payload=None, mode=0o600) -> Path:
        target = root / "auth.json"
        target.write_text(json.dumps(payload or auth_payload()), encoding="utf-8")
        target.chmod(mode)
        return target

    def test_scrypt_roundtrip_and_malformed_records(self):
        record = auth.hash_password(FIXTURE_PASSWORD, salt=b"roundtrip-salt!!")
        self.assertTrue(auth.verify_password(FIXTURE_PASSWORD, record))
        self.assertFalse(auth.verify_password("wrong-password", record))
        self.assertFalse(auth.verify_password("x" * 1025, record))
        for malformed in (None, "", "plain", "scrypt$1$8$1$bad$bad"):
            with self.subTest(malformed=malformed):
                self.assertFalse(auth.verify_password(FIXTURE_PASSWORD, malformed))

    def test_auth_file_accepts_owner_only_regular_file(self):
        with tempfile.TemporaryDirectory() as directory:
            users, generation = auth.load_auth_file(
                str(self.write_auth(Path(directory)))
            )
            self.assertEqual(set(users), {"editor"})
            self.assertEqual(generation, "fixture-generation-1")
            self.assertNotIn("pass", users["editor"])

    def test_auth_file_rejects_relative_symlink_and_unsafe_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = self.write_auth(root)
            with self.assertRaises(auth.AuthConfigError):
                auth.load_auth_file("auth.json")
            link = root / "link.json"
            link.symlink_to(target)
            with self.assertRaises(auth.AuthConfigError):
                auth.load_auth_file(str(link))
            target.chmod(0o640)
            with self.assertRaises(auth.AuthConfigError):
                auth.load_auth_file(str(target))
            target.write_bytes(b"x" * (auth.AUTH_FILE_MAX_BYTES + 1))
            target.chmod(0o600)
            with self.assertRaises(auth.AuthConfigError):
                auth.load_auth_file(str(target))

    def test_auth_file_rejects_owner_schema_and_plaintext_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = self.write_auth(root)
            with mock.patch("admin.auth.os.getuid", return_value=os.getuid() + 1):
                with self.assertRaises(auth.AuthConfigError):
                    auth.load_auth_file(str(target))
            payload = auth_payload()
            payload["users"]["editor"]["pass"] = "fixture-only"
            target = self.write_auth(root, payload)
            with self.assertRaises(auth.AuthConfigError):
                auth.load_auth_file(str(target))
            payload = auth_payload()
            payload["extra"] = True
            target = self.write_auth(root, payload)
            with self.assertRaises(auth.AuthConfigError):
                auth.load_auth_file(str(target))

    def test_runtime_missing_auth_pointer_fails_closed(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(auth.AuthConfigError):
                rj.load_runtime_auth()

    def test_runtime_bind_and_port_are_strict(self):
        self.assertEqual(rj.runtime_bind("127.0.0.1"), "127.0.0.1")
        self.assertEqual(rj.runtime_bind("0.0.0.0"), "0.0.0.0")
        self.assertEqual(rj.runtime_port("14296"), 14296)
        for value in ("localhost", "::", "192.168.1.2"):
            with self.subTest(bind=value), self.assertRaises(auth.AuthConfigError):
                rj.runtime_bind(value)
        for value in ("bad", "80", "70000"):
            with self.subTest(port=value), self.assertRaises(auth.AuthConfigError):
                rj.runtime_port(value)

    def test_session_expiry_revoke_and_generation_reset(self):
        store = auth.SessionStore("generation-one", 900)
        token, issued = store.issue("editor", now=100)
        self.assertEqual(store.get(token, now=999)["csrf"], issued["csrf"])
        self.assertIsNone(store.get(token, now=1000))
        token, _ = store.issue("editor", now=2000)
        store.revoke(token)
        self.assertIsNone(store.get(token, now=2001))
        token, _ = store.issue("editor", now=3000)
        store.reset("generation-two", 900)
        self.assertIsNone(store.get(token, now=3001))

    def test_login_limiter_blocks_and_success_clears(self):
        limiter = auth.LoginLimiter(attempts=3, window_seconds=60, block_seconds=90)
        key = ("127.0.0.1", "editor")
        self.assertEqual(limiter.failure(key, now=1), 0)
        self.assertEqual(limiter.failure(key, now=2), 0)
        self.assertEqual(limiter.failure(key, now=3), 90)
        self.assertEqual(limiter.retry_after(key, now=4), 89)
        limiter.success(key)
        self.assertEqual(limiter.retry_after(key, now=4), 0)


class AuthHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "admin").mkdir()
        (self.root / "data").mkdir()
        for name in ("index.html", "games.html"):
            (self.root / name).write_text("<html><body>fixture</body></html>")
        (self.root / "style.css").write_text(":root{}")
        (self.root / "interactions.js").write_text("")
        (self.root / "admin" / "edit.js").write_text("")
        (self.root / "admin" / "edit.css").write_text("")
        self.data = self.root / "data" / "questions.json"
        self.data.write_text("[]")
        self.old = (
            rj.SITE,
            rj.DATA,
            rj.USERS,
            rj.AUTH_GENERATION,
            rj.SESSION_TTL_SECONDS,
            rj.COOKIE_SECURE,
            rj.PUBLISH_ENABLED,
        )
        rj.SITE = str(self.root)
        rj.DATA = str(self.data)
        rj.COOKIE_SECURE = False
        rj.PUBLISH_ENABLED = False
        rj.configure_auth(fixture_users(), "fixture-http-generation", ttl_seconds=900)
        self.httpd = rj.ThreadingHTTPServer(("127.0.0.1", 0), rj.H)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=3)
        (
            rj.SITE,
            rj.DATA,
            old_users,
            old_generation,
            old_ttl,
            rj.COOKIE_SECURE,
            rj.PUBLISH_ENABLED,
        ) = self.old
        rj.configure_auth(old_users, old_generation, ttl_seconds=old_ttl)
        self.temp.cleanup()

    def request(self, path, method="GET", payload=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=10)
        body = json.dumps(payload) if payload is not None else None
        request_headers = dict(headers or {})
        if payload is not None:
            request_headers.setdefault("content-type", "application/json")
        connection.request(method, path, body=body, headers=request_headers)
        response = connection.getresponse()
        raw = response.read()
        result = response.status, dict((k.lower(), v) for k, v in response.getheaders()), raw
        connection.close()
        return result

    def login(self):
        status, headers, raw = self.request(
            "/api/login",
            "POST",
            {"user": "editor", "pass": FIXTURE_PASSWORD},
        )
        self.assertEqual(status, 200)
        payload = json.loads(raw)
        return headers["set-cookie"].split(";", 1)[0], payload["csrf"], headers

    def test_login_cookie_me_and_conditional_secure(self):
        cookie, csrf, headers = self.login()
        full_cookie = headers["set-cookie"]
        self.assertIn("HttpOnly", full_cookie)
        self.assertIn("SameSite=Strict", full_cookie)
        self.assertIn("Max-Age=900", full_cookie)
        self.assertNotIn("Secure", full_cookie)
        status, _, raw = self.request("/api/me", headers={"cookie": cookie})
        self.assertEqual(status, 200)
        me = json.loads(raw)
        self.assertEqual(set(me), {"name", "role", "csrf", "publish_enabled"})
        self.assertEqual(me["csrf"], csrf)
        self.assertFalse(me["publish_enabled"])
        rj.COOKIE_SECURE = True
        _, headers, _ = self.request(
            "/api/login", "POST", {"user": "editor", "pass": FIXTURE_PASSWORD}
        )
        self.assertIn("Secure", headers["set-cookie"])

    def test_csrf_guards_all_authenticated_posts(self):
        cookie, csrf, _ = self.login()
        for path, payload in (
            ("/api/questions", {"questions": []}),
            ("/api/logout", {}),
            ("/api/publish", {}),
        ):
            with self.subTest(path=path):
                status, _, _ = self.request(path, "POST", payload, {"cookie": cookie})
                self.assertEqual(status, 403)
                status, _, _ = self.request(
                    path,
                    "POST",
                    payload,
                    {"cookie": cookie, "x-rj-csrf": "wrong"},
                )
                self.assertEqual(status, 403)
        status, _, _ = self.request(
            "/api/questions",
            "POST",
            {"questions": []},
            {"cookie": cookie, "x-rj-csrf": csrf},
        )
        self.assertEqual(status, 200)

    def test_publish_is_fail_closed_and_logout_expires_cookie(self):
        cookie, csrf, _ = self.login()
        status, _, raw = self.request(
            "/api/publish", "POST", {}, {"cookie": cookie, "x-rj-csrf": csrf}
        )
        self.assertEqual(status, 503)
        self.assertIn("暂时锁住", json.loads(raw)["error"])
        status, headers, _ = self.request(
            "/api/logout", "POST", {}, {"cookie": cookie, "x-rj-csrf": csrf}
        )
        self.assertEqual(status, 200)
        self.assertIn("Max-Age=0", headers["set-cookie"])
        status, _, _ = self.request("/api/me", headers={"cookie": cookie})
        self.assertEqual(status, 401)

    def test_login_rate_limit_uses_generic_error(self):
        statuses = []
        for _ in range(5):
            status, headers, raw = self.request(
                "/api/login", "POST", {"user": "missing", "pass": "wrong-password"}
            )
            statuses.append(status)
        self.assertEqual(statuses, [401, 401, 401, 401, 429])
        self.assertIn("retry-after", headers)
        self.assertNotIn("missing", raw.decode())


class RotationSourceTests(unittest.TestCase):
    def test_macos_keychain_adapter_initializes_without_accessing_items(self):
        adapter = rotator.MacOSKeychain()
        self.assertIsNotNone(adapter.security)

    def test_output_path_must_be_external_and_dry_run_is_zero_write(self):
        with self.assertRaises(ValueError):
            rotator.validate_output_path(rotator.REPO_ROOT / "auth.json")
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "auth.json"
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(rotator.main(["--output", str(target)]), 0)
            self.assertFalse(target.exists())
            self.assertNotIn(FIXTURE_PASSWORD, output.getvalue())

    def test_rotation_writes_hashes_and_keychain_without_stdout(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "secrets" / "auth.json"
            keychain = MemoryKeychain()
            result = rotator.rotate(target, keychain=keychain)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            users, generation = auth.load_auth_file(str(target))
            self.assertEqual(generation, result["generation"])
            for username, record in users.items():
                password = keychain.get(rotator.KEYCHAIN_SERVICE, username)
                self.assertTrue(password)
                self.assertTrue(auth.verify_password(password, record["password_hash"]))
                self.assertNotIn(password, target.read_text())

    def test_rotation_failure_restores_keychain_and_leaves_no_auth_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "auth.json"
            initial = {
                (rotator.KEYCHAIN_SERVICE, "meibao"): "old-meibao-fixture",
                (rotator.KEYCHAIN_SERVICE, "ajing"): "old-ajing-fixture",
            }
            keychain = MemoryKeychain(initial, fail_account="meibao")
            with self.assertRaises(RuntimeError):
                rotator.rotate(target, keychain=keychain)
            self.assertFalse(target.exists())
            self.assertEqual(keychain.values, initial)


class SourceCredentialTests(unittest.TestCase):
    def test_server_has_no_runtime_password_literals_and_backups_are_absent(self):
        tree = __import__("ast").parse((Path(__file__).parent / "server.py").read_text())
        assignments = [
            node for node in tree.body
            if isinstance(node, __import__("ast").Assign)
            and any(isinstance(target, __import__("ast").Name) and target.id == "USERS" for target in node.targets)
        ]
        self.assertEqual(len(assignments), 1)
        self.assertEqual(__import__("ast").literal_eval(assignments[0].value), {})
        for name in (
            "server.py.bak-20260728",
            "server.py.bak-20260729",
            "server.py.bak2-20260729",
        ):
            self.assertFalse((Path(__file__).parent / name).exists())

    def test_publish_source_is_locked_and_editor_keeps_pre_reload_compatibility(self):
        server_text = (Path(__file__).parent / "server.py").read_text()
        editor_text = (Path(__file__).parent / "edit.js").read_text()
        self.assertIn("PUBLISH_ENABLED = False", server_text)
        self.assertNotIn("subprocess.run", server_text)
        self.assertIn('ME.publish_enabled !== false', editor_text)
        self.assertIn('CSRF = ME.csrf || ""', editor_text)

    def test_gitignore_rejects_cache_backup_and_repo_auth_files(self):
        text = (Path(__file__).resolve().parents[1] / ".gitignore").read_text()
        for marker in ("__pycache__/", "*.py[cod]", "admin/*.bak*", "auth.json"):
            self.assertIn(marker, text)


if __name__ == "__main__":
    unittest.main()
