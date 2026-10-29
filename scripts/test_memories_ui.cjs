// Regression: relationship navigation can pre-create memory state with only sel.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({i18n:{t:key=>key},window:{addEventListener(){}}});
for(const file of ['core','records','relations','views'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/novelhelper/web/'+file+'.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
run(`h=(tag,props,...children)=>({tag,props:props||{},value:props?.value||'',children:children.flat(Infinity).filter(child=>child!=null&&child!==false),
 appendChild(node){this.children.push(node);return node;},append(...nodes){this.children.push(...nodes);},classList:{add(){},toggle(){}},focus(){}});
 clear=node=>{node.children=[];};
 guidanceButton=()=>h('button');exportButtons=()=>h('div');
 modal=()=>({close(){},dlg:{classList:{add(){}}}});
 relationEditor=()=>h('div');
 globalThis.walk=node=>[node,...node.children.filter(child=>typeof child==='object').flatMap(walk)];
 globalThis.draw=()=>{globalThis.main=h('main');viewMemories(main);};
 state.db={sections:{items:[]},memories:{categories:['short','long'],items:[
 {id:'m1',title:'First',category:'short',content:'Content one'},
 {id:'m2',title:'Second',category:'long',content:'Content two'}]}};
 state.ui={};openRelationRecord({collection:'memories',id:'m2'});`);
assert.equal(run('state.ui.memories.q'),undefined,'Reproduce state created by actual graph navigation');
run('draw();');
assert.equal(run('state.ui.memories.sel'),'m2','Preserve selected entry');
assert.equal(run('state.ui.memories.q'),'');
assert.equal(run('state.ui.memories.cat'),'');
assert.equal(run("walk(main).filter(node=>node.props.class?.includes('list-item')).length"),2,'Render all entries after graph navigation');
assert.equal(run("walk(main).find(node=>node.tag==='textarea').props.value"),'Content two','Render the selected content');
run(`state.ui.memories.q='First';state.ui.memories.cat='short';draw();`);
assert.equal(run('state.ui.memories.q'),'First','Keep existing search');
assert.equal(run('state.ui.memories.cat'),'short','Keep existing category');
assert.equal(run("walk(main).filter(node=>node.props.class?.includes('list-item')).length"),1);
run(`state.ui.memories={sel:'m1',q:null,cat:null};draw();`);
assert.equal(run('state.ui.memories.q'),'');
assert.equal(run('state.ui.memories.cat'),'');
run(`state.db.memories.items=[];state.ui.memories={sel:'deleted'};draw();`);
assert.equal(run('state.ui.memories.sel'),null,'Deleted entries fall back to the empty state');
assert.equal(run("walk(main).some(node=>node.props.text==='memories.pick_hint')"),true);
console.log('PASS: graph-to-memory navigation renders list and content, preserves filters, normalizes partial state and handles empty collections');
