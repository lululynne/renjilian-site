#!/usr/bin/env python3
"""renji.love 主编后台（局域网专用 · 端口 14295）· 所见即所得形态
站主=梅宝，管理员=阿景。登录后看到的就是网站本身（真实 index.html / games.html / style.css），
只在页首多一条编辑工具条、卡片上多编辑/删除；游客拿到的是逐字节原样的页面，一个编辑元素都没有。
编辑 data/questions.json，「保存草稿」落盘，「发布上线」= git commit + push → Pages 一分钟后生效。
只绑家里这张网，不出公网。2026-07-27 深夜她说「我今天还没开始工作」——这就是她的工位。
2026-07-28 按她的原话改成所见即所得：「我想要跟网站界面一模一样，只是多了编辑和上架权限。」
"""
import base64, hashlib, io, json, mimetypes, os, re, secrets, shutil, time
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageOps, UnidentifiedImageError

try:
    from .auth import (
        DUMMY_PASSWORD_RECORD,
        AuthConfigError,
        LoginLimiter,
        SessionStore,
        load_auth_file,
        session_ttl_seconds,
        verify_password,
    )
except ImportError:  # direct ``python admin/server.py`` execution
    from auth import (
        DUMMY_PASSWORD_RECORD,
        AuthConfigError,
        LoginLimiter,
        SessionStore,
        load_auth_file,
        session_ttl_seconds,
        verify_password,
    )

SITE = os.path.expanduser("~/renjilian-site")
DATA = os.path.join(SITE, "data", "questions.json")
ASSET_POSTS = os.path.join(SITE, "assets", "posts")
IMAGE_TRASH = os.path.expanduser("~/renjilian-site-backups/image-trash")


def runtime_port(value):
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise AuthConfigError("invalid RENJILIAN_PORT") from exc
    if not (1024 <= port <= 65535):
        raise AuthConfigError("RENJILIAN_PORT out of range")
    return port


def runtime_bind(value):
    if value not in {"127.0.0.1", "0.0.0.0"}:
        raise AuthConfigError("RENJILIAN_BIND must be loopback or all interfaces")
    return value


PORT = runtime_port(os.environ.get("RENJILIAN_PORT", "14295"))
BIND_HOST = runtime_bind(os.environ.get("RENJILIAN_BIND", "127.0.0.1"))

MAX_IMAGES_PER_POST = 9
MAX_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024
MAX_SAVE_REQUEST_BYTES = 96 * 1024 * 1024
MAX_IMAGE_EDGE = 2048
MAX_IMAGE_PIXELS = 40_000_000
_DATA_IMAGE_RE = re.compile(r"^data:image/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$")
_QUESTION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,96}$")
_POST_IMAGE_RE = re.compile(r"^assets/posts/([A-Za-z0-9_-]{1,96})/([a-f0-9]{20}\.webp)$")

