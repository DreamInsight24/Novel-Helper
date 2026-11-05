// Manuscript page behavior without a browser: chapter bar, AI chat, in-place edit review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  i18n: { t: (key, params) => key + (params ? JSON.stringify(params) : '') },
  window: { addEventListener() {} },
  setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {}, document: {}, Blob, AbortController
});
for (const file of ['core', 'workstation', 'manuscript']) {
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
  clear = node => {node.children=[];}; touch=()=>{}; toast=()=>{}; status=()=>{}; saveNow=async()=>{};
  refreshFiles=async()=>{}; openSettings=()=>{}; defaultModelName=()=>'test-model';
  currentModels=()=>['test-model']; effortChoices=()=>['none','low','medium','high','max'];
  modal=(title, body, buttons) => {globalThis.lastModal={title,body,buttons};return {close(){},dlg:{classList:{add(){}}}};};
  globalThis.nodes = node => [node, ...node.children.filter(child=>typeof child==='object').flatMap(nodes)];
  globalThis.draw = () => {globalThis.main=h('main'); viewManuscript(main);};
  renderMain = () => draw();
  globalThis.editor = () => nodes(main).find(node=>node.tag==='textarea' && node.props['aria-label']==='manuscript.editor_label');
  globalThis.find = (predicate) => nodes(main).find(predicate);
  state.activeNovelId='novel-a';
  state.db={state:{textPanel:{value:'甲乙丙丁'}},modes:{items:[{id:'polish',label:'润色修订',kind:'process',effort:'medium'}]}};
  state.ui = {}; state.paths={}; state.io={files:[]};
  globalThis.requests = [];
  streamWorkstation = async (body, signal, onDelta) => {
    requests.push({body});
    onDelta(globalThis.nextText);
    return {clean_text: globalThis.nextText};
  };
  globalThis.nextText = '改写后的文字';
  draw();`);

// 1. The page no longer shows a material shelf; the draft is untouched.
assert.equal(run('editor().value'), '甲乙丙丁');
assert.equal(run("nodes(main).some(node=>node.props.class==='material-shelf')"), false);
assert.equal(run('state.ui.text.materials === undefined'), true);

// 2. The chapter bar can be collapsed and the choice is persisted in the draft.
assert.equal(run("nodes(main).some(node=>node.props.class==='chapter-bar')"), true);
run("find(node=>node.props.class==='chapter-bar-head').props.onclick();");
assert.equal(run('state.ui.text.chapterCollapsed'), true);
assert.equal(run('state.db.state.textPanel.chapterCollapsed'), true);
assert.equal(run("nodes(main).some(node=>node.props.class==='chapter-bar-list')"), false);
console.log('PASS: no material shelf, draft intact, chapter bar collapses and persists');

// 3. AI assist opens as a docked conversation, not a modal.
run("find(node=>String(node.props.class||'').indexOf('manuscript-ai-toggle')>=0).props.onclick();");
assert.equal(run("typeof lastModal === 'undefined'"), true);
assert.equal(run("nodes(main).some(node=>node.props.class==='manuscript-agent')"), true);
assert.equal(run("nodes(main).some(node=>node.props.class==='manuscript-agent-input')"), true);
assert.equal(run('state.db.state.textPanel.assistant'), true);
console.log('PASS: AI assist is a docked conversation panel');

(async () => {
  // 4. A request rewrites only the selection and lands as a pending edit.
  run(`editor().setSelectionRange(1,3); editor().props.onselect();
    globalThis.nextText = '改';
    find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'把这段改得更紧张'}});
    globalThis.send = find(node=>node.props.text==='manuscript.ai_send').props.onclick();`);
  await run('send');
  assert.equal(run('requests.length'), 1);
  assert.equal(run('requests[0].body.surface'), 'manuscript');
  assert.equal(run('requests[0].body.mode_id'), 'polish');
  assert.equal(run('requests[0].body.source_text'), '乙丙');
  assert.equal(run('requests[0].body.prompt'), '把这段改得更紧张');
  assert.equal(run('state.ui.text.value'), '甲改丁');
  assert.equal(run('state.ui.text.pending && state.ui.text.pending.status'), 'done');
  assert.equal(run('state.ui.text.chat.length'), 2);
  assert.equal(run('state.ui.text.chat[1].status'), 'review');
  assert.equal(run('state.ui.text.chat[1].original'), '乙丙');
  assert.equal(run('state.db.state.textPanel.pending && state.db.state.textPanel.pending.text'), '改');
  console.log('PASS: rewrite targets the selection, streams into the text, and waits for review');

  // 5. Keep commits the edit with an undo entry and saves the draft.
  run("find(node=>node.props.text==='manuscript.ai_keep').props.onclick();");
  assert.equal(run('state.ui.text.pending'), null);
  assert.equal(run('state.ui.text.dirty'), true);
  assert.equal(run('state.ui.text.undo.length'), 1);
  assert.equal(run('state.ui.text.undo[0].value'), '甲乙丙丁');
  assert.equal(run('state.ui.text.chat[1].status'), 'applied');
  assert.equal(run("'pending' in state.db.state.textPanel"), false);
  console.log('PASS: keep commits the rewrite and records an undo point');

  // 6. Undo restores the pre-edit text.
  run("find(node=>node.props.text==='manuscript.undo').props.onclick();");
  assert.equal(run('state.ui.text.value'), '甲乙丙丁');
  console.log('PASS: undo reverts an accepted rewrite');

  // 7. Whole-document rewrite can be rolled back; the chat records it.
  run(`editor().setSelectionRange(0,0); editor().props.onselect();
    find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'重写全文'}});
    globalThis.nextText = '全文新版本'; globalThis.send = find(node=>node.props.text==='manuscript.ai_send').props.onclick();`);
  await run('send');
  assert.equal(run('state.ui.text.value'), '全文新版本');
  assert.equal(run('requests[1].body.source_text'), '甲乙丙丁');
  run("find(node=>node.props.text==='manuscript.ai_revert').props.onclick();");
  assert.equal(run('state.ui.text.value'), '甲乙丙丁');
  assert.equal(run('state.ui.text.pending'), null);
  assert.equal(run('state.ui.text.chat[3].status'), 'reverted');
  assert.equal(run("'pending' in state.db.state.textPanel"), false);
  console.log('PASS: revert restores the original text and keeps the conversation');

  // 8. A pending rewrite survives a page re-render (chat + highlighted edit restored).
  run(`find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'再来一次'}});
    globalThis.nextText = '再来一次'; globalThis.send = find(node=>node.props.text==='manuscript.ai_send').props.onclick();`);
  await run('send');
  run('draw();');
  assert.equal(run('state.ui.text.pending !== null'), true);
  assert.equal(run('state.ui.text.value'), '再来一次');
  run("find(node=>node.props.text==='manuscript.ai_keep').props.onclick();");
  assert.equal(run('state.ui.text.pending'), null);
  assert.equal(run('state.ui.text.value'), '再来一次');
  console.log('PASS: pending rewrites survive re-rendering');

  // 9. The AI panel has its own model + effort menu, and both reach the request.
  run(`draw();
    globalThis.panelMenu = nodes(find(node=>node.props.class==='manuscript-agent'))
      .find(node=>node.props.class==='agent-model');
    globalThis.panelItems = nodes(panelMenu)
      .filter(node=>node.props.class && String(node.props.class).indexOf('agent-model-item')===0);`);
  assert.equal(run("panelItems.slice(0,2).map(node=>node.props.text).join(',')"), 'test-model,none');
  assert.equal(run("nodes(panelMenu).filter(node=>node.props.class==='agent-menu-label').slice(0,2).map(node=>node.props.text).join(',')"),
    'workstation.model_label,workstation.effort_label');
  run("panelItems.find(node=>node.props.text==='test-model').props.onclick();");
  run("panelItems.find(node=>node.props.text==='high').props.onclick();");
  assert.equal(run('state.ui.text.model'), 'test-model');
  assert.equal(run('state.ui.text.effort'), 'high');
  assert.equal(run('state.db.state.textPanel.effort'), 'high');
  run(`editor().setSelectionRange(0,2); editor().props.onselect();
    find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'再润一次'}});
    globalThis.nextText = '定稿'; globalThis.send = find(node=>node.props.text==='manuscript.ai_send').props.onclick();`);
  await run('send');
  const body = run('requests[requests.length-1].body');
  assert.equal(body.override.model, 'test-model');
  assert.equal(body.override.effort, 'high');
  assert.equal(run('state.ui.text.chat[state.ui.text.chat.length-1].effort'), 'high');
  run("find(node=>node.props.text==='manuscript.ai_keep').props.onclick();");
  console.log('PASS: the AI panel sends the chosen model and effort override');

  // 10. Workstation output is appended to the manuscript instead of a material shelf.
  run("state.ui.text.value='甲乙丙丁'; state.ui.text.dirty=false; appendToTextPanel('工作站结果');");
  assert.equal(run('state.ui.text.value'), '甲乙丙丁\n\n工作站结果');
  assert.equal(run('state.ui.text.dirty'), true);
  assert.equal(run('state.db.state.textPanel.value'), '甲乙丙丁\n\n工作站结果');
  run(`state.ui.text.value='甲X丁';
    state.ui.text.pending={start:1,end:2,text:'X',original:'乙',head:'甲',tail:'丁'};
    appendToTextPanel('新内容');`);
  assert.equal(run('state.ui.text.value'), '甲乙丁\n\n新内容');
  assert.equal(run('state.ui.text.pending'), null);
  console.log('PASS: workstation output appends to the manuscript and restores pending edits first');

  // 11. While the rewrite is still streaming, keep/revert stay out of reach.
  run(`globalThis.finishStream = null;
    streamWorkstation = async (body, signal, onDelta) => {
      onDelta('流式中的文字');
      return new Promise(resolve => { globalThis.finishStream = () => resolve({clean_text:'流式中的文字'}); });
    };
    state.ui.text.value='甲乙丙丁';
    editor().setSelectionRange(0,2); editor().props.onselect();
    find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'流式测试'}});
    globalThis.send = find(node=>node.props.text==='manuscript.ai_send').props.onclick();`);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run('state.ui.text.pending && state.ui.text.pending.status'), 'streaming');
  assert.equal(run("find(node=>node.props.text==='manuscript.ai_keep').hidden"), true);
  assert.equal(run("find(node=>node.props.text==='manuscript.ai_revert').hidden"), true);
  assert.equal(run("nodes(main).find(node=>node.props.class==='manuscript-edit-title').textContent"), 'manuscript.ai_writing');
  run('finishStream();');
  await run('send');
  assert.equal(run('state.ui.text.pending && state.ui.text.pending.status'), 'done');
  assert.equal(run("find(node=>node.props.text==='manuscript.ai_keep').hidden"), false);
  assert.equal(run("nodes(main).find(node=>node.props.class==='manuscript-edit-title').textContent"), 'manuscript.ai_pending_hint');
  console.log('PASS: keep/revert only appear once the rewrite finishes');

  // 12. A failed rewrite leaves the text untouched and puts the request back.
  run("find(node=>node.props.text==='manuscript.ai_revert').props.onclick();");
  assert.equal(run('state.ui.text.value'), '甲乙丙丁');
  run(`streamWorkstation = async () => { throw new Error('网络断了'); };
    editor().setSelectionRange(0,2); editor().props.onselect();
    find(node=>node.props.class==='manuscript-agent-input').props.oninput({target:{value:'失败的尝试'}});
    globalThis.send = find(node=>node.props.text==='manuscript.ai_send').props.onclick();`);
  await run('send');
  assert.equal(run('state.ui.text.chat[state.ui.text.chat.length-1].status'), 'error');
  assert.equal(run('state.ui.text.chat[state.ui.text.chat.length-1].error'), '网络断了');
  assert.equal(run('state.ui.text.value'), '甲乙丙丁');
  assert.equal(run('state.ui.text.pending'), null);
  assert.equal(run('state.ui.text.assistantPrompt'), '失败的尝试');
  assert.equal(run("find(node=>node.props.class==='manuscript-agent-input').value"), '失败的尝试');
  console.log('PASS: a failed rewrite keeps the text and restores the request');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
