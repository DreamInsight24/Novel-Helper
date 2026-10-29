// Manuscript behavior checks without browser state, network, or user files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({i18n:{t:(key,args) => key}, window:{addEventListener(){}},
  setTimeout:()=>0, clearTimeout(){}, requestAnimationFrame(){}, document:{}, Blob});
for (const file of ['core','manuscript']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/novelhelper/web/'+file+'.js'),'utf8'),context);
const run = code => vm.runInContext(code,context);
run(`h = (tag, props, ...children) => ({tag, props:props || {}, value:props?.value || '', checked:!!props?.checked,
  children:children.flat(Infinity).filter(child => child != null && child !== false), selectionStart:0, selectionEnd:0,
  classList:{add(){}, remove(){}}, appendChild(node){this.children.push(node);return node;},
  append(...nodes){this.children.push(...nodes);}, remove(){}, focus(){}, addEventListener(){},
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}, querySelectorAll(){return [];}});
  clear = node => {node.children=[];}; touch=()=>{}; toast=()=>{}; status=()=>{};
  modal=(title, body, buttons) => {globalThis.lastModal={title,body,buttons};return {close(){},dlg:{classList:{add(){}}}};};
  globalThis.nodes = node => [node, ...node.children.filter(child=>typeof child==='object').flatMap(nodes)];
  globalThis.draw = () => {globalThis.main=h('main'); viewManuscript(main);};
  globalThis.editor = () => nodes(main).find(node=>node.tag==='textarea' && node.props['aria-label']==='manuscript.editor_label');
  state.activeNovelId='novel-a'; state.db={state:{textPanel:{value:'甲乙丙丁'}}}; state.paths={};state.io={files:[]};draw();`);
assert.equal(run('editor().value'),'甲乙丙丁','Samples must never replace the manuscript');
assert.equal(run('state.ui.text.materials.length'),3);
run(`editor().setSelectionRange(2,2);editor().props.onselect();
  nodes(main).find(node=>node.props.class==='material-card-open').props.onclick();
  lastModal.buttons.find(node=>node.props.text==='manuscript.insert_cursor').props.onclick();`);
assert.equal(run('editor().value'), '甲乙manuscript.sample_1_content丙丁');
run(`nodes(main).find(node=>node.props.text==='manuscript.undo').props.onclick();`);
assert.equal(run('editor().value'),'甲乙丙丁','One undo restores the entire insertion');
run(`appendToTextPanel('Model output',true);`);
assert.equal(run('state.ui.text.materials.length'),4);
assert.equal(run('state.ui.text.value'),'甲乙丙丁','Workstation transfer creates a card without touching the document');
run(`state.ui.currentSession={id:'another-conversation'};draw();`);
assert.equal(run('state.ui.text.materials.length'),4,'Switching conversations preserves materials');
assert.equal(run('editor().value'),'甲乙丙丁');
run(`globalThis.novelA=state.db;globalThis.uiA=state.ui.text;
  state.activeNovelId='novel-b';state.db={state:{}};appendToTextPanel('B source',true);draw();`);
assert.equal(run('editor().value'),'');
assert.equal(run('state.ui.text.materials.length'),4,'B receives its own source plus samples');
assert.equal(run('uiA.materials.length'),4,'Adding B material must not alter A cache');
run(`state.activeNovelId='novel-a';state.db=novelA;draw();`);
assert.equal(run('editor().value'),'甲乙丙丁');
assert.equal(run('state.ui.text.materials.length'),4);
console.log('PASS: samples preserve drafts, cursor insertion and undo, workstation materials, conversation independence, and novel isolation');

run(`askDialog=(title,label,value,submit)=>{globalThis.submitFolder=submit;};
  nodes(main).find(node=>node.props['aria-label']==='manuscript.new_folder').props.onclick();
  submitFolder('Reference');`);
assert.equal(run('state.ui.text.materialFolders.length'),1);
run(`globalThis.folderId=state.ui.text.materialFolders[0].id;
  pickDialog=(title,options,pick)=>pick(folderId);
  nodes(main).find(node=>node.props.class==='material-card-move').props.onclick();`);
assert.equal(run('state.ui.text.materials[0].folderId'),run('folderId'));
assert.equal(run('state.db.state.textPanel.materialFolders[0].name'),'Reference');
run(`nodes(main).find(node=>node.props.class==='material-folder-card').props.onclick();`);
assert.equal(run("nodes(main).filter(node=>node.props.class==='material-card-open').length"),1);
assert.equal(run('editor().value'),'甲乙丙丁','Organizing sources must preserve the draft');
run(`state.ui.text=null;draw();`);
assert.equal(run('state.ui.text.materialFolders[0].name'),'Reference','Folders survive cache reload');
assert.equal(run('state.ui.text.materials[0].folderId'),run('folderId'));
assert.equal(run("nodes(main).some(node=>node.props.text==='manuscript.folder_title' || node.props.text==='manuscript.export_memory')"),false);
assert.equal(run("nodes(main).some(node=>node.props.text==='manuscript.to_chapter')"),true);
console.log('PASS: folder grouping and persistence preserve drafts, chapter actions replace old toolbar actions');

run(`globalThis.dragData={setData(){}};
  nodes(main).find(node=>node.tag==='article' && node.props.draggable==='true').props.ondragstart({dataTransfer:dragData});`);
assert.equal(run('dragData.effectAllowed'),'copyMove','Dragging must allow moving into folders and copying into text');
run(`nodes(main).find(node=>node.props.class==='material-folder-card').props.ondrop({
  dataTransfer:{getData:()=>state.ui.text.materials[1].id}, preventDefault(){},stopPropagation(){}});`);
assert.equal(run('state.ui.text.materials[1].folderId'),run('folderId'));
console.log('PASS: drag-to-folder accepts material moves');

run(`nodes(main).find(node=>node.props.class==='material-folder-card').props.onclick();`);
assert.equal(run('state.ui.text.materialFolder'),run('folderId'));
run(`nodes(main).find(node=>node.props['aria-label']==='manuscript.folder_back').props.onclick();`);
assert.equal(run('state.ui.text.materialFolder'),'');
assert.equal(run("nodes(main).find(node=>node.props['aria-label']==='manuscript.folder_forward').props.disabled"),false);
run(`nodes(main).find(node=>node.props['aria-label']==='manuscript.folder_forward').props.onclick();`);
assert.equal(run('state.ui.text.materialFolder'),run('folderId'));
assert.equal(run("nodes(main).some(node=>node.props.text==='manuscript.all_materials')"),false);
console.log('PASS: material folder navigation restores backward and forward locations');