USERS = {}  # runtime-only metadata + salted password hashes from RENJILIAN_AUTH_FILE
AUTH_GENERATION = "fixture-generation"
SESSION_TTL_SECONDS = session_ttl_seconds(os.environ.get("RENJILIAN_SESSION_TTL"))
COOKIE_SECURE = os.environ.get("RENJILIAN_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
# R1 safe-publish is not implemented yet. No environment variable can bypass
# this source gate; reopening it requires a reviewed code change.
PUBLISH_ENABLED = False
TOKENS = SessionStore(AUTH_GENERATION, SESSION_TTL_SECONDS)
LOGIN_LIMITER = LoginLimiter()


def configure_auth(users, generation, *, ttl_seconds=None):
    """Install one validated auth generation; tests use this with fixture hashes."""
    global USERS, AUTH_GENERATION, SESSION_TTL_SECONDS
    USERS = users
    AUTH_GENERATION = generation
    SESSION_TTL_SECONDS = session_ttl_seconds(ttl_seconds)
    TOKENS.reset(AUTH_GENERATION, SESSION_TTL_SECONDS)
    LOGIN_LIMITER.clear()


def load_runtime_auth():
    auth_file = os.environ.get("RENJILIAN_AUTH_FILE")
    users, generation = load_auth_file(auth_file)
    configure_auth(users, generation, ttl_seconds=os.environ.get("RENJILIAN_SESSION_TTL"))


def _new_question_id(seen_ids):
    while True:
        candidate = "q-%s-%s" % (time.strftime("%Y%m%d"), secrets.token_hex(3))
        if candidate not in seen_ids:
            return candidate


def _existing_image(item, question_id):
    """Accept only assets owned by this post; legacy string entries stay readable."""
    if isinstance(item, str):
        item = {"src": item}
    if not isinstance(item, dict):
        raise ValueError("图片字段格式不对")
    src = str(item.get("src", "")).strip().lstrip("/")
    match = _POST_IMAGE_RE.fullmatch(src)
    if not match or match.group(1) != question_id:
        raise ValueError("图片路径不属于当前帖子")
    result = {
        "src": src,
        "alt": str(item.get("alt", ""))[:180],
    }
    for key in ("width", "height", "bytes"):
        value = item.get(key)
        if isinstance(value, int) and value > 0:
            result[key] = value
    return result


def _uploaded_image(item, question_id):
    """Decode a browser-compressed image, verify pixels, and return WebP bytes + metadata."""
    if not isinstance(item, dict) or not isinstance(item.get("_upload"), dict):
        raise ValueError("待上传图片格式不对")
    payload = item["_upload"]
    data_url = str(payload.get("data", ""))
    match = _DATA_IMAGE_RE.fullmatch(data_url)
    if not match:
        raise ValueError("只支持 JPEG、PNG 或 WebP 图片")
    try:
        raw = base64.b64decode(match.group(1), validate=True)
    except Exception as exc:
        raise ValueError("图片数据损坏") from exc
    if not raw or len(raw) > MAX_IMAGE_SOURCE_BYTES:
        raise ValueError("单张图片不能超过 20 MB")
    try:
        with Image.open(io.BytesIO(raw)) as opened:
            if opened.width * opened.height > MAX_IMAGE_PIXELS:
                raise ValueError("图片像素过大")
            opened.load()
            image = ImageOps.exif_transpose(opened)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "transparency" in image.info else "RGB")
            image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, "WEBP", quality=84, method=6)
            encoded = output.getvalue()
            width, height = image.size
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("无法识别这张图片") from exc

    digest = hashlib.sha256(encoded).hexdigest()[:20]
    relative = f"assets/posts/{question_id}/{digest}.webp"
    return {
        "src": relative,
        "alt": str(item.get("alt", ""))[:180],
        "width": width,
        "height": height,
        "bytes": len(encoded),
    }, encoded


def prepare_questions(raw_questions):
    """Validate the full ledger and materialize uploads without changing the live files yet."""
    if not isinstance(raw_questions, list):
        raise ValueError("格式不对")
    now = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
    prepared, pending_files, seen_ids = [], {}, set()
    for original in raw_questions:
        if not (isinstance(original, dict) and isinstance(original.get("title"), str)
                and isinstance(original.get("body"), str)):
            raise ValueError("卡片缺标题或正文")
        question = dict(original)
        question.setdefault("tags", [])
        question.setdefault("lv", "all-age")
        question.setdefault("lvName", {"all-age": "全年龄", "tease": "暧昧", "r18": "18+"}.get(question["lv"], "全年龄"))
        question.setdefault("src", "本站原创")
        question_id = str(question.get("id", ""))
        if not _QUESTION_ID_RE.fullmatch(question_id) or question_id in seen_ids:
            question_id = _new_question_id(seen_ids)
            question["id"] = question_id
        seen_ids.add(question_id)
        question.setdefault("created_at", now)

        cleaned, seen_tags = [], set()
        for tag in question["tags"] if isinstance(question["tags"], list) else []:
            tag = str(tag).strip().lstrip("#").strip()
            if tag and tag not in seen_tags:
                seen_tags.add(tag)
                cleaned.append(tag)
        question["tags"] = cleaned

        images = question.get("images", [])
        if images is None:
            images = []
        if not isinstance(images, list) or len(images) > MAX_IMAGES_PER_POST:
            raise ValueError(f"每篇帖子最多 {MAX_IMAGES_PER_POST} 张图片")
        normalized_images = []
        for item in images:
            if isinstance(item, dict) and "_upload" in item:
                metadata, encoded = _uploaded_image(item, question_id)
                pending_files[metadata["src"]] = encoded
                normalized_images.append(metadata)
            else:
                normalized_images.append(_existing_image(item, question_id))
        if normalized_images or "images" in original:
            question["images"] = normalized_images
        else:
            question.pop("images", None)
        prepared.append(question)
    return prepared, pending_files


