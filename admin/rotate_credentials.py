#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Generate renji.love editor credentials without printing secret values.

R2A only installs and tests this source. A real ``--apply`` invocation is a
separate R2B runtime action.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import os
import secrets
import string
import sys
import time
from pathlib import Path
from typing import Protocol

try:
    from .auth import AUTH_FILE_VERSION, hash_password
except ImportError:  # direct ``python admin/rotate_credentials.py`` execution
    from auth import AUTH_FILE_VERSION, hash_password


REPO_ROOT = Path(__file__).resolve().parents[1]
KEYCHAIN_SERVICE = "renjilian-site"
ACCOUNT_METADATA = {
    "meibao": {"name": "梅宝", "role": "站主"},
    "ajing": {"name": "阿景", "role": "管理员"},
}
PASSWORD_ALPHABET = string.ascii_letters + string.digits + "-_.!@"
ERR_SEC_ITEM_NOT_FOUND = -25300


class Keychain(Protocol):
    def get(self, service: str, account: str) -> str | None: ...
    def set(self, service: str, account: str, password: str) -> None: ...
    def delete(self, service: str, account: str) -> None: ...


class MacOSKeychain:
    """Minimal Security.framework adapter; passwords never enter process argv."""

    def __init__(self) -> None:
        self.security = ctypes.cdll.LoadLibrary(
            "/System/Library/Frameworks/Security.framework/Security"
        )
        self.core = ctypes.cdll.LoadLibrary(
            "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
        )
        self.security.SecKeychainFindGenericPassword.argtypes = [
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_void_p),
        ]
        self.security.SecKeychainFindGenericPassword.restype = ctypes.c_int32
        self.security.SecKeychainAddGenericPassword.argtypes = [
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_char_p,
            ctypes.c_uint32, ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p),
        ]
        self.security.SecKeychainAddGenericPassword.restype = ctypes.c_int32
        self.security.SecKeychainItemModifyContent.argtypes = [
            ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_char_p,
        ]
        self.security.SecKeychainItemModifyContent.restype = ctypes.c_int32
        self.security.SecKeychainItemDelete.argtypes = [ctypes.c_void_p]
        self.security.SecKeychainItemDelete.restype = ctypes.c_int32
        self.security.SecKeychainItemFreeContent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        self.security.SecKeychainItemFreeContent.restype = ctypes.c_int32
        self.core.CFRelease.argtypes = [ctypes.c_void_p]

    @staticmethod
    def _encoded(value: str) -> bytes:
        return value.encode("utf-8")

    def _find(self, service: str, account: str) -> tuple[int, str | None, ctypes.c_void_p]:
        service_bytes, account_bytes = self._encoded(service), self._encoded(account)
        length = ctypes.c_uint32()
        data = ctypes.c_void_p()
        item = ctypes.c_void_p()
        status = self.security.SecKeychainFindGenericPassword(
            None,
            len(service_bytes),
            service_bytes,
            len(account_bytes),
            account_bytes,
            ctypes.byref(length),
            ctypes.byref(data),
            ctypes.byref(item),
        )
        if status == ERR_SEC_ITEM_NOT_FOUND:
            return status, None, item
        if status != 0:
            raise RuntimeError(f"Keychain lookup failed ({status})")
        try:
            password = ctypes.string_at(data, length.value).decode("utf-8")
        finally:
            self.security.SecKeychainItemFreeContent(None, data)
        return status, password, item

    def get(self, service: str, account: str) -> str | None:
        _, password, item = self._find(service, account)
        if item:
            self.core.CFRelease(item)
        return password

    def set(self, service: str, account: str, password: str) -> None:
        status, _, item = self._find(service, account)
        password_bytes = self._encoded(password)
        if status == ERR_SEC_ITEM_NOT_FOUND:
            service_bytes, account_bytes = self._encoded(service), self._encoded(account)
            created_item = ctypes.c_void_p()
            result = self.security.SecKeychainAddGenericPassword(
                None,
                len(service_bytes),
                service_bytes,
                len(account_bytes),
                account_bytes,
                len(password_bytes),
                password_bytes,
                ctypes.byref(created_item),
            )
            if created_item:
                self.core.CFRelease(created_item)
        else:
            result = self.security.SecKeychainItemModifyContent(
                item, None, len(password_bytes), password_bytes
            )
        if item:
            self.core.CFRelease(item)
        if result != 0:
            raise RuntimeError(f"Keychain update failed ({result})")

    def delete(self, service: str, account: str) -> None:
        status, _, item = self._find(service, account)
        if status == ERR_SEC_ITEM_NOT_FOUND:
            return
        result = self.security.SecKeychainItemDelete(item)
        if item:
            self.core.CFRelease(item)
        if result not in (0, ERR_SEC_ITEM_NOT_FOUND):
            raise RuntimeError(f"Keychain delete failed ({result})")


