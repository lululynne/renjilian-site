"""Authentication primitives for the local renji.love editor.

No production credential belongs in this module. Runtime users are loaded from
an owner-only JSON file outside the repository, and passwords are compared as
salted scrypt records.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import stat
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any


AUTH_FILE_VERSION = 1
AUTH_FILE_MAX_BYTES = 64 * 1024
DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
MIN_SESSION_TTL_SECONDS = 15 * 60
MAX_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
SCRYPT_N = 1 << 14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
USERNAME_RE = re.compile(r"^[a-z][a-z0-9_-]{1,31}$")
GENERATION_RE = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


class AuthConfigError(RuntimeError):
    """A fail-closed runtime authentication configuration error."""


def _b64decode(value: str) -> bytes:
    try:
        return base64.b64decode(value.encode("ascii"), validate=True)
    except Exception as exc:
        raise ValueError("invalid base64") from exc


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    if not isinstance(password, str) or not (12 <= len(password) <= 1024):
        raise ValueError("password length out of range")
    salt = salt if salt is not None else os.urandom(16)
    if not isinstance(salt, bytes) or not (16 <= len(salt) <= 64):
        raise ValueError("salt length out of range")
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return "$".join(
        (
            "scrypt",
            str(SCRYPT_N),
            str(SCRYPT_R),
            str(SCRYPT_P),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        )
    )


def _parse_password_record(record: object) -> tuple[int, int, int, bytes, bytes]:
    if not isinstance(record, str):
        raise ValueError("password record must be text")
    algorithm, n_text, r_text, p_text, salt_text, digest_text = record.split("$")
    if algorithm != "scrypt":
        raise ValueError("unsupported password algorithm")
    n_value, r_value, p_value = int(n_text), int(r_text), int(p_text)
    if (
        n_value < SCRYPT_N
        or n_value > (1 << 18)
        or n_value & (n_value - 1)
        or not (1 <= r_value <= 16)
        or not (1 <= p_value <= 8)
    ):
        raise ValueError("password work factor out of range")
    salt = _b64decode(salt_text)
    expected = _b64decode(digest_text)
    if not (16 <= len(salt) <= 64) or not (16 <= len(expected) <= 64):
        raise ValueError("password record length out of range")
    return n_value, r_value, p_value, salt, expected


def verify_password(password: object, record: object) -> bool:
    if not isinstance(password, str) or len(password) > 1024 or not isinstance(record, str):
        return False
    try:
        n_value, r_value, p_value, salt, expected = _parse_password_record(record)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n_value,
            r=r_value,
            p=p_value,
            dklen=len(expected),
        )
    except (TypeError, ValueError, OverflowError, MemoryError):
        return False
    return secrets.compare_digest(actual, expected)


# Unknown accounts still execute one real scrypt comparison. This record is a
# non-secret test value and never authenticates an account.
DUMMY_PASSWORD_RECORD = hash_password(
    "not-a-real-renjilian-password", salt=b"renjilian-dummy!"
)


def _strict_auth_payload(payload: object) -> tuple[dict[str, dict[str, str]], str]:
    if not isinstance(payload, dict) or payload.get("version") != AUTH_FILE_VERSION:
        raise AuthConfigError("unsupported auth file")
    if set(payload) != {"version", "generation", "users"}:
        raise AuthConfigError("invalid auth file fields")
    generation = payload.get("generation")
    if not isinstance(generation, str) or not GENERATION_RE.fullmatch(generation):
        raise AuthConfigError("invalid auth generation")
    raw_users = payload.get("users")
    if not isinstance(raw_users, dict) or not raw_users:
        raise AuthConfigError("auth users missing")
    users: dict[str, dict[str, str]] = {}
    for raw_username, raw_record in raw_users.items():
        username = str(raw_username).lower()
        if username != raw_username or not USERNAME_RE.fullmatch(username):
            raise AuthConfigError("invalid auth username")
        if not isinstance(raw_record, dict):
            raise AuthConfigError("invalid auth user record")
        forbidden = {"pass", "password", "plaintext", "secret"} & set(raw_record)
        if forbidden or set(raw_record) != {"name", "role", "password_hash"}:
            raise AuthConfigError("invalid auth user fields")
        name, role, password_record = (
            raw_record.get("name"),
            raw_record.get("role"),
            raw_record.get("password_hash"),
        )
        if not isinstance(name, str) or not name.strip() or len(name) > 80:
            raise AuthConfigError("invalid auth display name")
        if not isinstance(role, str) or not role.strip() or len(role) > 80:
            raise AuthConfigError("invalid auth role")
        try:
            _parse_password_record(password_record)
        except ValueError as exc:
            raise AuthConfigError("invalid password record") from exc
        users[username] = {
            "name": name.strip(),
            "role": role.strip(),
            "password_hash": password_record,
        }
    return users, generation


def load_auth_file(path_value: object) -> tuple[dict[str, dict[str, str]], str]:
    if not isinstance(path_value, str) or not path_value or not os.path.isabs(path_value):
        raise AuthConfigError("RENJILIAN_AUTH_FILE must be an absolute path")
    path = Path(path_value)
    try:
        pre = os.lstat(path)
    except OSError as exc:
        raise AuthConfigError("auth file unavailable") from exc
    if stat.S_ISLNK(pre.st_mode) or not stat.S_ISREG(pre.st_mode):
        raise AuthConfigError("auth file must be a regular non-symlink")
    if pre.st_uid != os.getuid() or stat.S_IMODE(pre.st_mode) & 0o077:
        raise AuthConfigError("auth file ownership or mode is unsafe")
    if pre.st_size <= 0 or pre.st_size > AUTH_FILE_MAX_BYTES:
        raise AuthConfigError("auth file size is unsafe")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as handle:
            current = os.fstat(handle.fileno())
            if (
                not stat.S_ISREG(current.st_mode)
                or current.st_dev != pre.st_dev
                or current.st_ino != pre.st_ino
                or current.st_uid != os.getuid()
                or stat.S_IMODE(current.st_mode) & 0o077
                or current.st_size != pre.st_size
            ):
                raise AuthConfigError("auth file changed during open")
            raw = handle.read(AUTH_FILE_MAX_BYTES + 1)
    except AuthConfigError:
        raise
    except OSError as exc:
        raise AuthConfigError("auth file read failed") from exc
    if len(raw) > AUTH_FILE_MAX_BYTES:
        raise AuthConfigError("auth file size is unsafe")
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuthConfigError("auth file JSON is invalid") from exc
    return _strict_auth_payload(payload)


def session_ttl_seconds(value: object = None) -> int:
    if value in (None, ""):
        return DEFAULT_SESSION_TTL_SECONDS
    try:
        ttl = int(value)
    except (TypeError, ValueError) as exc:
        raise AuthConfigError("invalid session TTL") from exc
    if not (MIN_SESSION_TTL_SECONDS <= ttl <= MAX_SESSION_TTL_SECONDS):
        raise AuthConfigError("session TTL out of range")
    return ttl


class SessionStore:
    def __init__(self, generation: str = "fixture-generation", ttl_seconds: int | None = None):
        self._lock = threading.Lock()
        self._items: dict[str, dict[str, Any]] = {}
        self.generation = generation
        self.ttl_seconds = session_ttl_seconds(ttl_seconds)

    def reset(self, generation: str, ttl_seconds: int | None = None) -> None:
        if not isinstance(generation, str) or not generation:
            raise ValueError("generation required")
        with self._lock:
            self._items.clear()
            self.generation = generation
            self.ttl_seconds = session_ttl_seconds(ttl_seconds)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def issue(self, username: str, *, now: float | None = None) -> tuple[str, dict[str, Any]]:
        timestamp = time.time() if now is None else float(now)
        token = secrets.token_urlsafe(32)
        session = {
            "user": username,
            "issued_at": timestamp,
            "expires_at": timestamp + self.ttl_seconds,
            "csrf": secrets.token_urlsafe(32),
            "generation": self.generation,
        }
        with self._lock:
            self._items[token] = session
        return token, dict(session)

    def get(self, token: object, *, now: float | None = None) -> dict[str, Any] | None:
        if not isinstance(token, str) or not token:
            return None
        timestamp = time.time() if now is None else float(now)
        with self._lock:
            session = self._items.get(token)
            if not session:
                return None
            if session.get("generation") != self.generation or session.get("expires_at", 0) <= timestamp:
                self._items.pop(token, None)
                return None
            return dict(session)

    def revoke(self, token: object) -> None:
        if isinstance(token, str):
            with self._lock:
                self._items.pop(token, None)


class LoginLimiter:
    def __init__(self, *, attempts: int = 5, window_seconds: int = 600, block_seconds: int = 900):
        self.attempts = attempts
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self._failures: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._blocked_until: dict[tuple[str, str], float] = {}
        self._lock = threading.Lock()

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()
            self._blocked_until.clear()

    def retry_after(self, key: tuple[str, str], *, now: float | None = None) -> int:
        timestamp = time.time() if now is None else float(now)
        with self._lock:
            until = self._blocked_until.get(key, 0)
            if until <= timestamp:
                self._blocked_until.pop(key, None)
                return 0
            return max(1, int(until - timestamp + 0.999))

    def failure(self, key: tuple[str, str], *, now: float | None = None) -> int:
        timestamp = time.time() if now is None else float(now)
        with self._lock:
            failures = self._failures[key]
            threshold = timestamp - self.window_seconds
            while failures and failures[0] < threshold:
                failures.popleft()
            failures.append(timestamp)
            if len(failures) >= self.attempts:
                until = timestamp + self.block_seconds
                self._blocked_until[key] = until
                failures.clear()
                return self.block_seconds
            return 0

    def success(self, key: tuple[str, str]) -> None:
        with self._lock:
            self._failures.pop(key, None)
            self._blocked_until.pop(key, None)
