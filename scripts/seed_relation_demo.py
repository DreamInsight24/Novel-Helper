"""Add idempotent, explicitly labeled relationship examples to the active novel."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'app'))
from novelhelper import store


def seed():
    if not store.active_novel_id():
        raise RuntimeError('Open a novel before adding examples')
    db = store.load_all()
    records = [
        ('characters','demo_ui_char_linzhou','林舟','为追查三年前失踪的故人，重新接下一封红印信件。'),
        ('characters','demo_ui_char_shenyan','沈砚','青灯会联络人，与林舟共同追查旧渡口失踪案。'),
        ('characters','demo_graph_char_guwen','顾闻','曾为黑潮商行记账，现秘密向青灯会传递船运线索。'),
        ('characters','demo_graph_char_luoyun','洛云','黑潮商行的调查员，怀疑失踪案有人栽赃。'),
        ('factions','demo_ui_faction_lantern','青灯会','沿河商户与信使组成的互助组织。'),
        ('factions','demo_graph_faction_tide','黑潮商行','掌握临江城大部分货运航线，与青灯会存在冲突。'),
        ('section_world','demo_ui_world_rivercity','临江城与旧渡口','临江城外的旧渡口，三年前曾发生货船失踪事件。'),
        ('section_world','demo_graph_world_inn','河边客栈','沈砚负责的联络站，掌柜用灯色传递消息。'),
        ('section_world','demo_graph_world_warehouse','北岸仓库','黑潮商行存放旧账簿的仓库，位于旧渡口北岸。'),
        ('section_history','demo_graph_event_missing','旧渡口失踪案','三年前一艘装载赈济物资的船在渡口失踪，各方记录互相矛盾。'),
        ('section_history','demo_graph_event_fire','仓库夜火','北岸仓库发生大火，账簿被转移，案情出现新的线索。'),
        ('items','demo_graph_item_letter','红印信件','一封三年前未送达的信，信封上的红印与失踪货船印记相同。'),
        ('items','demo_graph_item_ledger','残缺账簿','顾闻带出的船运账簿，记有失踪当晚的调度记录。'),
        ('memories','demo_graph_memory_oath','三年前的约定','林舟与沈砚约定在旧渡口接应归船，但当晚没有等到任何人。'),
    ]
    for coll,rid,name,content in records:
        bucket=db.setdefault(coll,{'items':[]})
        if any(rec.get('id')==rid for rec in bucket['items']):
            continue
        bucket['items'].append({'id':rid,('title' if coll=='memories' else 'name'):'【示例】'+name,
                               'category':'示例','content':content,'summary':content,'source':'relation-demo',
                               'notes':'关系图演示用模拟数据，可删除。','elements':[]})
        store.save(coll,bucket)
    aliases={name:(coll,rid) for coll,rid,name,_ in records}
    edges=[
        ('林舟','青灯会','隶属',True,'外勤信使'),('沈砚','青灯会','隶属',True,'临江联络人'),
        ('顾闻','青灯会','隶属',True,'秘密线人'),('洛云','黑潮商行','隶属',True,'调查员'),
        ('林舟','沈砚','认识',False,'三年前在渡口结识'),
        ('林舟','红印信件','持有',True,'受故人委托保管'),('林舟','旧渡口失踪案','追查',True,''),
        ('红印信件','旧渡口失踪案','指向',True,'红印与货船印记相同'),
        ('沈砚','河边客栈','驻守',True,''),('青灯会','临江城与旧渡口','活动于',True,''),
        ('青灯会','黑潮商行','敌对',False,'因失踪案产生冲突'),
        ('顾闻','残缺账簿','持有',True,''),('残缺账簿','旧渡口失踪案','记录',True,''),
        ('顾闻','沈砚','合作',False,'交付秘密账簿'),('洛云','顾闻','追查',True,'寻找带走账簿的人'),
        ('黑潮商行','北岸仓库','控制',True,''),('北岸仓库','临江城与旧渡口','位于',True,''),
        ('河边客栈','临江城与旧渡口','位于',True,''),('北岸仓库','仓库夜火','发生',True,''),
        ('仓库夜火','旧渡口失踪案','关联',False,'账簿在夜火中被转移'),
        ('三年前的约定','林舟','涉及',True,''),('三年前的约定','沈砚','涉及',True,''),
        ('红印信件','三年前的约定','唤起',True,''),('洛云','仓库夜火','调查',True,'')]
    graph=store.load_all()['relations']
    for index,(left,right,kind,directed,note) in enumerate(edges):
        rid='demo_graph_rel_'+str(index)
        if any(edge['id']==rid for edge in graph['items']):
            continue
        a,b=aliases[left],aliases[right]
        graph['items'].append({'id':rid,'source':{'collection':a[0],'id':a[1]},
                               'target':{'collection':b[0],'id':b[1]},'type':kind,'directed':directed,'note':note})
    store.save('relations',graph)
    print('Relationship examples ready:',len(records),'entries,',len(edges),'relationships; novel',store.active_novel_id())

if __name__=='__main__':
    seed()