def generate_password(length: int = 24) -> str:
    if length < 20:
        raise ValueError("password length must be at least 20")
    required = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice("-_.!@"),
    ]
    required.extend(secrets.choice(PASSWORD_ALPHABET) for _ in range(length - len(required)))
    secrets.SystemRandom().shuffle(required)
    return "".join(required)


def build_auth_payload(passwords: dict[str, str], generation: str | None = None) -> dict:
    if set(passwords) != set(ACCOUNT_METADATA):
        raise ValueError("exact account set required")
    generation = generation or f"rj-{time.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(4)}"
    return {
        "version": AUTH_FILE_VERSION,
        "generation": generation,
        "users": {
            username: {
                **ACCOUNT_METADATA[username],
                "password_hash": hash_password(passwords[username]),
            }
            for username in sorted(ACCOUNT_METADATA)
        },
    }


def validate_output_path(path: Path) -> Path:
    if not path.is_absolute():
        raise ValueError("output path must be absolute")
    resolved_parent = path.parent.resolve()
    resolved = resolved_parent / path.name
    if resolved == REPO_ROOT or REPO_ROOT in resolved.parents:
        raise ValueError("auth file must stay outside the repository")
    return resolved


def _write_temp(path: Path, payload: dict) -> Path:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)
    temporary = path.parent / f".{path.name}.tmp-{secrets.token_hex(6)}"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return temporary


def rotate(
    output: Path,
    *,
    keychain: Keychain,
    service: str = KEYCHAIN_SERVICE,
    allow_replace: bool = False,
) -> dict[str, object]:
    output = validate_output_path(output)
    if output.exists() and not allow_replace:
        raise FileExistsError("auth file already exists")
    passwords = {username: generate_password() for username in ACCOUNT_METADATA}
    payload = build_auth_payload(passwords)
    temporary = _write_temp(output, payload)
    previous = {username: keychain.get(service, username) for username in ACCOUNT_METADATA}
    updated: list[str] = []
    try:
        for username in sorted(ACCOUNT_METADATA):
            keychain.set(service, username, passwords[username])
            updated.append(username)
        os.replace(temporary, output)
    except Exception:
        temporary.unlink(missing_ok=True)
        for username in reversed(updated):
            old_value = previous[username]
            if old_value is None:
                keychain.delete(service, username)
            else:
                keychain.set(service, username, old_value)
        raise
    finally:
        for username in passwords:
            passwords[username] = ""
    return {
        "generation": payload["generation"],
        "accounts": sorted(ACCOUNT_METADATA),
        "auth_file": str(output),
        "keychain_service": service,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args(argv)
    output = validate_output_path(args.output)
    if not args.apply:
        print(json.dumps({"dry_run": True, "accounts": sorted(ACCOUNT_METADATA), "output": str(output)}))
        return 0
    result = rotate(output, keychain=MacOSKeychain(), allow_replace=args.replace)
    print(json.dumps({**result, "applied": True}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
