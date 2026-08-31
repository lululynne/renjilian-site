import base64
import http.client
import io
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path

from PIL import Image

from admin import server as rj
from admin.auth import hash_password


class ImagePostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "data").mkdir()
        (self.root / "admin").mkdir()
        (self.root / "index.html").write_text("<html><body>index</body></html>")
        (self.root / "games.html").write_text("<html><body>games</body></html>")
        (self.root / "style.css").write_text(":root{}")
        (self.root / "interactions.js").write_text("")
        (self.root / "admin" / "edit.js").write_text("")
        (self.root / "admin" / "edit.css").write_text("")
        self.data = self.root / "data" / "questions.json"
        self.data.write_text("[]")

        self.old = (
            rj.SITE, rj.DATA, rj.ASSET_POSTS, rj.IMAGE_TRASH,
            rj.USERS, rj.AUTH_GENERATION, rj.SESSION_TTL_SECONDS,
        )
        rj.SITE = str(self.root)
        rj.DATA = str(self.data)
        rj.ASSET_POSTS = str(self.root / "assets" / "posts")
        rj.IMAGE_TRASH = str(self.root / "trash")
        rj.configure_auth({
            "editor": {
                "password_hash": hash_password("fixture-password", salt=b"fixture-imagepost"),
                "name": "Editor",
                "role": "owner",
            }
        }, "fixture-image-generation")

    def tearDown(self):
        (
            rj.SITE, rj.DATA, rj.ASSET_POSTS, rj.IMAGE_TRASH,
            old_users, old_generation, old_ttl,
        ) = self.old
        rj.configure_auth(old_users, old_generation, ttl_seconds=old_ttl)
        self.temp.cleanup()

    @staticmethod
    def image_data_url(width=3000, height=1500, color=(245, 188, 201, 255)):
        image = Image.new("RGBA", (width, height), color)
        output = io.BytesIO()
        image.save(output, "PNG")
        return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()

    @staticmethod
    def text_question(**extra):
        question = {
            "id": "q-fixture",
            "title": "fixture",
            "body": "body",
            "tags": [],
            "lv": "all-age",
            "lvName": "全年龄",
            "src": "本站原创",
        }
        question.update(extra)
        return question

    def test_text_only_posts_remain_backward_compatible(self):
        prepared, files = rj.prepare_questions([self.text_question()])
        self.assertNotIn("images", prepared[0])
        self.assertEqual(files, {})

    def test_upload_is_verified_resized_and_saved_as_webp(self):
        question = self.text_question(images=[{
            "alt": "pink fixture",
            "_upload": {"name": "photo.png", "data": self.image_data_url()},
        }])
        saved, archived = rj.save_questions([question])
        image = saved[0]["images"][0]
        self.assertRegex(image["src"], r"^assets/posts/q-fixture/[a-f0-9]{20}\.webp$")
        self.assertEqual(image["alt"], "pink fixture")
        self.assertLessEqual(max(image["width"], image["height"]), rj.MAX_IMAGE_EDGE)
        self.assertEqual(archived, 0)
        path = self.root / image["src"]
        self.assertTrue(path.is_file())
        with Image.open(path) as rendered:
            self.assertEqual(rendered.format, "WEBP")
        on_disk = json.loads(self.data.read_text())
        self.assertEqual(on_disk, saved)

    def test_existing_image_must_belong_to_its_post(self):
        with self.assertRaisesRegex(ValueError, "不属于当前帖子"):
            rj.prepare_questions([self.text_question(images=[{
                "src": "assets/posts/q-someone-else/1234567890abcdef1234.webp"
            }])])

    def test_post_cannot_exceed_nine_images(self):
        with self.assertRaisesRegex(ValueError, "最多 9 张"):
            rj.prepare_questions([self.text_question(images=[{} for _ in range(10)])])

    def test_removed_image_is_moved_to_recoverable_trash(self):
        question = self.text_question(images=[{
            "_upload": {"name": "photo.png", "data": self.image_data_url(120, 80)},
        }])
        saved, _ = rj.save_questions([question])
        source = self.root / saved[0]["images"][0]["src"]
        self.assertTrue(source.exists())
        _, archived = rj.save_questions([self.text_question(images=[])])
        self.assertEqual(archived, 1)
        self.assertFalse(source.exists())
        self.assertEqual(len(list((self.root / "trash").rglob("*.webp"))), 1)

    def test_authenticated_http_save_and_asset_read(self):
        httpd = rj.ThreadingHTTPServer(("127.0.0.1", 0), rj.H)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection("127.0.0.1", httpd.server_port, timeout=10)
            login = json.dumps({"user": "editor", "pass": "fixture-password"})
            connection.request("POST", "/api/login", login, {"content-type": "application/json"})
            response = connection.getresponse()
            login_response = json.loads(response.read())
            self.assertEqual(response.status, 200)
            cookie = response.getheader("set-cookie").split(";", 1)[0]
            csrf = login_response["csrf"]

            payload = {"questions": [self.text_question(images=[{
                "_upload": {"name": "photo.png", "data": self.image_data_url(180, 120)},
            }])]}
            connection.request("POST", "/api/questions", json.dumps(payload), {
                "content-type": "application/json", "cookie": cookie, "x-rj-csrf": csrf,
            })
            response = connection.getresponse()
            body = json.loads(response.read())
            self.assertEqual(response.status, 200)
            source = body["questions"][0]["images"][0]["src"]

            connection.request("GET", "/" + source)
            response = connection.getresponse()
            data = response.read()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.getheader("content-type").split(";", 1)[0], "image/webp")
            self.assertGreater(len(data), 0)
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
