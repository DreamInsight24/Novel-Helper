const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const context=vm.createContext({i18n:{t:key=>key},window:{addEventListener(){}}});
for(const file of ['core','records','config']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/novelhelper/web/'+file+'.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);
run(`h=(tag,props,...children)=>({tag,props:props||{},children:children.flat(Infinity).filter(child=>child!=null && child!==false),
 value:props?.value || '',appendChild(node){this.children.push(node);return node;},append(...nodes){this.children.push(...nodes);},classList:{add(){}}});
 globalThis.walk=node=>[node,...node.children.filter(child=>typeof child==='object').flatMap(walk)];
 touch=()=>{};toast=()=>{};renderNav=()=>{};renderMain=()=>{};saveNow=async()=>{};
 confirmDialog=(title,message,onConfirm)=>{globalThis.confirmTemplate=onConfirm;};
 globalThis.requests=[];api=async(url,options)=>{requests.push({url,options});return {path:'test-export'};};
 state.db={sections:{items:[]},characters:{items:[{id:'c1',elements:[{key:'Identity',children:[{key:'Name',value:'Keep me'}]}]}]},
 schema:{characters:{label:'Characters',elements:[{key:'Identity',children:[{key:'Name'},{key:'Age'}]}]}}};
 globalThis.main=h('main');settingMetadataEditor(main,settingEntries(true).find(entry=>entry.id==='characters'),state.db.sections);`);
assert.equal(run(`NOVEL_NAV.some(entry=>entry.id==='elements')`),false,'The standalone template sidebar entry is removed');
assert.equal(run(`walk(main).some(node=>node.props.class?.split(' ').includes('setting-metadata-fields'))`),true);
run(`walk(main).find(node=>node.props.text==='elements.apply_to_all').props.onclick();`);
assert.equal(run('state.db.characters.items[0].elements[0].children.length'),1,'Applying requires confirmation');
run('confirmTemplate()');
assert.equal(run('state.db.characters.items[0].elements[0].children[0].value'),'Keep me');
assert.equal(run('state.db.characters.items[0].elements[0].children[1].key'),'Age');
run(`walk(main).find(node=>node.props.id==='setting-edit-name').props.oninput({target:{value:'New section label'}});`);
assert.equal(run('state.db.sections.builtins.characters.label'),'New section label');
assert.equal(run('state.db.schema.characters.label'),'New section label');
(async()=>{
 await run(`walk(main).find(node=>node.props.text==='elements.export_json').props.onclick()`);
 assert.equal(run('requests[0].url'),'/api/io/export');
 assert.ok(run(`JSON.parse(requests[0].options.body.content).elements[0].children.some(node=>node.key==='Age')`));
 run(`state.ui.elements={key:'characters'};viewElements(h('main'));`);
 assert.equal(run('state.view'),'sections');
 assert.equal(run('state.ui.settingEditor'),'characters');
 console.log('PASS: per-section metadata editing, legacy routing, confirmed non-destructive apply, and template export');
})().catch(error=>{console.error(error);process.exitCode=1;});