def _referenced_images(questions):
    return {
        image["src"]
        for question in questions
        for image in question.get("images", [])
        if isinstance(image, dict) and _POST_IMAGE_RE.fullmatch(str(image.get("src", "")))
    }


def _archive_unreferenced_images(questions):
    """Move removed/cancelled uploads outside the repo instead of destroying them."""
    if not os.path.isdir(ASSET_POSTS):
        return 0
    referenced = _referenced_images(questions)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    moved = 0
    for root, _, files in os.walk(ASSET_POSTS):
        for name in files:
            if not name.endswith(".webp"):
                continue
            source = os.path.join(root, name)
            relative = os.path.relpath(source, SITE).replace(os.sep, "/")
            if relative in referenced:
                continue
            destination = os.path.join(IMAGE_TRASH, stamp, relative)
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.move(source, destination)
            moved += 1
    return moved


def save_questions(raw_questions):
    """Commit images and JSON as one save operation; questions.json is always atomically replaced."""
    questions, pending_files = prepare_questions(raw_questions)
    created = []
    try:
        for relative, encoded in pending_files.items():
            destination = os.path.join(SITE, *relative.split("/"))
            if os.path.exists(destination):
                continue
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            temporary = destination + ".tmp-" + secrets.token_hex(4)
            with open(temporary, "wb") as handle:
                handle.write(encoded)
            os.replace(temporary, destination)
            created.append(destination)

        os.makedirs(os.path.dirname(DATA), exist_ok=True)
        temporary_data = DATA + ".tmp-" + secrets.token_hex(4)
        with open(temporary_data, "w", encoding="utf-8") as handle:
            json.dump(questions, handle, ensure_ascii=False, indent=2)
        if os.path.exists(DATA):
            shutil.copy2(DATA, DATA + ".bak")
        os.replace(temporary_data, DATA)
    except Exception:
        for path in created:
            if os.path.isfile(path):
                os.unlink(path)
        raise
    try:
        archived = _archive_unreferenced_images(questions)
    except OSError:
        # JSON 和新图已成功落盘时，回收站偶发不可写不应把主保存谎报成失败。
        archived = 0
    return questions, archived

# 登录后注入真实页面的编辑层（游客不注入，连引用都没有）
INJECT = b'<link rel="stylesheet" href="/admin/edit.css"><script src="/admin/edit.js"></script>'

