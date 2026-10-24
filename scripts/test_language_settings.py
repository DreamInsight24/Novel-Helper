"""Language persistence tests for task 3.2.

Run with python scripts/test_language_settings.py; uses an isolated temporary
data directory and never touches real user data.
"""
from __future__ import annotations

import json
import os
import socket
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Redirect the store data dir before importing novelhelper (DATA_DIR is read at import).
TEMP_DATA = Path(tempfile.mkdtemp(prefix="nh_language_data_"))
os.environ["NOVELHELPER_DATA"] = str(TEMP_DATA)
sys.path.insert(0, str(ROOT / "app"))

from novelhelper import localization as loc  # noqa: E402
from novelhelper import server, store  # noqa: E402
from novelhelper.server import _language  # noqa: E402


def _config_path() -> Path:
    return TEMP_DATA / "config.json"


def _write_config(payload: str) -> None:
    _config_path().write_text(payload, encoding="utf-8")


def _fresh_config(lang: str | None = None) -> None:
    config = store.default_config()
    if lang is not None:
        config["language"] = lang
    store.save("config", config)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class LanguagePersistenceTests(unittest.TestCase):
    def setUp(self):
        loc.initialize()
        for leftover in TEMP_DATA.glob("config.json*"):
            leftover.unlink()

    def tearDown(self):
        loc.initialize()
        for leftover in TEMP_DATA.glob("config.json*"):
            leftover.unlink()

    def test_first_run_without_config(self):
        self.assertTrue(_language.first_run())

    def test_not_first_run_after_save(self):
        saved = _language.save_language("en-US")
        self.assertEqual(saved, "en-US")
        self.assertFalse(_language.first_run())
        self.assertEqual(loc.get_language(), "en-US")
        on_disk = json.loads(_config_path().read_text(encoding="utf-8"))
        self.assertEqual(on_disk.get("language"), "en-US")

    def test_save_unknown_language_falls_back(self):
        saved = _language.save_language("xx-XX")
        self.assertEqual(saved, "zh-CN")
        on_disk = json.loads(_config_path().read_text(encoding="utf-8"))
        self.assertEqual(on_disk.get("language"), "zh-CN")

    def test_damaged_config_is_first_run_and_backed_up(self):
        _write_config("{ not valid json")
        self.assertTrue(_language.first_run())
        backups = list(TEMP_DATA.glob("config.json.bak-*"))
        self.assertEqual(len(backups), 1, "damaged config must be backed up once")
        self.assertFalse(_config_path().exists())
        self.assertEqual(store.load("config")["version"], store.default_config()["version"])

    def test_damaged_config_recovers_on_save(self):
        _write_config("{ not valid json")
        saved = _language.save_language("en-US")
        self.assertEqual(saved, "en-US")
        on_disk = json.loads(_config_path().read_text(encoding="utf-8"))
        self.assertEqual(on_disk.get("language"), "en-US")

    def test_non_object_config_is_damaged(self):
        _write_config("[]")
        self.assertTrue(_language.first_run())
        self.assertEqual(len(list(TEMP_DATA.glob("config.json.bak-*"))), 1)

    def test_startup_applies_persisted_language(self):
        _fresh_config("en-US")
        loc.set_language("zh-CN")
        _language.apply_persisted_language()
        self.assertEqual(loc.get_language(), "en-US")

    def test_startup_without_persisted_language_keeps_default(self):
        _fresh_config(None)
        loc.set_language("en-US")
        _language.apply_persisted_language()
        self.assertEqual(loc.get_language(), "en-US")

    def test_unknown_persisted_language_falls_back(self):
        _fresh_config("xx-XX")
        self.assertEqual(_language.load_persisted_language(), "zh-CN")

    def test_switch_does_not_disturb_request_context(self):
        with loc.language_context("en-US"):
            loc.set_language("zh-CN")
            self.assertEqual(loc.t("common.save"), "Save")
        self.assertEqual(loc.t("common.save"), "保存")

    def test_http_switch_endpoint_and_first_run_flag(self):
        httpd = server.serve("127.0.0.1", _free_port())
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{httpd.server_address[1]}"
        try:
            def request(path, payload=None):
                data = None
                if payload is not None:
                    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                req = urllib.request.Request(base + path, data=data,
                                             headers={"Content-Type": "application/json"})
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                with opener.open(req, timeout=5) as response:
                    return json.loads(response.read().decode("utf-8"))

            info = request("/api/i18n")
            self.assertTrue(info["first_run"], "fresh runtime must report first run")

            switched = request("/api/settings/language", {"language": "en-US"})
            self.assertTrue(switched["ok"])
            self.assertEqual(switched["language"], "en-US")

            info = request("/api/i18n")
            self.assertEqual(info["current"], "en-US")
            self.assertFalse(info["first_run"])

            try:
                request("/api/settings/language", {"language": ""})
                self.fail("empty language must be rejected")
            except urllib.error.HTTPError as exc:
                self.assertEqual(exc.code, 400)
                self.assertIn("error", json.loads(exc.read().decode("utf-8")))
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    raise SystemExit(unittest.main(verbosity=2))
