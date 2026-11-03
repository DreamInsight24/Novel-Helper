"""Relationship persistence tests against an isolated temporary novel."""
import os,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'app'))
with tempfile.TemporaryDirectory(prefix='novelhelper_relations_') as temp:
    os.environ['NOVELHELPER_HOME']=temp
    os.environ['NOVELHELPER_DATA']=str(Path(temp)/'data')
    from novelhelper import store,relations,context
    store.save('config',store.default_config())
    novel=store.create_novel('Relations test')
    store.open_novel(novel['id'])
    store.save('characters',{'items':[{'id':'a','name':'A'},{'id':'b','name':'B'}]})
    store.save('factions',{'items':[{'id':'o','name':'O','members':[{'id':'a','note':'Officer'},'b']}]})
    db=store.load_all();graph=db['relations']
    assert len(graph['items'])==2
    assert any(e['note']=='Officer' for e in graph['items'])
    assert store.load_all()['relations']==graph
    ids={e['id'] for e in graph['items']}
    store.save('factions',store.load('factions'))
    assert {e['id'] for e in store.load('relations')['items']}==ids
    mutual={'id':'ab','source':{'collection':'characters','id':'a'},'target':{'collection':'characters','id':'b'},'type':'knows','directed':False,'note':''}
    graph['items'] += [mutual,dict(mutual,id='ba',source=mutual['target'],target=mutual['source'])]
    store.save('relations',graph);graph=store.load('relations')
    assert len(graph['items'])==3
    graph['items']=[e for e in graph['items'] if not(e['source']['id']=='a' and e['target']['id']=='o')]
    store.save('relations',graph)
    assert store.load('factions')['items'][0]['members']==['b']
    assert len(store.load_all()['relations']['items'])==2
    # A bad edge is discarded without blocking a valid one in the same batch.
    store.save('relations',{'items':[mutual,dict(mutual,target={'collection':'characters','id':'missing'}),
                                   dict(mutual,id='self',target=mutual['source'])],'initialized':True})
    assert len(store.load('relations')['items'])==1
    selection={'record_selections':{'characters':['a']},'setting_categories':['characters']}
    rendered=context.build_user_message({},store.load_all(),selection)
    assert 'knows' in rendered and 'B' in rendered and '## 条目关联' not in rendered
    assert rendered.count('### B')==0, 'An unselected peer is named without its content'
    assert '↔' in context.render_record_relations(store.load_all(),'characters',{'id':'a'})
    full=context.build_user_message({},store.load_all(),{'record_selections':{'characters':['a','b']},'setting_categories':['characters']})
    assert full.count('条目关联：')==2, 'Each selected endpoint carries its own relationship'
    region_db={'characters':{'items':[{'id':'a','name':'A'}]},
               'memories':{'items':[{'id':'m','title':'Memory','content':'memory body'}]},
               'sections':{'items':[{'key':'custom','label':'Custom'}]},
               'section_custom':{'items':[{'id':'s','name':'Setting','content':'setting body'}]},
               'worldmap':{'regions':{'r':{'id':'r','name':'Region'}}},
               'relations':{'initialized':True,'items':[
                   {'source':{'collection':'characters','id':'a'},'target':{'collection':'memories','id':'m'},'type':'remembers'},
                   {'source':{'collection':'worldmap','id':'r'},'target':{'collection':'section_custom','id':'s'},'type':'contains'}]}}
    rendered=context.build_user_message({},region_db,{'record_selections':{'memories':['m'],'section_custom':['s']},'setting_categories':['memories','section_custom'],'include':{'worldmap':True}})
    assert '← A：remembers' in rendered and '← Region：contains' in rendered and '→ Setting：contains' in rendered
    # Failure after writing edges must restore the graph and the membership projection.
    from unittest.mock import patch
    from novelhelper.store import _repository
    before={name:store.load(name) for name in ('relations','factions')}
    real_write=_repository._write
    def fail_faction(name,data):
        if name=='factions': raise OSError('injected projection write failure')
        return real_write(name,data)
    membership={'source':{'collection':'characters','id':'a'},'target':{'collection':'factions','id':'o'},'type':'隶属'}
    with patch.object(_repository,'_write',side_effect=fail_faction):
        try:store.save('relations',{'items':[membership],'initialized':True})
        except OSError:pass
        else:raise AssertionError('Expected injected write failure')
    assert all(store.load(name)==value for name,value in before.items())
    assert list((store.novel_data_dir(novel['id'])/'relation_backups').glob('*/relations.json'))
    store.save('characters',{'items':[{'id':'a','name':'A'}]})
    assert store.load('relations')['items']==[]
    assert not store.load('factions')['items'][0].get('members')
    # Exercise the real move endpoint and HTTP collection validation.
    import json,threading,urllib.request,urllib.error
    from novelhelper import server
    store.save('characters',{'items':[{'id':'a','name':'A'},{'id':'b','name':'B'}]})
    store.save('relations',{'items':[mutual],'initialized':True})
    httpd=server.serve(host='127.0.0.1',port=0)
    threading.Thread(target=httpd.serve_forever,daemon=True).start()
    base='http://127.0.0.1:'+str(httpd.server_address[1])
    def post(path,body):
        req=urllib.request.Request(base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=10) as response:
            return json.loads(response.read())
    try:
        result=post('/api/move',{'from':'characters','to':'other','ids':['a']})
        assert result['moved']==1
        edge=store.load('relations')['items'][0]
        assert {edge['source']['collection'],edge['target']['collection']}=={'characters','other'}
        with urllib.request.urlopen(base+'/relations.js',timeout=10) as response:
            assert b'relationVisibleGraph' in response.read()
        result=post('/api/collections/relations',{'data':{'items':[edge,
            dict(mutual,target={'collection':'characters','id':'missing'}),None],'initialized':True}})
        assert result['discarded']==2 and len(result['data']['items'])==1
        _repository._write('relations',{'items':[edge,dict(mutual,target={'collection':'characters','id':'missing'})],'initialized':True})
        with urllib.request.urlopen(base+'/api/state') as response:
            state=json.loads(response.read())
        assert state['relation_discarded']==1 and len(state['collections']['relations']['items'])==1


    finally:
        httpd.shutdown();httpd.server_close()
    store.save('other',{'items':[]})
    assert store.load('relations')['items']==[]
    other=store.create_novel('Other novel');store.open_novel(other['id'])
    assert store.load_all()['relations']['items']==[]
    store.open_novel(novel['id'])
    assert store.load_all()['relations']['items']==[]
    print('PASS: legacy migration, canonical deduplication, direction, membership sync, validation, selected context, deletion cleanup and novel isolation')
