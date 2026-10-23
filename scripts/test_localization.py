"""Run with python scripts/test_localization.py; uses only isolated catalogs."""
from __future__ import annotations

import ast
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from novelhelper import localization as loc


class LocalizationTests(unittest.TestCase):
    def setUp(self):
        loc.initialize()
        self.temp = tempfile.TemporaryDirectory(prefix="nh_catalog_")
        self.root = Path(self.temp.name)
        self.config = {"default": "zh-CN", "fallback": "zh-CN", "languages": [
            {"id": "zh-CN", "name": "简体中文"}, {"id": "en-US", "name": "English"}]}

    def tearDown(self):
        loc.initialize()
        self.temp.cleanup()

    def fixture(self, zh=None, en=None):
        (self.root / "languages.json").write_text(json.dumps(self.config), encoding="utf-8")
        # JSON is also valid YAML; exercise nested YAML keys in the loader.
        for lang, data in [("zh-CN", zh or {"test": {"hello": "你好 {name}"}}),
                           ("en-US", en or {"test": {"hello": "Hello {name}"}})]:
            (self.root / f"{lang}.yml").write_text(json.dumps(data), encoding="utf-8")
        loc.initialize(self.root)

    def test_catalog_alignment(self):
        loc.validate_translations()
        self.assertGreater(len(loc.get_translations("en-US")), 700)

    def test_switch_and_interpolation(self):
        self.fixture()
        self.assertEqual(loc.t("test.hello", name="小明"), "你好 小明")
        loc.set_language("en-US")
        self.assertEqual(loc.t("test.hello", name="Sam"), "Hello Sam")
        self.assertEqual(loc.t("test.hello"), "Hello {name}")

    def test_unknown_language_warns_and_falls_back(self):
        self.fixture()
        with self.assertLogs(level="WARNING") as logs:
            loc.set_language("missing")
        self.assertEqual(loc.get_language(), "zh-CN")
        self.assertIn("missing", " ".join(logs.output))

    def test_missing_key_fallback_and_missing_both(self):
        self.fixture(zh={"only": "回退"}, en={"other": "Other"})
        loc.set_language("en-US")
        with self.assertLogs(level="WARNING") as logs:
            self.assertEqual(loc.t("only"), "回退")
            self.assertEqual(loc.t("missing"), "missing")
            self.assertEqual(loc.get_translations("en-US")["only"], "回退")
        self.assertIn("en-US", " ".join(logs.output))
        self.assertIn("missing", " ".join(logs.output))

    def test_copies_are_detached(self):
        loc.get_translations("en-US")["common.save"] = "broken"
        loc.get_languages()["languages"].clear()
        self.assertEqual(loc.get_translations("en-US")["common.save"], "Save")
        self.assertEqual(len(loc.get_languages()["languages"]), 2)

    def test_key_and_placeholder_validation(self):
        self.fixture(zh={"one": "{name}"}, en={"two": "{name}"})
        with self.assertRaisesRegex(ValueError, "keys differ"):
            loc.validate_translations()
        self.fixture(zh={"one": "{name}"}, en={"one": "{other}"})
        with self.assertRaisesRegex(ValueError, "placeholders differ"):
            loc.validate_translations()

    def test_invalid_configuration(self):
        for content in ["{", "{}", "[]"]:
            (self.root / "languages.json").write_text(content, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Invalid localization resources"):
                loc.initialize(self.root)
        self.assertEqual(loc.get_language(), "zh-CN")

    def test_missing_catalog_and_invalid_yaml(self):
        self.fixture()
        (self.root / "en-US.yml").unlink()
        with self.assertRaisesRegex(ValueError, "en-US.yml"):
            loc.initialize(self.root)
        (self.root / "en-US.yml").write_text("bad: [", encoding="utf-8")
        with self.assertRaises(ValueError):
            loc.initialize(self.root)

    def test_default_fallback_and_path_validation(self):
        self.config["fallback"] = "xx"
        with self.assertRaisesRegex(ValueError, "must be listed"):
            self.fixture()
        self.config["languages"][1]["id"] = "../escape"
        with self.assertRaisesRegex(ValueError, "Invalid language ID"):
            self.fixture()

    def test_literal_json_braces(self):
        self.fixture(zh={"json": '{"items": [...]}; {name}'}, en={"json": '{"items": [...]}; {name}'})
        self.assertEqual(loc.t("json", name="x"), '{"items": [...]}; x')

    def test_add_language_without_code_changes(self):
        self.fixture()
        self.config["languages"].append({"id": "fr-FR", "name": "Français"})
        (self.root / "fr-FR.yml").write_text('test:\n  hello: "Bonjour {name}"\n', encoding="utf-8")
        self.fixture()
        loc.validate_translations()
        loc.set_language("fr-FR")
        self.assertEqual(loc.t("test.hello", name="Sam"), "Bonjour Sam")
        self.assertEqual(len(loc.get_languages()["languages"]), 3)

    def test_request_language_isolation(self):
        self.fixture()
        def lookup(lang):
            with loc.language_context(lang):
                return loc.t("test.hello", name="Sam")
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lookup, ["en-US", "zh-CN"] * 20))
        self.assertEqual(results, ["Hello Sam", "你好 Sam"] * 20)
        self.assertEqual(loc.get_language(), "zh-CN")
        with self.assertRaises(RuntimeError):
            with loc.language_context("en-US"):
                raise RuntimeError()
        self.assertEqual(loc.get_language(), "zh-CN")

    def test_frozen_resource_root(self):
        shutil.copytree(ROOT / "app/resources/localization", self.root / "resources/localization")
        with patch.object(sys, "_MEIPASS", str(self.root), create=True):
            loc.initialize()
            loc.validate_translations()
            self.assertEqual(loc.get_translations("en-US")["common.save"], "Save")

    def test_static_references_and_python_parameters(self):
        catalog = loc.get_translations("en-US")
        for path in (ROOT / "app/novelhelper").rglob("*"):
            if path.suffix not in (".py", ".js", ".html"):
                continue
            source = path.read_text(encoding="utf-8")
            for key in re.findall(r'''(?:\bt\(\s*['"]|data-i18n=["'])([a-z][a-z0-9_.]+)['"]''', source):
                if not key.endswith("_"):
                    self.assertIn(key, catalog, f"{path}: {key}")
            if path.suffix == ".py":
                for node in ast.walk(ast.parse(source)):
                    if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "t"):
                        continue
                    key = node.args[0].value if node.args and isinstance(node.args[0], ast.Constant) else None
                    if key in catalog:
                        names = set(re.findall(r"\{([a-z][a-z0-9_]*)\}", catalog[key]))
                        self.assertTrue(names <= {kw.arg for kw in node.keywords}, f"{path}:{node.lineno}: {key}")

    def test_provider_ui_does_not_mutate_prompts(self):
        from novelhelper import providers
        original = providers.provider_note({})
        loc.set_language("en-US")
        public = providers.public_providers()
        self.assertIn("Using", public[0]["prompt_note"])
        self.assertEqual(providers.provider_note({}), original)
        self.assertIn("当前", providers.PROVIDERS[0]["prompt_note"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
