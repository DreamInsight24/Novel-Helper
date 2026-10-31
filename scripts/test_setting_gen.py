"""AI 设定生成：目标目录与隐藏提示词单元测试。"""
import os,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
with tempfile.TemporaryDirectory(prefix='novelhelper_setting_gen_') as temp:
    os.environ['NOVELHELPER_HOME']=temp
    os.environ['NOVELHELPER_DATA']=str(Path(temp)/'data')
    from novelhelper import store,setting_gen

    store.save('config',store.default_config())
    novel=store.create_novel('Setting gen test')
    store.open_novel(novel['id'])

    # 叶子路径：层级用 "/" 连接，分组自身不是叶子，关闭元素连同子树丢弃。
    char_paths=setting_gen.leaf_paths(store.schema_for('characters'))
    assert '身份/本名' in char_paths
    assert '外貌/整体/身高' in char_paths
    assert '外貌' not in char_paths
    assert '关系/关系列表' in char_paths
    off_tree=[{'key':'a','children':[{'key':'b'}]},
              {'key':'c','on':False,'children':[{'key':'d'}]},
              {'key':'e'},{'key':'','children':[{'key':'f'}]},{'key':'e'}]
    assert setting_gen.leaf_paths(off_tree)==['a/b','e']

    # 默认目录：四个内置目标 + 显式保留的 section_world，顺序稳定。
    store.save('sections', {'items': [
        {'key': 'world', 'label': '世界设定', 'desc': '', 'on': True},
    ], 'layout_version': 2})
    catalog=setting_gen.target_catalog()
    targets=[entry['target'] for entry in catalog]
    assert targets==list(setting_gen.BUILTIN_TARGETS)+['section_world']
    by_target={entry['target']:entry for entry in catalog}
    assert '身份/本名' in by_target['characters']['fields']
    assert by_target['characters']['label']=='人物档案'
    assert by_target['characters']['hint']
    # 其他设定默认无元素字段，但仍作为可写内容的目标在列。
    assert by_target['other']['fields']==[]

    # 关闭的自定义栏目不在目录；启用后进入，schema 缺失时 fields 为空。
    sections=store.load('sections')
    sections['items'].append({'key':'extra','label':'额外','desc':'测试栏目','on':False})
    store.save('sections',sections)
    assert 'section_extra' not in {e['target'] for e in setting_gen.target_catalog()}
    sections['items'][-1]['on']=True
    store.save('sections',sections)
    extra=next(e for e in setting_gen.target_catalog() if e['target']=='section_extra')
    assert extra['label']=='额外' and extra['hint']=='测试栏目' and extra['fields']==[]
    # 补充 schema 叶子后进入 fields；关闭的叶子不发送。
    schema=store.load('schema')
    schema['section_extra']={'label':'额外','elements':[{'key':'说明'},{'key':'备注','on':False}]}
    store.save('schema',schema)
    extra=next(e for e in setting_gen.target_catalog() if e['target']=='section_extra')
    assert extra['fields']==['说明']

    # 系统消息：固定提示词 + 紧凑目录；同一 db 直接传入不重复读盘。
    db={'sections':store.load('sections'),'schema':store.load('schema')}
    msg=setting_gen.system_message(db)
    assert msg.startswith(setting_gen.SYSTEM_PROMPT)
    assert '"target":"characters"' in msg
    assert '"fields":["身份/本名"' in msg
    assert '身份/本名' not in setting_gen.SYSTEM_PROMPT  # 目录动态拼接，不写死在提示词里
    # 目录里栏目名只出现一次，其余是 target/fields 等结构字段。
    assert msg.count('人物档案')==1

    # 提示词文本不进入翻译表（UI 文案键 setting_gen.* 允许存在）。
    import re as _re
    yml=Path(__file__).resolve().parents[1]/'app'/'resources'/'localization'/'zh-CN.yml'
    content=yml.read_text(encoding='utf-8')
    assert '你是设定抽取助手' not in content
    assert '你是 JSON 修复助手' not in content
    assert '目标栏目目录' not in content

    # ── 第 2 步：解析、校验、映射、去重 ──
    # parse_records：纯 JSON / 围栏 / 根非对象 / 缺 records / 空输入。
    assert setting_gen.parse_records('{"records":[]}')==[]
    assert setting_gen.parse_records('```json\n{"records":[{"target":"items"}]}\n```')==[{'target':'items'}]
    assert setting_gen.parse_records('前缀说明 {"records":[]} 后缀')==[]
    for bad in ('[]','{"foo":[]}','{"records":{}}','',None,'no json here'):
        try:
            setting_gen.parse_records(bad)
            raise AssertionError('bad parse accepted: %r'%(bad,))
        except setting_gen.ParseError:
            pass

    # map_fields：扁平路径按模板顺序还原为树；空值/未命中跳过。
    mapped=setting_gen.map_fields(store.schema_for('characters'),
        {'身份/本名':'林默','外貌/整体/身高':'170cm','身份/性别':''})
    assert mapped[0]['key']=='身份'
    assert mapped[0]['children']==[{'key':'本名','value':'林默'}]
    assert mapped[1]['key']=='外貌'
    assert mapped[1]['children']==[{'key':'整体','children':[{'key':'身高','value':'170cm'}]}]

    # validate_batch：正常路由、元素落位、服务端生成 id/时间。
    sections=store.load('sections')
    sections['items'].append({'key':'closed','label':'已关闭','desc':'','on':False})
    store.save('sections',sections)
    raw_records=[
        {'target':'characters','name':' 林默 ','tag':'主角',
         'fields':{'身份/本名':'林默','身份/性别':'女'},
         'notes':'测试备注','tags':[' 主角 ','群像']},
        {'target':'items','name':'短剑','category':'武器',
         'fields':{'效果/主要效果':'削铁如泥'}},
        {'target':'items','name':'斗篷','slot':'披风','content':'不应保留',
         'fields':{'外观/配色':'深蓝'}},
        {'target':'other','name':'灰潮','content':'每二十年一次的魔力潮汐'},
        {'target':'section_world','name':'灰潮','fields':{'概述':'魔力潮汐'}},
        {'target':'section_unknown','name':'X'},
        {'target':'section_closed','name':'Y'},
        {'target':'factions','name':123},
        {'target':'characters','name':'无内容'},
        {'target':'items','name':'短剑'},
        {'target':'characters','name':' 林默 '},
        {'target':'characters','name':'坏字段',
         'fields':{'身份/不存在':'x','身份/本名':42,'身份/性别':'女'},
         'id':'ai_1','slot':'上衣'},
    ]
    by_target,report=setting_gen.validate_batch(raw_records)
    assert report['total']==len(raw_records)
    assert report['accepted']==6
    assert report['skipped_duplicate']==2        # 批内重名（items 短剑、characters 林默）
    assert report['dropped_unknown_target']==1   # section_unknown 未声明
    assert report['dropped_disabled']==1         # section_closed 已关闭
    assert report['dropped_invalid']==1          # name 非字符串
    assert report['dropped_empty']==1            # 只有名字没有内容
    assert report['dropped_fields']==5           # 物品 content、坏字段 2 个、slot、保留字段 id
    assert set(by_target)=={'characters','items','other','section_world'}
    assert all('target' not in rec for recs in by_target.values() for rec in recs)
    # 条目级明细：added_items 带名字与无效字段数；dropped_items 带名字与原因码。
    added={item['name']:item for item in report['added_items']}
    assert added['林默']['dropped_fields']==0
    assert added['斗篷']['dropped_fields']==1    # content 不支持
    assert added['坏字段']['dropped_fields']==4  # 2 个字段 + slot + 保留字段 id
    drops={(item['reason'],item['name']):item for item in report['dropped_items']}
    assert drops[('unknown_target','X')]['target']=='section_unknown'
    assert drops[('disabled','Y')]['target']=='section_closed'
    assert drops[('invalid','')]['target']=='factions'
    assert drops[('empty','无内容')]['target']=='characters'
    assert drops[('duplicate','短剑')]['target']=='items'
    assert drops[('duplicate','林默')]['target']=='characters'
    records=[rec for recs in by_target.values() for rec in recs]
    by_name={rec['name']:rec for rec in records}
    assert by_name['林默']['tag']=='主角'
    assert by_name['林默']['elements']==[{'key':'身份','children':[
        {'key':'本名','value':'林默'},{'key':'性别','value':'女'}]}]
    assert by_name['林默']['tags']==['主角','群像']
    assert _re.fullmatch(r'ch_[0-9a-f]{8}',by_name['林默']['id'])
    assert by_name['林默']['created']==by_name['林默']['updated']
    assert by_name['短剑']['category']=='武器' and 'content' not in by_name['短剑']
    assert 'content' not in by_name['斗篷']       # 物品不支持 content
    assert by_name['斗篷']['slot']=='披风'
    assert by_name['斗篷']['elements']==[{'key':'外观','children':[{'key':'配色','value':'深蓝'}]}]
    grey=[r for r in records if r['name']=='灰潮']  # 两个目标各一条灰潮
    assert len(grey)==2
    grey_other=next(r for r in grey if r.get('content'))
    grey_world=next(r for r in grey if r.get('elements'))
    assert grey_other['content']=='每二十年一次的魔力潮汐'
    assert grey_world['elements']==[{'key':'概述','value':'魔力潮汐'}]
    bad=next(r for r in records if r['name']=='坏字段')
    assert bad['elements']==[{'key':'身份','children':[{'key':'性别','value':'女'}]}]
    assert bad['id']!='ai_1' and 'slot' not in bad
    # 与已有条目同名默认跳过。
    store.save('characters',{'items':[{'id':'ch_old','name':'已有角色'}]})
    by_target,report=setting_gen.validate_batch([{'target':'characters','name':'已有角色','fields':{'身份/性别':'女'}}])
    assert report['skipped_duplicate']==1 and by_target=={}
    assert report['dropped_items']==[{'target':'characters','name':'已有角色','reason':'duplicate'}]

    # ── 第 3 步：分块与模型调用（mock，不联网）──
    # 按段落分块：小文本单块；多段落按上限聚合且可精确还原。
    small='甲段落。\n\n乙段落。'
    assert setting_gen.split_chunks(small)==[small]
    para=('设定段落。\n'*300).strip()
    text='\n\n'.join([para]*8)                    # 8 段约 14400 字符
    chunks=setting_gen.split_chunks(text)
    assert len(chunks)==2 and max(len(c) for c in chunks)<=setting_gen.MAX_BATCH_CHARS
    assert '\n\n'.join(chunks)==text              # 段落边界不丢内容
    # 超限段落按行拆：每行完整保留、顺序不变、不截断。
    line='一行设定内容ABCDEFGHIJKLMNOPQRSTUVWXYZ\n'
    big='\n'.join([line.strip()]*80)              # 单段超 1000 限制
    chunks=setting_gen.split_chunks(big,limit=1000)
    assert len(chunks)>1
    got=[l for c in chunks for l in c.split('\n') if l.strip()]
    assert got==[line.strip()]*80
    # 单行超限：整行保留为一块，允许溢出。
    huge='很长的设定行'*3000
    chunks=setting_gen.split_chunks(huge,limit=100)
    assert len(chunks)==1 and chunks[0]==huge

    # extract_records：分块调用、合并、指标、修复重试不重发用户文本。
    calls=[]
    responses=[]
    def fake_chat(config,settings,messages):
        calls.append(messages)
        assert settings['temperature']==0.2 and settings['model']==''
        assert settings['max_tokens']==setting_gen.MAX_OUTPUT_TOKENS
        return responses.pop(0)
    config=store.current_config()
    db={'sections':store.load('sections'),'schema':store.load('schema')}
    responses=[{'text':'{"records":[{"target":"items","name":"短剑"}]}','usage':{'total_tokens':10},'elapsed':0.1,'model':'mock'},
               {'text':'```json\n{"records":[{"target":"factions","name":"公会"}]}\n```','usage':{'total_tokens':12},'elapsed':0.2,'model':'mock'}]
    records,metrics,overflow=setting_gen.extract_records(fake_chat,config,db,'甲段。\n\n乙段。',batch_limit=4)
    assert len(records)==2 and not overflow and len(calls)==2
    assert metrics[0]['chunk']==1 and metrics[0]['input_chars']==3  # '甲段。'
    assert metrics[0]['usage']=={'total_tokens':10}
    assert calls[0][0]['content'].startswith(setting_gen.SYSTEM_PROMPT)
    assert '目标栏目目录' in calls[0][0]['content']
    assert calls[0][1]['content']=='甲段。' and calls[1][1]['content']=='乙段。'
    # 修复重试：第一块输出损坏 → 修复请求只带模型输出，不带用户文本。
    calls.clear()
    bad='{"records": [{"target": "items",'
    responses=[{'text':bad,'usage':{},'elapsed':0,'model':'mock'},
               {'text':'{"records":[{"target":"items","name":"修复剑"}]}','usage':{},'elapsed':0,'model':'mock'},
               {'text':'{"records":[{"target":"factions","name":"公会"}]}','usage':{},'elapsed':0,'model':'mock'}]
    records,metrics,overflow=setting_gen.extract_records(fake_chat,config,db,'甲段。\n\n乙段。',batch_limit=4)
    assert len(records)==2 and len(calls)==3
    assert calls[1][0]['content']==setting_gen.REPAIR_PROMPT
    assert calls[1][1]['content']==bad              # 修复输入=模型输出本身
    assert '甲段' not in calls[1][1]['content']      # 用户文本不重发
    # 修复仍失败 → 报错不返回记录。
    calls.clear()
    responses=[{'text':bad,'usage':{},'elapsed':0,'model':'mock'},
               {'text':'still not json','usage':{},'elapsed':0,'model':'mock'}]
    try:
        setting_gen.extract_records(fake_chat,config,db,'甲段。',batch_limit=4)
        raise AssertionError('repair failure accepted')
    except setting_gen.ParseError:
        assert len(calls)==2
    # 空输出 → 直接报错，不发起修复。
    calls.clear()
    responses=[{'text':'','usage':{},'elapsed':0,'model':'mock'}]
    try:
        setting_gen.extract_records(fake_chat,config,db,'甲段。',batch_limit=4)
        raise AssertionError('empty output accepted')
    except setting_gen.ParseError:
        assert len(calls)==1
    # 单次任务条数上限：超出截断并计数。
    old_limit=setting_gen.MAX_TASK_RECORDS
    setting_gen.MAX_TASK_RECORDS=2
    try:
        responses=[{'text':'{"records":['+','.join(
            '{"target":"other","name":"条目%d","content":"内容%d"}'%(i,i) for i in range(5))+']}',
                    'usage':{},'elapsed':0,'model':'mock'}]
        records,metrics,overflow=setting_gen.extract_records(fake_chat,config,db,'甲段。',batch_limit=4)
        assert len(records)==2 and len(overflow)==3
        assert [r.get('name') for r in overflow]==['条目2','条目3','条目4']
    finally:
        setting_gen.MAX_TASK_RECORDS=old_limit

    # ── 第 4 步：事务写入、撤销、HTTP 端点（mock 模型）──
    # write_batch：正常写入；第二次写入失败时回滚全部已写集合。
    by_target,report=setting_gen.validate_batch([
        {'target':'characters','name':'回滚角色','fields':{'身份/性别':'女'}},
        {'target':'items','name':'回滚道具','fields':{'效果/主要效果':'测试'}},
    ])
    assert report['accepted']==2
    written=setting_gen.write_batch(by_target)
    assert written=={'characters':1,'items':1}
    mid_chars=store.load('characters')
    mid_items=store.load('items')
    assert any(r['name']=='回滚角色' for r in mid_chars['items'])
    # 回滚：第二次 save 抛错 → 已写的 characters 恢复到本批写入前。
    real_save=store.save
    save_calls=[0]
    def flaky(name,data):
        save_calls[0]+=1
        if save_calls[0]==2:
            raise OSError('disk full')
        return real_save(name,data)
    store.save=flaky
    try:
        by_target,_=setting_gen.validate_batch([
            {'target':'characters','name':'回滚二','fields':{'身份/性别':'男'}},
            {'target':'items','name':'回滚二道具','fields':{'效果/主要效果':'x'}},
        ])
        try:
            setting_gen.write_batch(by_target)
            raise AssertionError('write failure swallowed')
        except OSError:
            pass
    finally:
        store.save=real_save
    assert store.load('characters')==mid_chars      # 半批数据被回滚
    assert store.load('items')==mid_items
    assert not any(r['name']=='回滚二' for r in store.load('characters')['items'])

    # 撤销：只删本批新增且未修改的记录；一次性；切换小说后失效。
    setting_gen.undo_last_batch()                     # 清掉上面的批次（若有）
    by_target,_=setting_gen.validate_batch([
        {'target':'characters','name':'待撤销','fields':{'身份/性别':'女'}},
        {'target':'items','name':'待撤销道具','fields':{'效果/主要效果':'x'}},
        {'target':'characters','name':'保留者','fields':{'身份/性别':'男'}},
    ])
    setting_gen.write_batch(by_target)
    setting_gen.begin_undo(by_target)
    chars=store.load('characters')
    for rec in chars['items']:
        if rec['name']=='保留者':
            rec['elements']=[{'key':'身份','children':[{'key':'性别','value':'已改'}]}]
            rec['updated']=store.now_str()
    store.save('characters',chars)
    removed,kept=setting_gen.undo_last_batch()
    assert removed==2 and kept==1
    names={r['name'] for r in store.load('characters')['items']}
    assert '待撤销' not in names and '保留者' in names
    item_names={r['name'] for r in store.load('items')['items']}
    assert '待撤销道具' not in item_names and '回滚道具' in item_names
    assert setting_gen.undo_last_batch() is None      # 一次性
    # 切换小说后旧批次失效。
    by_target,_=setting_gen.validate_batch([{'target':'other','name':'A书的','content':'内容'}])
    setting_gen.write_batch(by_target)
    setting_gen.begin_undo(by_target)
    novel_b=store.create_novel('B novel')
    store.open_novel(novel_b['id'])
    assert setting_gen.undo_last_batch() is None
    store.open_novel(novel['id'])
    # 撤销删除失败要抛出，不得静默。
    by_target,_=setting_gen.validate_batch([{'target':'other','name':'撤销失败测试','content':'内容'}])
    setting_gen.write_batch(by_target)
    setting_gen.begin_undo(by_target)
    def always_fail(name,data):
        raise OSError('disk full')
    store.save=always_fail
    try:
        try:
            setting_gen.undo_last_batch()
            raise AssertionError('undo failure swallowed')
        except RuntimeError as exc:
            assert '撤销失败' in str(exc)
    finally:
        store.save=real_save
    setting_gen.undo_last_batch()                     # 收尾清掉残留批次

    # HTTP 端点：生成 / 撤销 / 错误路径 / 互斥。
    import json as _json,threading,urllib.request,urllib.error
    from novelhelper import ai as ai_mod
    from novelhelper.server._state import _RUN_LOCK
    real_chat=ai_mod.chat_settings
    chat_log=[]
    def fake_api_chat(config,settings,messages):
        chat_log.append((settings,messages))
        if messages[0]['content']==setting_gen.REPAIR_PROMPT:
            return {'text':'still broken','usage':{},'elapsed':0,'model':'mock'}
        text=(messages[-1]['content'] or '').strip()
        if text.startswith('FAIL'):
            return {'text':'{"records": [broken','usage':{},'elapsed':0,'model':'mock'}
        if text.startswith('NOOP'):
            return {'text':'{"records":[]}','usage':{},'elapsed':0,'model':'mock'}
        return {'text':'{"records":['+
            '{"target":"characters","name":"林默","fields":{"身份/本名":"林默","身份/性别":"女"}},'+
            '{"target":"items","name":"短剑","fields":{"效果/主要效果":"锋利"}}]}',
            'usage':{'total_tokens':42},'elapsed':0.3,'model':'mock'}
    ai_mod.chat_settings=fake_api_chat
    from novelhelper import server as server_mod
    httpd=server_mod.serve(host='127.0.0.1',port=0)
    threading.Thread(target=httpd.serve_forever,daemon=True).start()
    base='http://127.0.0.1:'+str(httpd.server_address[1])
    def post(path,body):
        req=urllib.request.Request(base+path,data=_json.dumps(body).encode(),
                                   headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=15) as response:
            return _json.loads(response.read())
    try:
        # 正常生成：计数、分栏写入、忽略 system/prompt/model/config 覆盖。
        result=post('/api/ai/setting-gen',{'text':'林默是一位冷静的女性剑士。',
            'system':'EVIL','prompt':'EVIL','model':'evil-model','config':{'api':{}}})
        assert result['ok'] and result['summary']['added']==2
        assert result['summary']['written']=={'characters':1,'items':1}
        assert result['summary']['skipped']==0 and result['summary']['overflow']==0
        assert result['summary']['added_items']==[
            {'target':'characters','name':'林默','dropped_fields':0},
            {'target':'items','name':'短剑','dropped_fields':0}]
        assert result['summary']['dropped_items']==[]
        colls=result['collections']
        assert any(r['name']=='林默' for r in colls['characters']['items'])
        assert any(r['name']=='短剑' for r in colls['items']['items'])
        settings_used=chat_log[0][0]
        assert settings_used['model']=='' and settings_used['temperature']==0.2
        assert chat_log[0][1][0]['content'].startswith(setting_gen.SYSTEM_PROMPT)
        assert chat_log[0][1][1]['content']=='林默是一位冷静的女性剑士。'
        # 撤销：删除本批 2 条；再次撤销报"没有可撤销"。
        undone=post('/api/ai/setting-gen/undo',{})
        assert undone['ok'] and undone['removed']==2 and undone['kept']==0
        assert not any(r['name']=='林默' for r in undone['collections']['characters']['items'])
        assert not any(r['name']=='短剑' for r in undone['collections']['items']['items'])
        try:
            post('/api/ai/setting-gen/undo',{})
            raise AssertionError('second undo accepted')
        except urllib.error.HTTPError as error:
            assert error.code==400
        # 空文本 / 超长（响应体为本地化文案，比对消息文本）。
        from novelhelper.localization import t as _t
        for payload,key,params in [
                ({'text':''},'setting_gen_empty',{}),
                ({'text':'x'*(setting_gen.MAX_TASK_CHARS+1)},'setting_gen_too_long',
                 {'max':setting_gen.MAX_TASK_CHARS})]:
            try:
                post('/api/ai/setting-gen',payload)
                raise AssertionError(key+' accepted')
            except urllib.error.HTTPError as error:
                assert error.code==400 and _t('errors.'+key,**params) in error.read().decode('utf-8')
        # 解析失败：不写入、400。
        before=len(store.load('other')['items'])
        try:
            post('/api/ai/setting-gen',{'text':'FAIL 文本'})
            raise AssertionError('parse failure accepted')
        except urllib.error.HTTPError as error:
            assert error.code==400 and _t('errors.setting_gen_parse') in error.read().decode('utf-8')
        assert len(store.load('other')['items'])==before
        # 模型返回空记录：提示没有可写入的设定条目。
        try:
            post('/api/ai/setting-gen',{'text':'NOOP 文本'})
            raise AssertionError('empty result accepted')
        except urllib.error.HTTPError as error:
            assert error.code==400 and _t('errors.setting_gen_nothing') in error.read().decode('utf-8')
        # 与工作站共用锁：持锁时 409。
        _RUN_LOCK.acquire()
        try:
            try:
                post('/api/ai/setting-gen',{'text':'林默。'})
                raise AssertionError('busy accepted')
            except urllib.error.HTTPError as error:
                assert error.code==409
        finally:
            _RUN_LOCK.release()
    finally:
        httpd.shutdown();httpd.server_close()
        ai_mod.chat_settings=real_chat

    # 回归：未在配置里填写 API Key 时，不读取环境变量、不发起请求。
    import os as _os
    from novelhelper import ai as _ai
    _os.environ['DEEPSEEK_API_KEY']='should-be-ignored'
    try:
        api_settings=_ai.api_settings({'api':{'provider':'deepseek'}})
        assert api_settings['api_key']=='', 'env key must not be used when not configured'
        try:
            _ai.ping({'api':{'provider':'deepseek'}})
            raise AssertionError('env key fallback accepted')
        except _ai.AIError:
            pass
    finally:
        _os.environ.pop('DEEPSEEK_API_KEY',None)
    print('PASS: transactional write/rollback, fingerprint undo (modified kept, one-shot, novel switch), HTTP endpoints, lock, error paths')
