// Manuscript editor behavior without a browser: chapters, drafts, and the docked polish agent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  i18n: { t: (key, params) => key + (params ? JSON.stringify(params) : '') },
  window: { addEventListener() {} },
  setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, document: {}, Blob, AbortController
});
for (const file of ['core', 'workstation', 'revision', 'manuscript']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/novelhelper/web/' + file + '.js'), 'utf8'), context);
}
const run = code => vm.runInContext(code, context);

run(`
  h = (tag, props, ...children) => ({tag, props:props || {}, value:props?.value || '', checked:!!props?.checked,
    children:children.flat(Infinity).filter(child => child != null && child !== false), selectionStart:0, selectionEnd:0,
    isConnected:true, textContent:'',
    classList:{add(){}, remove(){}}, appendChild(node){this.children.push(node);return node;},
    append(...nodes){this.children.push(...nodes);}, remove(){}, focus(){}, addEventListener(){},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}, querySelectorAll(){return [];}});
  clear = node => {node.children=[];}; touch=()=>{}; toast=(text)=>{(globalThis.toasts=globalThis.toasts||[]).push(text);};
  status=()=>{}; saveNow=async()=>{}; refreshFiles=async()=>{}; openSettings=()=>{};
  defaultModelName=()=>'test-model'; currentModels=()=>['test-model'];
  effortChoices=()=>['none','low','medium','high','max'];
  modal=(title, body, buttons) => {globalThis.lastModal={title,body,buttons};return {close(){},dlg:{classList:{add(){}}}};};
  globalThis.nodes = node => [node, ...node.children.filter(child=>typeof child==='object').flatMap(nodes)];
  globalThis.draw = () => {globalThis.main=h('main'); viewManuscript(main);};
  renderMain = () => draw();
  globalThis.editor = () => nodes(main).find(node=>node.tag==='textarea' && node.props['aria-label']==='manuscript.editor_label');
  globalThis.find = (predicate) => nodes(main).find(predicate);
  globalThis.sendButton = () => nodes(main).find(node=>node.props.onclick && String(node.props.class||'').includes('agent-send') && String(node.props.class||'').includes('primary'));
  state.activeNovelId='novel-a';
  state.db={state:{textPanel:{value:'第一段。\\n第二段。'}},
            modes:{items:[{id:'polish',label:'润色修订',kind:'process',effort:'medium'}]}};
  state.ui = {}; state.paths={}; state.io={files:[]};
  globalThis.bodies=[];
  globalThis.nextView=null;
  streamRevision = async body => { bodies.push(body); return nextView; };
  api = async () => ({session: nextView});
  globalThis.baseDoc = '第一段。\\n第二段。';
  globalThis.v = (overrides={}) => Object.assign({
    id:'rev_1', title:'润色修订 · 第三章', state:'LOCATE', accepted:false, auto_step:'sample',
    doc:{text:baseDoc, original_text:baseDoc, path:'', chapter:'', chars:baseDoc.length, count:2},
    scope:{kind:'chapter', count:2, paragraph_ids:['p_001','p_002']},
    options:{sample_first:true}, card:{goal:'更紧张', style:'短句', preserve:['人物称呼'], forbidden:['新增人物'],
      sample_first:true, max_rounds:5, scope:{}}, preview:'改本章 2 段：更紧张。',
    question:null, plan:{targets:[{paragraph_id:'p_001',direction:'短句',priority:'high'}]},
    sample:null, changes:[], review:null, stop:null, warnings:[], rounds:[],
    versions:[{index:0,label:'original',source:'original',chars:baseDoc.length}],
    messages:[], stats:{rounds:0,changes:0,chars:baseDoc.length}
  }, overrides);
  draw();`);

// 1. The page no longer shows a material shelf; the draft is untouched.
assert.equal(run('editor().value'), '第一段。\n第二段。');
assert.equal(run("nodes(main).some(node=>node.props.class==='material-shelf')"), false);
assert.equal(run('state.ui.text.materials === undefined'), true);
assert.deepEqual(JSON.parse(run(`JSON.stringify(manuscriptTextStats('第一段。\\n\\n第二段。\\n\\n'))`)),
  { chars: 12, han: 6, lines: 2, paras: 2 });
assert.deepEqual(JSON.parse(run(`JSON.stringify(manuscriptTextStats('\\n \\n'))`)),
  { chars: 3, han: 0, lines: 0, paras: 0 });
