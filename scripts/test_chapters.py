#!/usr/bin/env python3
"""Chapter file operations: rename, explicit order, and sidecar isolation."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))


class ChapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = tempfile.TemporaryDirectory(prefix='novelhelper_chapters_')
        os.environ['NOVELHELPER_HOME'] = cls.runtime.name
        os.environ['NOVELHELPER_DATA'] = str(Path(cls.runtime.name) / 'data')
        from novelhelper import store, project
        cls.store, cls.project = store, project
        store.ensure_dirs()
        novel = store.create_novel('Chapter tests')
        store.set_active_novel(novel['id'])

    @classmethod
    def tearDownClass(cls):
        cls.store.set_active_novel(None)
        cls.runtime.cleanup()

    def setUp(self):
        output = self.store.out_dir()
        for path in output.glob('*'):
            if path.is_file() and path.name != '.chapters.json':
                path.unlink()
        (output / '.chapters.json').unlink(missing_ok=True)
        self.one = self.project.write_chapter('one', '001-one')
        self.two = self.project.write_chapter('two', '002-two')
        self.three = self.project.write_chapter('three', '003-three')

    def names(self):
        return [entry['name'] for entry in self.project.list_chapters()]

    def test_reorder_is_explicit_and_survives_new_chapters(self):
        self.assertEqual(self.names(), ['003-three.txt', '002-two.txt', '001-one.txt'])
        self.project.reorder_chapters([str(self.three), str(self.one), str(self.two)])
        self.assertEqual(self.names(), ['003-three.txt', '001-one.txt', '002-two.txt'])
        # Reading the sidecar again is stable, not another mtime sort.
        self.assertEqual(self.names(), ['003-three.txt', '001-one.txt', '002-two.txt'])
        four = self.project.write_chapter('four', '004-four')
        self.assertEqual(self.names(), ['004-four.txt', '003-three.txt', '001-one.txt', '002-two.txt'])
        self.assertEqual(four.read_text(encoding='utf-8'), 'four')

    def test_rename_keeps_content_and_position(self):
        self.project.reorder_chapters([str(self.three), str(self.one), str(self.two)])
        renamed = self.project.rename_chapter(self.one, '001-first')
        self.assertEqual(renamed.name, '001-first.txt')
        self.assertEqual(renamed.read_text(encoding='utf-8'), 'one')
        self.assertEqual(self.names(), ['003-three.txt', '001-first.txt', '002-two.txt'])
        self.assertFalse(self.one.exists())
        self.assertTrue((self.store.out_dir() / '.chapters.json').is_file())

    def test_rename_rejects_duplicate_and_unsafe_names(self):
        with self.assertRaises(ValueError):
            self.project.rename_chapter(self.one, '002-two')
        with self.assertRaises(ValueError):
            self.project.rename_chapter(self.one, '   ')
        with self.assertRaises(PermissionError):
            self.project.rename_chapter(Path(self.runtime.name) / 'outside.txt', 'escape')
        # Slashes are sanitized rather than traversing outside the chapter folder.
        renamed = self.project.rename_chapter(self.one, '../safe name')
        self.assertEqual(renamed.parent, self.store.out_dir())
        self.assertEqual(renamed.name, '_safe name.txt')

    def test_reorder_ignores_foreign_paths(self):
        outside = Path(self.runtime.name) / 'outside.txt'
        outside.write_text('outside', encoding='utf-8')
        self.project.reorder_chapters([str(outside), str(self.two), str(self.one), str(self.three)])
        self.assertEqual(self.names(), ['002-two.txt', '001-one.txt', '003-three.txt'])
        self.assertEqual(outside.read_text(encoding='utf-8'), 'outside')


if __name__ == '__main__':
    unittest.main()
