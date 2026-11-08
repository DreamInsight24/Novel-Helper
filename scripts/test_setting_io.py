#!/usr/bin/env python3
"""Member A regression: import/export HTTP roundtrip in an isolated two-novel library."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))


class SettingIOTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = tempfile.TemporaryDirectory(prefix='novelhelper_setting_io_')
        os.environ['NOVELHELPER_HOME'] = cls.runtime.name
        os.environ['NOVELHELPER_DATA'] = str(Path(cls.runtime.name) / 'data')
        from novelhelper import store, server, project, context, ai
        cls.store, cls.project, cls.context, cls.ai = store, project, context, ai
        store.ensure_dirs()
        cls.httpd = server.serve(host='127.0.0.1', port=0)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.httpd.server_address[1])

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        cls.runtime.cleanup()

    def request(self, path, body=None, status=200):
        req = Request(self.base + path, data=None if body is None else json.dumps(body).encode(),
                      headers={'Content-Type': 'application/json'})
        try:
            response = urlopen(req, timeout=15)
        except HTTPError as exc:
            response = exc
        with response:
            self.assertEqual(response.status, status)
            return json.load(response)

    def setUp(self):
        self.novel = self.request('/api/novels', {'title': self.id()}, status=201)['novel']['id']
        self.request('/api/novels/open', {'id': self.novel})

    def upload(self, filename, content, directory='import'):
        return self.request('/api/io/save', {'directory': directory, 'filename': filename,
                                             'novel_id': self.novel, 'content': content})

    def test_text_variants_and_fresh_sources(self):
        for filename, text, count in [('head.md', '## 人物\n描述', 1), ('plain.MD', '正文', 1),
                                      ('plain.TXT', '文本', 1), ('title.txt', '## 标题\n内容', 1),
                                      ('empty.md', '', 0), ('empty.TXT', '  \n', 0)]:
            with self.subTest(filename=filename):
                uploaded = self.upload(filename, text)
                self.assertTrue(any(f['path'] == uploaded['path'] for f in uploaded['sources']))
                loaded = self.request('/api/file?' + urlencode({'path': uploaded['path']}))
                self.assertEqual(loaded['content'], text)
                result = self.request('/api/import', {'source': uploaded['path'], 'kind': 'md',
                                                      'target': 'other', 'novel_id': self.novel})
                records = result['collections']['other']['items']
                self.assertEqual(len([r for r in records if r.get('source') == uploaded['path']]), count)
        external = self.store.io_in() / 'fresh.Md'
        external.write_text('new content')
        fresh = self.request('/api/workspace/files')
        self.assertTrue(any(f['name'] == 'fresh.Md' for f in fresh['sources']))
        external.unlink()
        self.assertFalse(any(f['name'] == 'fresh.Md' for f in self.request('/api/workspace/files')['sources']))

    def test_json_roundtrip_numbering_and_novel_isolation(self):
        source = self.upload('original.json', json.dumps([{'name': 'Hero', 'summary': 'Summary',
            'content': 'Supplement', 'notes': 'Notes', 'elements': [{'key': 'Age', 'value': '22'}]}]))['path']
        self.request('/api/import', {'source': source, 'kind': 'json', 'target': 'characters'})
        exported = self.request('/api/export', {'collection': 'characters', 'format': 'json'})
        again = self.request('/api/export', {'collection': 'characters', 'format': 'json'})
        self.assertNotEqual(exported['path'], again['path'])
        payload = self.request('/api/file?' + urlencode({'path': exported['rel']}))['content']
        second = self.request('/api/novels', {'title': 'Novel B'}, status=201)['novel']['id']
        self.request('/api/novels/open', {'id': second})
        files = self.request('/api/workspace/files')
        self.assertEqual(files['sources'], [])
        self.assertEqual(files['exports']['files'], [])
        self.assertEqual(self.request('/api/state')['collections']['characters']['items'], [])
        for endpoint, body in [('/api/file?' + urlencode({'path': source}), None),
                               ('/api/import', {'kind': 'json', 'source': source, 'target': 'characters'}),
                               ('/api/io/save', {'path': source, 'content': 'BAD'})]:
            self.request(endpoint, body, status=403)
        self.request('/api/io/save', {'novel_id': self.novel, 'directory': 'import',
                                     'filename': 'stale.txt', 'content': 'stale'}, status=400)
        self.novel = second
        imported = self.upload('roundtrip.json', payload)['path']
        result = self.request('/api/import', {'kind': 'json', 'source': imported, 'target': 'characters'})
        hero = result['collections']['characters']['items'][0]
        self.assertEqual((hero['name'], hero['summary'], hero['content'], hero['notes']),
                         ('Hero', 'Summary', 'Supplement', 'Notes'))
        self.assertEqual(hero['elements'][0]['value'], '22')
        txt = self.request('/api/export', {'collection': 'characters', 'format': 'txt'})
        text = self.request('/api/file?' + urlencode({'path': txt['rel']}))['content']
        copied = self.upload('roundtrip.txt', text)['path']
        result = self.request('/api/import', {'kind': 'md', 'source': copied, 'target': 'other'})
        self.assertIn('Supplement', result['collections']['other']['items'][0]['content'])

    def test_paths_overwrite_and_atomic_rollback(self):
        for name in ['../escape.txt', '/escape.txt', '..', r'..\escape.txt']:
            self.request('/api/io/save', {'directory': 'import', 'filename': name, 'content': 'x'}, status=400)
        self.request('/api/export', {'collection': 'other', 'filename': '../escape.txt'}, status=403)
        path = Path(self.runtime.name) / 'external.txt'
        path.write_text('original')
        result = self.request('/api/io/export', {'path': str(path), 'content': 'new'})
        self.assertTrue(result['exists'])
        self.assertEqual(path.read_text(), 'original')
        self.request('/api/io/export', {'path': str(path), 'content': 'new', 'overwrite': True})
        self.assertEqual(path.read_text(), 'new')
        self.assertEqual(path.with_name(path.name + '.bak').read_text(), 'original')
        with patch('novelhelper.project._paths.os.replace', side_effect=OSError('injected failure')):
            with self.assertRaises(OSError):
                self.project.write_text(path, 'broken')
        self.assertEqual(path.read_text(), 'new')
        source = self.upload('rollback.md', 'transaction content')['path']
        before = self.store.load('other')
        from novelhelper.store import _repository
        real_write = _repository._write
        failed = False
        def fail_once(name, value):
            nonlocal failed
            if name == 'meta' and not failed:
                failed = True
                raise OSError('injected import failure')
            return real_write(name, value)
        with patch.object(_repository, '_write', side_effect=fail_once):
            self.request('/api/import', {'kind': 'md', 'source': source, 'target': 'other'}, status=500)
        self.assertEqual(self.store.load('other'), before)
        self.assertTrue(list(self.store.io_out().glob('backup_*')))
        self.assertNotEqual(self.store.backup_all(), self.store.backup_all(), 'Repeated backups never overwrite earlier snapshots')

    def test_new_defaults_and_length_model_contract(self):
        sections = self.store.load('sections')['items']
        self.assertEqual([s['key'] for s in sections if s['on']], ['world'])
        self.assertEqual(len([s for s in sections if not s['on']]), 7)
        captured = []
        def fake_chat(config, settings, messages):
            captured.append((settings.copy(), messages))
            return {'text': 'mock output', 'model': settings['model'], 'usage': {}, 'elapsed': 0}
        with patch.object(self.ai, 'chat_settings', side_effect=fake_chat):
            self.request('/api/workstation/run', {'mode_id': 'draft', 'prompt': 'Write',
                'override': {'model': 'chosen-model'}, 'selection': {'length_mode': 'unlimited', 'strict_length': False}})
            self.assertEqual(captured[-1][0]['model'], 'chosen-model')
            self.assertNotIn('8000', captured[-1][1][-1]['content'])
            self.request('/api/workstation/run', {'mode_id': 'draft', 'prompt': 'Write',
                'selection': {'target_chars': 1234, 'strict_length': True}})
            self.assertIn('1234', captured[-1][1][-1]['content'])
        self.assertGreater(self.context._target_chars({'writing': {'target_chars': 8000}}, {}), 0)

    def test_chapter_rename_and_reorder_endpoints(self):
        for name, content in [('001-one', 'one'), ('002-two', 'two'), ('003-three', 'three')]:
            self.request('/api/chapters', {'name': name, 'content': content})
        chapters = self.request('/api/state')['chapters']
        self.assertEqual([item['name'] for item in chapters],
                         ['003-three.txt', '002-two.txt', '001-one.txt'])
        paths = [item['path'] for item in chapters]
        reordered = self.request('/api/chapters/reorder', {'paths': list(reversed(paths))})
        self.assertEqual([item['name'] for item in reordered['chapters']],
                         ['001-one.txt', '002-two.txt', '003-three.txt'])
        renamed = self.request('/api/chapters/rename', {
            'path': paths[2], 'name': '001-renamed'})
        self.assertEqual(renamed['name'], '001-renamed.txt')
        self.assertEqual(renamed['old'], paths[2])
        self.assertEqual([item['name'] for item in renamed['chapters']],
                         ['001-renamed.txt', '002-two.txt', '003-three.txt'])
        renamed_path = Path(renamed['path'])
        if not renamed_path.is_absolute():
            renamed_path = self.store.PROJECT_ROOT / renamed_path
        self.assertEqual(renamed_path.read_text(encoding='utf-8'), 'one')
        self.request('/api/chapters/rename', {'path': paths[1], 'name': '001-renamed'}, status=400)
        self.request('/api/chapters/rename', {'path': paths[1], 'name': '   '}, status=400)


if __name__ == '__main__':
    unittest.main(verbosity=2)