console.log('PASS: blank lines are not counted as lines or paragraphs');

// 2. The chapter bar can be collapsed and the choice is persisted in the draft.
assert.equal(run("nodes(main).some(node=>node.props.class==='chapter-bar')"), true);
run("find(node=>node.props.class==='chapter-bar-head').props.onclick();");
assert.equal(run('state.ui.text.chapterCollapsed'), true);
assert.equal(run('state.db.state.textPanel.chapterCollapsed'), true);
assert.equal(run("nodes(main).some(node=>node.props.class==='chapter-bar-list')"), false);
console.log('PASS: no material shelf, draft intact, chapter bar collapses and persists');

// 3. AI assist is the polish agent: one docked panel, no quick-rewrite mode.
run("find(node=>String(node.props.class||'').indexOf('manuscript-ai-toggle')>=0).props.onclick();");
assert.equal(run("typeof lastModal === 'undefined'"), true);
assert.equal(run("nodes(main).some(node=>String(node.props.class||'').indexOf('manuscript-agent')===0)"), true);
assert.equal(run("nodes(main).some(node=>node.props.class==='manuscript-agent-input')"), true);
assert.equal(run("nodes(main).some(node=>node.props.class==='revision-flow')"), true);
assert.equal(run("nodes(main).some(node=>node.props.class==='revision-mode-switch')"), false);
assert.equal(run("nodes(main).some(node=>node.props.class==='manuscript-agent-feed')"), false);
assert.equal(run("nodes(main).some(node=>node.props.class==='manuscript-edit-bar')"), false);
assert.equal(run('state.db.state.textPanel.assistant'), true);
console.log('PASS: AI assist opens directly as the polish agent');

(async () => {
  // 4. A wish becomes a plan request carrying the whole document and the selection.
  run(`editor().setSelectionRange(0,4); editor().props.onselect();
    find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'把开头改得紧张一点'}});
    nextView = v({}); globalThis.send = sendButton().props.onclick();`);
  await run('send');
  assert.equal(run("bodies[bodies.length-1].step"), 'plan');
  assert.equal(run("bodies[bodies.length-1].source_text"), run('baseDoc'));
  assert.equal(run("bodies[bodies.length-1].selection.start"), 0);
  assert.equal(run("bodies[bodies.length-1].selection.end"), 4);
  assert.equal(run("bodies[bodies.length-1].model"), 'test-model');
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-card')"), true);
  console.log('PASS: a wish becomes a plan request with document and selection scope');

  // 5. The panel sends the chosen model and effort to the agent.
  run(`globalThis.panelMenu = nodes(find(node=>String(node.props.class||'').indexOf('manuscript-agent')===0))
      .find(node=>node.props.class==='agent-model');
    globalThis.panelItems = nodes(panelMenu)
      .filter(node=>node.props.class && String(node.props.class).indexOf('agent-model-item')===0);`);
  run("panelItems.find(node=>node.props.text==='test-model').props.onclick();");
  run("panelItems.find(node=>node.props.text==='high').props.onclick();");
  assert.equal(run('state.ui.text.effort'), 'high');
  assert.equal(run('state.db.state.textPanel.effort'), 'high');
  run(`find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'再收紧一点'}});
    nextView = v({}); globalThis.send = sendButton().props.onclick();`);
  await run('send');
  assert.equal(run('bodies[bodies.length-1].effort'), 'high');
  console.log('PASS: the agent panel sends the chosen model and effort');

  // 6. Workstation output appends to the manuscript and restores a pending revision first.
  run("state.ui.text.value='第一段。\\n第二段。'; state.ui.text.dirty=false; appendToTextPanel('工作站结果');");
  assert.equal(run('state.ui.text.value'), '第一段。\n第二段。\n\n工作站结果');
  assert.equal(run('state.ui.text.dirty'), true);
  assert.equal(run('state.db.state.textPanel.value'), '第一段。\n第二段。\n\n工作站结果');
  run(`state.ui.text.value='第一段。\\n改过的第二段。';
    state.ui.text.pending={start:0,end:state.ui.text.value.length,text:'第一段。\\n改过的第二段。',
      original:'第一段。\\n第二段。',head:'',tail:'',revision:true};
    appendToTextPanel('新内容');`);
  assert.equal(run('state.ui.text.value'), '第一段。\n第二段。\n\n新内容');
  assert.equal(run('state.ui.text.pending'), null);
  console.log('PASS: workstation output appends and restores a pending revision first');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
