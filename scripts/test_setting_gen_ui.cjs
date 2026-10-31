const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const context=vm.createContext({i18n:{t:key=>key,apply(){}},window:{addEventListener(){}},
  AbortController,URLSearchParams,console});
for(const file of ['core','records'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/novelhelper/web/'+file+'.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context);

(async()=>{
run(`
 globalThis.modals=[];globalThis.apiCalls=[];globalThis.toasts=[];
 h=(tag,props,...children)=>({tag,props:props||{},value:props?.value||'',children:children.flat(Infinity).filter(Boolean),
   focus(){},classList:{add(){}},remove(){},appendChild(c){this.children.push(c);},getClientRects(){return [1];}});
 modal=(title,body,buttons)=>{const rec={title,body,buttons:buttons||[],closed:false,
   close(){this.closed=true;},dlg:{classList:{add(){}},querySelectorAll:sel=>rec.buttons}};modals.push(rec);return rec;};
 toast=(msg,kind)=>{toasts.push(msg);};status=()=>{};
 api=async(path,opts)=>{apiCalls.push({path,opts});
   if(path==='/api/ai/setting-gen/undo')return {ok:true,removed:1,kept:0,collections:{}};
   if(path.startsWith('/api/ai/setting-gen')){const text=(opts.body||{}).text||'';
     if(text==='SLOW')return new Promise((resolve,reject)=>{
       opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})));});
     return {ok:true,batch_id:'sg_x',summary:{added:2,skipped:1,written:{characters:2},
       dropped:{dropped_invalid:1},overflow:0,
       added_items:[{target:'characters',name:'张三',dropped_fields:0},{target:'items',name:'短剑',dropped_fields:1}],
       dropped_items:[{target:'characters',name:'李四',reason:'duplicate'},
                      {target:'section_unknown',name:'',reason:'unknown_target'}]},collections:{}};}
   if(path.startsWith('/api/file'))return {ok:true,path:'a.txt',content:'文件内容'};
   return {ok:true};};
 setDb=()=>{};renderNav=()=>{};renderMain=()=>{};flushPendingSaves=async()=>{};autoGrow=()=>{};
 clear=el=>{el.children=[];};
 settingLabel=(id,fb)=>fb||id;
 defFor=(id)=>id==='characters'?{coll:'characters',label:'人物档案'}:null;
 state.sources=[{path:'a.txt'},{path:'b.md'},{path:'c.json'}];
 state.paths={import:'import'};
 globalThis.walk=node=>[node,...(node.children||[]).filter(child=>typeof child==='object').flatMap(walk)];
`);

// 入口按钮：点击打开对话框。
run(`globalThis.entryBtn=aiSettingGenButton({coll:'characters'});`);
assert.equal(run('entryBtn.props.text'),'setting_gen.button');
run(`entryBtn.props.onclick();`);
assert.equal(run('modals.length'),1,'Entry button opens the dialog');

// 空文本：不请求、提示错误。
run(`globalThis.srcNode=walk(modals[0].body).find(n=>n.props.id==='setting-gen-source');
 modals[0].buttons[1].props.onclick();`);
await new Promise(r=>setImmediate(r));
assert.equal(run('apiCalls.length'),0,'Empty text must not call the API');
assert.equal(run('toasts[0]'),'errors.setting_gen_empty');

// 正常生成：先落盘、请求带文本、关闭输入框、打开结果框。
run(`srcNode.value='林默是一位冷静的女性剑士。';
 modals[0].buttons[1].props.onclick();`);
await new Promise(r=>setImmediate(r));
assert.equal(run('modals[0].closed'),true,'Input dialog closes on success');
assert.equal(run('modals.length'),2,'Result dialog opens');
assert.equal(run('apiCalls.length'),1);
assert.equal(run('apiCalls[0].opts.body.text'),'林默是一位冷静的女性剑士。');
assert.equal(run("!!apiCalls[0].opts.signal"),true,'Request carries an abort signal');
assert.equal(run('walk(modals[1].body).some(n=>n.props.text==="setting_gen.added")'),true,'Summary shows added/skipped');
assert.equal(run('walk(modals[1].body).some(n=>n.props.text==="人物档案 · 张三")'),true,'Added item listed with name');
assert.equal(run('walk(modals[1].body).some(n=>n.props.text==="items · 短剑")'),true,'Added item in second target listed');
assert.equal(run("walk(modals[1].body).some(n=>n.props.text===' —— setting_gen.field_drops')"),true,'Ignored-field note shown');
assert.equal(run('walk(modals[1].body).some(n=>n.props.text==="人物档案 · 李四")'),true,'Dropped item listed with name');
assert.equal(run("walk(modals[1].body).some(n=>n.props.text===' —— setting_gen.reason_duplicate')"),true,'Drop reason shown');
assert.equal(run('walk(modals[1].body).some(n=>n.props.text==="section_unknown · setting_gen.unnamed_item")'),true,'Unnamed item fallback');

// 撤销：按钮触发 undo 请求，展示撤销结果并移除按钮。
run(`modals[1].buttons.find(b=>b.props.text==='setting_gen.undo').props.onclick();`);
await new Promise(r=>setImmediate(r));
assert.equal(run('apiCalls[1].path'),'/api/ai/setting-gen/undo');
assert.equal(run('walk(modals[1].body).some(n=>n.textContent==="setting_gen.undo_done")'),true,'Undo summary shown');

// 取消等待：请求挂起时点取消 → 不弹结果框。
run(`aiSettingGenDialog({coll:'characters'});`);
assert.equal(run('modals.length'),3);
run(`walk(modals[2].body).find(n=>n.props.id==='setting-gen-source').value='SLOW';
 modals[2].buttons[1].props.onclick();`);
await new Promise(r=>setImmediate(r));
assert.equal(run('modals[2].buttons[0].textContent'),'setting_gen.cancel_wait','Busy state relabels cancel');
run(`modals[2].buttons[0].props.onclick();`);
await new Promise(r=>setImmediate(r));
assert.equal(run('modals[2].closed'),true,'Cancel closes the dialog');
assert.equal(run('modals.length'),3,'Cancelled generation shows no result dialog');

// 文件读取：未选文件提示；选择后填入文本框。
run(`globalThis.dlg3=modals[2];`);
run(`walk(dlg3.body).find(n=>n.props.text==='setting_gen.file_read').onclick();`);
await new Promise(r=>setImmediate(r));
assert.equal(run('toasts[toasts.length-1]'),'records.choose_file_first','No file selected prompts a toast');
run(`dlg3.body.children[0].children[0];globalThis.selNode=walk(dlg3.body).find(n=>n.tag==='select');`);
run(`selNode.value='a.txt';walk(dlg3.body).find(n=>n.props.text==='setting_gen.file_read').onclick();`);
await new Promise(r=>setImmediate(r));
assert.equal(run("walk(dlg3.body).find(n=>n.props.id==='setting-gen-source').value"),'文件内容','File content fills the textarea');
assert.equal(run('walk(dlg3.body).some(n=>n.textContent==="setting_gen.loaded")'),true,'Loaded notice shown');
// 文件下拉只列 .txt/.md。
run(`globalThis.optCount=selNode.children.length;`);
assert.equal(run('optCount'),2,'Only .txt/.md sources listed');

console.log('PASS: AI setting-gen entry, empty guard, submit/summary, undo, cancel-wait abort, import-file read');
})().catch(err=>{console.error(err);process.exit(1);});
