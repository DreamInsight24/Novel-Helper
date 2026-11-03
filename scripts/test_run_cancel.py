"""AI 工作站"停止生成"：取消端点、提前放锁、结果丢弃。"""
import json as _json, os, sys, tempfile, threading, time, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
with tempfile.TemporaryDirectory(prefix='novelhelper_run_cancel_') as temp:
    os.environ['NOVELHELPER_HOME'] = temp
    os.environ['NOVELHELPER_DATA'] = str(Path(temp) / 'data')

    from novelhelper import ai as ai_mod, history, server as server_mod, store
    from novelhelper.server._state import _RUN_STATE, begin_run, finish_run

    store.save('config', store.default_config())
    novel = store.create_novel('Cancel test')
    store.open_novel(novel['id'])

    # 让上游"很慢"：这样才能在生成过程中点停止。
    started = threading.Event()

    def fake_chat(config, settings, messages):
        started.set()
        time.sleep(1.2)
        return {'text': 'late result', 'usage': {}, 'elapsed': 1.2, 'model': 'mock'}

    ai_mod.chat_settings = fake_chat

    httpd = server_mod.serve(host='127.0.0.1', port=0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = 'http://127.0.0.1:' + str(httpd.server_address[1])

    def post(path, body, timeout=20):
        req = urllib.request.Request(base + path, data=_json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.status, _json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            return exc.code, _json.loads(exc.read().decode('utf-8'))

    def get(path):
        with urllib.request.urlopen(base + path, timeout=20) as response:
            return _json.loads(response.read().decode('utf-8'))

    # 没有生成时取消：ok 但 cancelled=false，不能报错。
    status, body = post('/api/workstation/cancel', {})
    assert status == 200 and body['ok'] and body['cancelled'] is False, body
    print('[PASS] 空闲时取消不报错')

    sessions_before = len(history.list_sessions())
    run_result = {}

    def run():
        run_result['value'] = post('/api/workstation/run', {
            'surface': 'workstation', 'mode_id': '', 'prompt': 'write a scene'
        })

    worker = threading.Thread(target=run)
    worker.start()
    assert started.wait(5), '生成没有开始'
    assert get('/api/workstation/status')['busy'] is True
    print('[PASS] 生成中 status.busy=true')

    # 1) 取消立刻生效：busy 归 False，锁被放开。
    status, body = post('/api/workstation/cancel', {})
    assert status == 200 and body['cancelled'] is True, body
    assert get('/api/workstation/status')['busy'] is False
    slot = begin_run(mode='probe', surface='probe', started='now')
    assert slot is not None, '取消后必须能立刻抢占生成槽位'
    finish_run(slot)
    print('[PASS] 取消后 busy=false 且生成槽位已释放')

    worker.join(10)
    code, value = run_result['value']
    assert value.get('cancelled') is True, value
    assert not value.get('ok'), value
    print('[PASS] 被取消的请求返回 cancelled=true')

    # 2) 结果被丢弃：不写历史、不覆盖 state。
    time.sleep(0.4)
    assert len(history.list_sessions()) == sessions_before, '取消后不应创建会话'
    assert store.load('state').get('workstation', {}).get('output', '') != 'late result'
    print('[PASS] 取消后不写历史、不覆盖最近输出')

    # 3) 取消之后可以马上重新发起（上一轮已放开锁）。
    second = {}
    started.clear()

    def run_again():
        second['value'] = post('/api/workstation/run', {
            'surface': 'workstation', 'mode_id': '', 'prompt': 'second scene'
        })

    again = threading.Thread(target=run_again)
    again.start()
    again.join(20)
    code, value = second['value']
    assert code == 200 and value.get('ok') is True, value
    assert len(history.list_sessions()) == sessions_before + 1
    print('[PASS] 取消后可立即重新生成并正常入库')

    httpd.shutdown()
    print('AI 工作站取消测试通过。')
