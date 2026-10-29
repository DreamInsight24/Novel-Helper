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
    try:
        store.save('relations',{'items':[dict(mutual,target={'collection':'characters','id':'missing'})],'initialized':True})
        raise AssertionError('Invalid reference accepted')
    except ValueError:
        pass
    assert len(store.load('relations')['items'])==2
    selection={'record_selections':{'characters':['a','b']},'setting_categories':['characters']}
    assert 'knows' in context.render_selected_relations(store.load_all(),selection)
    selection['record_selections']['characters']=['a']
    assert not context.render_selected_relations(store.load_all(),selection)
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
        try:
            post('/api/collections/relations',{'data':{'items':[dict(mutual,target={'collection':'characters','id':'missing'})],'initialized':True}})
            raise AssertionError('Invalid HTTP reference accepted')
        except urllib.error.HTTPError as error:
            assert error.code==400
    finally:
        httpd.shutdown();httpd.server_close()
    store.save('other',{'items':[]})
    assert store.load('relations')['items']==[]
    other=store.create_novel('Other novel');store.open_novel(other['id'])
    assert store.load_all()['relations']['items']==[]
    store.open_novel(novel['id'])
    assert store.load_all()['relations']['items']==[]
    print('PASS: legacy migration, canonical deduplication, direction, membership sync, validation, selected context, deletion cleanup and novel isolation')