# 主编入口：用站点自己的 style.css 与配色，不加第二套皮
LOGIN = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>主编入口 · renji.love</title>
<link rel="stylesheet" href="/style.css">
<style>
.loginbox{max-width:340px;margin:16vh auto;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:28px}
.loginbox h1{font-size:18px;margin-bottom:2px}
.loginbox .sub{font-size:12.5px;color:var(--ink-soft);margin-bottom:14px}
.loginbox label{font-size:12.5px;color:var(--ink-soft);display:block;margin-top:12px}
.loginbox input{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;font-size:14px;color:var(--ink);font-family:inherit;outline:none;margin-top:6px}
.loginbox input:focus{border-color:var(--accent)}
.loginbox button{margin-top:16px;padding:9px 22px;border:none;border-radius:999px;background:var(--accent);color:#fff;font-size:14px;cursor:pointer;font-family:inherit}
.loginbox .err{font-size:12.5px;color:#b0524a;margin-top:8px;min-height:1em}
</style></head><body>
<div class="loginbox"><h1>主编入口</h1>
<div class="sub">renji.love · 家里的网才进得来。登录后看到的就是网站本身，只多出编辑与发布。</div>
<label>账号</label><input id="u" autocapitalize="off" autocomplete="username">
<label>密码</label><input id="p" type="password" autocomplete="current-password">
<button id="go">登录</button><div class="err" id="err"></div></div>
<script>
async function go(){
  const r = await fetch("/api/login",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({user:document.getElementById("u").value.trim(),pass:document.getElementById("p").value})});
  if(r.ok){ location.href = "/"; }
  else{ document.getElementById("err").textContent = "账号或密码不对"; }
}
document.getElementById("go").addEventListener("click", go);
document.getElementById("p").addEventListener("keydown", e=>{ if(e.key==="Enter") go(); });
document.getElementById("u").focus();
</script></body></html>"""


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json", cookie=None, headers=None):
        raw = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", ctype + "; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("referrer-policy", "no-referrer")
        if cookie:
            self.send_header("set-cookie", cookie)
        for name, value in (headers or {}).items():
            self.send_header(name, str(value))
        self.end_headers()
        self.wfile.write(raw)

    def _redirect(self, to):
        self.send_response(303)
        self.send_header("location", to)
        self.send_header("content-length", "0")
        self.end_headers()

    def _token_value(self):
        c = self.headers.get("cookie", "")
        for part in c.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "rjtoken":
                return v
        return None

    def _session(self):
        return TOKENS.get(self._token_value())

    def _user(self):
        session = self._session()
        return session.get("user") if session else None

    def _csrf_valid(self, session):
        supplied = self.headers.get("x-rj-csrf", "")
        expected = session.get("csrf", "") if session else ""
        return bool(supplied and expected and secrets.compare_digest(supplied, expected))

    def _session_cookie(self, token, *, max_age=None):
        age = TOKENS.ttl_seconds if max_age is None else max_age
        parts = [f"rjtoken={token}", "Path=/", "HttpOnly", "SameSite=Strict", f"Max-Age={age}"]
        if COOKIE_SECURE:
            parts.append("Secure")
        return "; ".join(parts)

    def _body(self, limit=1024 * 1024):
        n = int(self.headers.get("content-length", 0) or 0)
        if n > limit:
            raise ValueError("请求内容过大")
        try:
            return json.loads(self.rfile.read(n)) if n else {}
        except json.JSONDecodeError as exc:
            raise ValueError("请求格式不对") from exc

    def _file(self, rel, ctype="application/json"):
        p = os.path.realpath(os.path.join(SITE, rel))
        if not p.startswith(os.path.realpath(SITE) + os.sep):
            return self._send(404, {"error": "not found"})
        if not os.path.isfile(p):
            return self._send(404, {"error": "not found"})
        with open(p, "rb") as handle:
            raw = handle.read()
        return self._send(200, raw, ctype)

    def _page(self, name):
        """真实页面原样回源；仅登录者在 </body> 前注入编辑层。"""
        with open(os.path.join(SITE, name), "rb") as handle:
            raw = handle.read()
        if self._user():
            raw = raw.replace(b"</body>", INJECT + b"</body>", 1)
        return self._send(200, raw, "text/html")

    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index", "/index.html"):
            return self._page("index.html")
        if path in ("/games", "/games.html"):
            return self._page("games.html")
        if path in ("/baibao", "/baibao.html"):
            return self._file("baibao.html", "text/html")
        if path in ("/codex", "/codex.html"):
            return self._file("codex.html", "text/html")
        if path == "/login":
            if self._user():
                return self._redirect("/")
            return self._send(200, LOGIN.encode(), "text/html")
        if path == "/style.css":
            return self._file("style.css", "text/css")
        if path == "/interactions.js":
            return self._file("interactions.js", "application/javascript")
        if path == "/baibao.css":
            return self._file("baibao.css", "text/css")
        if path == "/baibao.js":
            return self._file("baibao.js", "application/javascript")
        if path == "/data/questions.json":
            return self._file(os.path.join("data", "questions.json"))
        if path == "/data/mcps.json":
            return self._file(os.path.join("data", "mcps.json"))
        if path.startswith("/assets/posts/"):
            relative = path.lstrip("/")
            if not _POST_IMAGE_RE.fullmatch(relative):
                return self._send(404, {"error": "not found"})
            return self._file(relative, mimetypes.guess_type(relative)[0] or "application/octet-stream")
        if path in ("/admin/edit.js", "/admin/edit.css"):
            if not self._user():
                return self._send(401, {"error": "未登录"})
            name = path.rsplit("/", 1)[1]
            ctype = "application/javascript" if name.endswith(".js") else "text/css"
            return self._file(os.path.join("admin", name), ctype)
        if path == "/api/me":
            session = self._session()
            if not session:
                return self._send(401, {"error": "未登录"})
            info = USERS[session["user"]]
            return self._send(200, {
                "name": info["name"],
                "role": info["role"],
                "csrf": session["csrf"],
                "publish_enabled": PUBLISH_ENABLED,
            })
        if path == "/api/questions":
            if not self._user():
                return self._send(401, {"error": "未登录"})
            with open(DATA, encoding="utf-8") as handle:
                questions = json.load(handle)
            return self._send(200, questions)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/api/login":
            try:
                b = self._body()
            except ValueError as exc:
                return self._send(400, {"error": str(exc)})
            username = str(b.get("user", "")).strip().lower()
            username_valid = bool(re.fullmatch(r"[a-z][a-z0-9_-]{1,31}", username))
            user_record = USERS.get(username) if username_valid else None
            limiter_username = username if user_record else "<unknown>"
            limiter_key = (str(self.client_address[0]), limiter_username)
            retry_after = LOGIN_LIMITER.retry_after(limiter_key)
            if retry_after:
                return self._send(
                    429,
                    {"error": "登录尝试过多，请稍后再试"},
                    headers={"retry-after": retry_after},
                )
            password_record = (
                user_record.get("password_hash") if user_record else DUMMY_PASSWORD_RECORD
            )
            password_candidate = b.get("pass") if isinstance(b.get("pass"), str) else ""
            password_ok = verify_password(password_candidate, password_record)
            if not user_record or not password_ok:
                blocked_for = LOGIN_LIMITER.failure(limiter_key)
                if blocked_for:
                    return self._send(
                        429,
                        {"error": "登录尝试过多，请稍后再试"},
                        headers={"retry-after": blocked_for},
                    )
                return self._send(401, {"error": "账号或密码不对"})
            LOGIN_LIMITER.success(limiter_key)
            token, session = TOKENS.issue(username)
            return self._send(
                200,
                {
                    "name": user_record["name"],
                    "role": user_record["role"],
                    "csrf": session["csrf"],
                    "publish_enabled": PUBLISH_ENABLED,
                },
                cookie=self._session_cookie(token),
            )
        session = self._session()
        if not session:
            return self._send(401, {"error": "未登录"})
        if not self._csrf_valid(session):
            return self._send(403, {"error": "请求校验失败"})
        user = session["user"]
        if self.path == "/api/logout":
            TOKENS.revoke(self._token_value())
            return self._send(200, {"ok": True}, cookie=self._session_cookie("", max_age=0))
        if self.path == "/api/questions":
            try:
                body = self._body(MAX_SAVE_REQUEST_BYTES)
                questions, archived = save_questions(body.get("questions"))
            except ValueError as exc:
                return self._send(400, {"error": str(exc)})
            except Exception:
                return self._send(500, {"error": "保存失败，原稿未改动"})
            return self._send(200, {
                "ok": True,
                "count": len(questions),
                "questions": questions,
                "archived_images": archived,
            })
        if self.path == "/api/publish":
            return self._send(503, {"error": "发布功能暂时锁住，等待安全发布链完成"})
        return self._send(404, {"error": "not found"})


if __name__ == "__main__":
    try:
        load_runtime_auth()
    except AuthConfigError as exc:
        raise SystemExit(f"auth configuration refused: {exc}")
    ThreadingHTTPServer((BIND_HOST, PORT), H).serve_forever()
