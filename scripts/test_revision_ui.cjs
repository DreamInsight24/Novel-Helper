// Polish agent UI: wish -> requirement card -> sample -> final diff -> accept/rollback.
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
  globalThis.byText = (value) => nodes(main).find(node=>node.props.text===value && node.props.onclick);
  globalThis.sendButton = () => nodes(main).find(node=>node.props.onclick && String(node.props.class||'').includes('agent-send') && String(node.props.class||'').includes('primary'));
  state.activeNovelId='novel-a';
  state.db={state:{textPanel:{value:'第一段。\\n\\n第二段。'}},
            modes:{items:[{id:'polish',label:'润色修订',kind:'process',effort:'medium'}]}};
  state.ui = {}; state.paths={}; state.io={files:[]};
  globalThis.bodies=[];
  globalThis.nextView=null;
  streamRevision = async (body) => { bodies.push(body); return nextView; };
  api = async () => ({session: nextView});
  globalThis.baseDoc = '第一段。\\n\\n第二段。';
  globalThis.v = (overrides={}) => Object.assign({
    id:'rev_1', title:'润色修订 · 第三章', state:'LOCATE', accepted:false, auto_step:'sample',
    doc:{text:baseDoc, original_text:baseDoc, path:'text/ch.md', chapter:'第三章', chars:baseDoc.length, count:2},
    scope:{kind:'chapter', count:2, paragraph_ids:['p_001','p_002']},
    options:{sample_first:true}, card:{goal:'更紧张', style:'短句', preserve:['人物称呼'], forbidden:['新增人物'],
      sample_first:true, max_rounds:5, scope:{}}, preview:'改本章 2 段：更紧张。',
    question:null, plan:{targets:[{paragraph_id:'p_001',direction:'短句',priority:'high'}]},
    sample:null, changes:[], review:null, stop:null, warnings:[], rounds:[],
    versions:[{index:0,label:'original',source:'original',chars:baseDoc.length}],
    messages:[], stats:{rounds:0,changes:0,chars:baseDoc.length}
  }, overrides);
  draw();`);

(async () => {
  // 1. Switch the docked panel to the revision agent.
  run("find(node=>String(node.props.class||'').indexOf('manuscript-ai-toggle')>=0).props.onclick();");
  run("byText('revision.mode_agent').props.onclick();");
  assert.equal(run('state.ui.text.agentMode'), 'revision');
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-flow')"), true);
  assert.equal(run("nodes(main).find(node=>node.props.class==='manuscript-agent-title').children[0].props.text"),
    'revision.panel_title');
  console.log('PASS: revision agent is a mode of the docked panel');

  // 2. A wish is sent as a plan request with the document and selection scope.
  run(`editor().setSelectionRange(0,2); editor().props.onselect();
    find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'把开头改得紧张一点'}});
    globalThis.nextView = v({});
    globalThis.send = byText('revision.send').props.onclick();`);
  await run('send');
  assert.equal(run("bodies[bodies.length-1].step"), 'plan');
  assert.equal(run("bodies[bodies.length-1].source_text"), run('baseDoc'));
  assert.equal(run("bodies[bodies.length-1].selection.start"), 0);
  assert.equal(run("bodies[bodies.length-1].selection.end"), 2);
  assert.equal(run("bodies[bodies.length-1].model"), 'test-model');
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-card')"), true);
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-card-preview')"), true);
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-progress')"), false);
  console.log('PASS: wish becomes a requirement card and a plan request');

  // 3. Sample-first: run one paragraph, show its diff, keep the editor unchanged.
  run("nextView = v({state:'USER_CONFIRM_SAMPLE', auto_step:'sample_choice', sample:{paragraph_id:'p_001',status:'pending',original:'第一段。',revised:'第一段，更紧张。',stats:{added:5,removed:0,total:5},diff:[{op:'equal',text:'第一段'},{op:'insert',text:'，更紧张'},{op:'equal',text:'。'}]}}); byText('revision.card.start_sample').props.onclick();");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run("bodies[bodies.length-1].step"), 'sample');
  assert.equal(run("editor().value"), run('baseDoc'));
  assert.equal(run("editor().readOnly"), false);
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-diff-box')"), true);
  assert.equal(run("nodes(main).some(node=>node.tag==='ins')"), true);
  console.log('PASS: the sample diff appears before anything is applied');

  // 4. Accepting the sample applies the whole document as a reviewable pending edit.
  run(`nextView = v({state:'USER_CONFIRM_FINAL', auto_step:'', doc:{text:'第一段，更紧张。\\n\\n第二段。',original_text:baseDoc,path:'text/ch.md',chapter:'第三章',chars:11,count:2},
    changes:[{paragraph_id:'p_001',before:'第一段。',after:'第一段，更紧张。',stats:{added:5,removed:0,total:5},diff:[{op:'delete',text:'第一段。'},{op:'insert',text:'第一段，更紧张。'}]}],
    review:{pass:false,issues:[{paragraph_id:'p_001',type:'style',problem:'仍偏书面',suggestion:'再短一点'}],next_instruction:'把 p_001 改得更短',layers:{local:{pass:false},consistency:{pass:true}}},
    stop:{reason:'hard_limit',options:['accept_current','change_strategy','manual_issues']},
    versions:[{index:0,label:'original',source:'original',chars:9},{index:1,label:'第 1 轮',source:'round',chars:11}],
    rounds:[{round:1,cycle:1,issues:[{paragraph_id:'p_001',type:'style',problem:'仍偏书面'}],stop_reason:'hard_limit',changes:[{paragraph_id:'p_001',stats:{added:5}}]}]});
    byText('revision.sample.accept').props.onclick();`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run("bodies[bodies.length-1].step"), 'sample_choice');
  assert.equal(run("bodies[bodies.length-1].choice"), 'accept');
  assert.equal(run("editor().value"), '第一段，更紧张。\n\n第二段。');
  assert.equal(run("state.ui.text.pending && state.ui.text.pending.revision"), true);
  assert.equal(run("state.ui.text.pending.ranges.length"), 1);
  assert.equal(run("nodes(main).find(node=>node.props.class==='manuscript-edit-bar').hidden"), true);
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-review')"), true);
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-stop')"), true);
  assert.equal(run("nodes(main).some(node=>node.tag==='del')"), true);
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-history')"), true);
  console.log('PASS: batch diff, review issues and stop options render as review cards');

  // 5. Keeping the version ends the session and records an undo point.
  run("nextView = v({state:'DONE', accepted:true, auto_step:'', doc:{text:'第一段，更紧张。\\n\\n第二段。',original_text:baseDoc,path:'text/ch.md',chapter:'第三章',chars:11,count:2}, changes:[{paragraph_id:'p_001',before:'第一段。',after:'第一段，更紧张。',stats:{added:5,removed:0,total:5},diff:[]}], versions:[{index:0,label:'original',source:'original',chars:9},{index:1,label:'已保留',source:'accept',chars:11}]}); byText('revision.apply').props.onclick();");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run("bodies[bodies.length-1].step"), 'accept');
  assert.equal(run('state.ui.text.pending'), null);
  assert.equal(run("state.ui.text.undo.length"), 1);
  assert.equal(run("state.ui.text.undo[0].value"), run('baseDoc'));
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-accepted')"), true);
  console.log('PASS: accepting the final version ends the session and stays undoable');

  // 6. Rolling back restores the original text.
  run("nextView = v({state:'USER_CONFIRM_FINAL', accepted:false, auto_step:'', changes:[], versions:[{index:0,label:'original',source:'original',chars:9},{index:1,label:'已回滚到第 0 版',source:'rollback',chars:9}]}); byText('revision.rollback').props.onclick();");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run("bodies[bodies.length-1].step"), 'rollback');
  assert.equal(run("bodies[bodies.length-1].previous"), true);
  assert.equal(run("editor().value"), run('baseDoc'));
  assert.equal(run('state.ui.text.pending'), null);
  console.log('PASS: rollback restores the previous version');

  // 7. Increment: a follow-up wish continues the same session; a question waits for an option.
  run(`state.ui.text.agentMode='revision'; draw();`);
  await new Promise(resolve => setImmediate(resolve));
  run(`find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'再把最后一句改冷静'}});
    nextView = v({state:'LOCATE', auto_step:'', question:{text:'想更冷静还是更疏离？',options:[{id:'calm',label:'更冷静'},{id:'distant',label:'更疏离'}]}, warnings:[{code:'out_of_scope',count:2}]});
    globalThis.send = sendButton().props.onclick();`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run("bodies[bodies.length-1].step"), 'increment');
  assert.equal(run("bodies[bodies.length-1].session_id"), 'rev_1');
  assert.equal(run("nodes(main).some(node=>node.props.class==='revision-question')"), true);
  assert.equal(run("nodes(main).some(node=>node.props.text==='revision.warn.out_of_scope{\"count\":2}')"), true);
  run(`nextView = v({state:'USER_CONFIRM_FINAL', auto_step:'', changes:[{paragraph_id:'p_001',before:'第一段。',after:'更紧张。',stats:{added:4,removed:0,total:4},diff:[]}], doc:{text:'更紧张。\\n\\n第二段。',original_text:baseDoc,path:'text/ch.md',chapter:'第三章',chars:8,count:2}});
    byText('更冷静').props.onclick();`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run("bodies[bodies.length-1].step"), 'answer');
  assert.equal(run("bodies[bodies.length-1].option_id"), 'calm');
  console.log('PASS: incremental wishes reuse the session and answers become options');

  // 8. Reload restores the revision session and its pending diff.
  run(`state.ui.text = null;
    state.db.state.textPanel = {value:'第一段。\\n\\n第二段。', assistant:true, agentMode:'revision', revisionId:'rev_1'};
    nextView = v({state:'USER_CONFIRM_FINAL', auto_step:'', doc:{text:'第一段，更紧张。\\n\\n第二段。',original_text:baseDoc,path:'text/ch.md',chapter:'第三章',chars:11,count:2},
      changes:[{paragraph_id:'p_001',before:'第一段。',after:'第一段，更紧张。',stats:{added:5,removed:0,total:5},diff:[]}]});
    draw();`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run("state.ui.text.revisionId"), 'rev_1');
  assert.equal(run("editor().value"), '第一段，更紧张。\n\n第二段。');
  assert.equal(run("state.ui.text.pending && state.ui.text.pending.revision"), true);
  console.log('PASS: reload restores the revision session and its pending diff');

  console.log('\nAll revision UI checks passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
