# SPDX-License-Identifier: GPL-3.0-or-later
"""Global character-card HTTP, image, backup and novel-deletion isolation tests."""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
with tempfile.TemporaryDirectory(prefix='novelhelper_cards_') as runtime:
    os.environ['NOVELHELPER_HOME'] = runtime
    os.environ['NOVELHELPER_DATA'] = str(Path(runtime) / 'data')
    from novelhelper import cards, context, server, store
    httpd = server.serve(host='127.0.0.1', port=0)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    base = 'http://127.0.0.1:' + str(httpd.server_address[1])
    def request(path, body=None, status=200):
        req = Request(base+path, data=None if body is None else json.dumps(body).encode(),
                      headers={'Content-Type': 'application/json'})
        try: response = urlopen(req, timeout=15)
        except HTTPError as error: response = error
        with response:
            assert response.status == status, (response.status, response.read())
            return json.load(response)
    try:
        assert request('/api/cards')['items'] == []
        assert (store.DATA_DIR/'cards.json').is_file()
        request('/api/cards', {'name': ' '}, 400)
        for endpoint in ('/api/cards', '/api/cards/delete', '/api/cards/image'):
            request(endpoint, [], 400)
        created = request('/api/cards', {'name': 'OC one', 'gender': 'nonbinary', 'role': 'Explorer',
            'age': '200', 'summary': 'Global biography', 'notes': 'Private notes', 'tags': ['oc', 'oc']})['card']
        rid = created['id']
        assert created['tags'] == ['oc']
        assert not (store.DATA_DIR/'novels'/rid).exists()
        assert request('/api/cards', {'id': rid, 'name': 'OC edited'})['card']['role'] == 'Explorer'
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=')
        image = 'data:image/png;base64,' + base64.b64encode(png).decode()
        card = request('/api/cards/image', {'id': rid, 'data_url': image})['card']
        assert len(card['image']) < 80 and not card['image'].startswith('data:')
        with urlopen(base+'/api/cards/images/'+card['image']) as response:
            assert response.headers['Content-Type'] == 'image/png' and response.read() == png
        request('/api/cards/image', {'id': rid, 'data_url': 'data:image/svg+xml;base64,PHN2Zy8+'}, 400)
        request('/api/cards/image', {'id': rid, 'data_url': 'data:image/png;base64,'+'A'*(cards.IMAGE_LIMIT*2)}, 400)
        request('/api/cards/images/no.png', status=404)
        before = cards.list_cards()
        real_atomic = cards._atomic
        def fail_save(path, content):
            if path == store.DATA_DIR/'cards.json': raise OSError('injected card write failure')
            return real_atomic(path, content)
        with patch.object(cards, '_atomic', side_effect=fail_save):
            try: cards.save_card({'id': rid, 'name': 'Must not persist'})
            except OSError: pass
            else: raise AssertionError('Expected save failure')
            images_before = set((store.DATA_DIR/'card_images').iterdir())
            try: cards.save_image(rid, image)
            except OSError: pass
            else: raise AssertionError('Expected image/save failure')
            assert set((store.DATA_DIR/'card_images').iterdir()) == images_before
        assert cards.list_cards() == before
        assert list((store.DATA_DIR/'card_backups').glob('*/cards.json'))
        a = store.create_novel('Novel A'); store.open_novel(a['id'])
        assert cards.list_cards() == before
        assert 'cards' not in store.load_all()
        store.save('characters', {'items': [{'id': 'char', 'name': 'Novel only', 'content': 'Story'}]})
        body = context.build_user_message({}, store.load_all(), {'record_selections': {'characters': ['char']}, 'setting_categories': ['characters']})
        assert 'Global biography' not in body and 'OC edited' not in body
        b = store.create_novel('Novel B'); store.open_novel(b['id'])
        assert cards.list_cards() == before
        def recycle(paths):
            for path in paths:
                assert Path(path).is_relative_to(store.NOVELS_DIR) or Path(path).is_relative_to(store.NOVEL_WORKSPACES_DIR)
                shutil.rmtree(path)
        with patch('novelhelper.store._novels._send_to_recycle_bin', side_effect=recycle):
            request('/api/novels/delete', {'id': a['id'], 'title_confirmation': 'Novel A'})
            request('/api/novels/delete', {'id': b['id'], 'title_confirmation': 'Novel B'})
        assert cards.list_cards() == before and not store.active_novel_id()
        cards.ensure(); assert cards.list_cards() == before
        request('/api/cards/delete', {'id': rid})
        assert request('/api/cards')['items'] == []
        assert (store.DATA_DIR/'card_images'/card['image']).exists(), 'Backups retain their image references'
        print('PASS: global CRUD, image limits/serving, snapshots, failure rollback, no AI context, novel switch/deletion isolation and idempotent initialization')
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join()
