// AI 工作站：模型与推理强度菜单挨着「开始生成」，并且真的随请求发出去。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({
  i18n: { t: (key, params) => key + (params ? JSON.stringify(params) : '') },
  window: { addEventListener() {} },
  setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame() {},
  document: {
    querySelector: () => null, getElementById: () => null,
    createElementNS: () => ({ setAttribute() {}, appendChild() {}, style: {}, classList: { add() {} } }),
    createElement: () => ({ setAttribute() {}, appendChild() {}, style: {}, classList: { add() {} } })
  }, Blob, AbortController
});
for (const file of ['core', 'workstation']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/novelhelper/web/' + file + '.js'), 'utf8'), context);
}
const run = code => vm.runInContext(code, context);

run(`
  h = (tag, props, ...children) => {
    const el = {tag, props:props || {}, value:props?.value || '', checked:!!props?.checked,
      children:children.flat(Infinity).filter(child => child != null && child !== false),
      selectionStart:0, selectionEnd:0, textContent:'', isConnected:true,
      classList:{add(){}, remove(){}, toggle(){}, contains(){return false;}},
      appendChild(node){this.children.push(node); return node;},
      insertBefore(node){this.children.unshift(node); return node;},
      append(...nodes){this.children.push(...nodes);}, remove(){}, focus(){}, setAttribute(name, value){this.attrs=this.attrs||{}; this.attrs[name]=value;},
      getAttribute(name){return (this.attrs||{})[name];}, addEventListener(){}, setSelectionRange(start,end){this.selectionStart=start; this.selectionEnd=end;},
      querySelectorAll(){return [];}};
    Object.defineProperty(el, 'firstChild', {get(){return el.children[0] || null;}});
    return el;
  };
  clear = node => {node.children=[];}; touch=()=>{}; toast=()=>{}; status=()=>{};
  saveNow=async()=>{}; refreshFiles=async()=>{}; flushPendingSaves=async()=>{};
  refreshWorkstationHistory=async()=>{}; renderNav=()=>{}; renderMain=()=>{}; openSettings=()=>{};
  defaultModelName=()=>'m1'; currentModels=()=>['m1','m2']; effortChoices=()=>['none','low','medium','high','max'];
  globalThis.nodes = node => [node, ...(Array.isArray(node.children) ? node.children
    .filter(child => child && typeof child === 'object' && Array.isArray(child.children))
    .flatMap(nodes) : [])];
  globalThis.draw = () => {globalThis.main=h('main'); viewWorkstation(main);};
  globalThis.find = predicate => nodes(main).find(predicate);
  state.activeNovelId='novel-a'; state.ui={}; state.paths={};
  state.db={state:{}, config:{writing:{target_chars:1000}}, modes:{items:[{id:'draft',label:'完整写作',kind:'write'}]}};
  globalThis.requests = [];
  streamWorkstation = async body => {
    requests.push({body});
    return {clean_text:'生成结果', text:'生成结果', mode_id:'draft', session_id:'s1',
      session:{id:'s1', title:'新对话', turns:[]}, model:'m2', effort:'max'};
  };
  draw();`);

// 1. 模型菜单和「开始生成」在同一个组里，模型在左、开始按钮在右。
const group = run("find(node=>node.props.class==='agent-send-group')");
assert.ok(group, 'send group must exist');
assert.equal(group.children.length, 2);
assert.equal(group.children[0].tag, 'details');
assert.equal(group.children[0].props.class, 'agent-model');
assert.equal(group.children[1].props.text, 'workstation.start');
assert.equal(run("find(node=>node.props.class==='agent-send-group').children[1].props.class"),
  'primary agent-send');
assert.equal(run(`(()=>{ const controls=find(node=>node.props.class==='agent-controls');
  return controls.children[controls.children.length-1].props.class; })()`), 'agent-send-group');
console.log('PASS: the model menu sits immediately left of the start button');

// 2. 菜单里先列模型、再列推理强度，默认模型有选中标记。
run("globalThis.menuNodes = nodes(find(node=>node.props.class==='agent-model'));");
const labels = run("menuNodes.filter(node=>node.props.class==='agent-menu-label').slice(0,2).map(node=>node.props.text).join(',')");
assert.equal(labels, 'workstation.model_label,workstation.effort_label');
const items = run("menuNodes.filter(node=>node.props.class && String(node.props.class).indexOf('agent-model-item')===0).slice(0,3).map(node=>node.props.text).join(',')");
assert.equal(items, 'm1,m2,none');
assert.equal(run("menuNodes.find(node=>node.props.text==='m1').props['aria-checked']"), 'true');
console.log('PASS: the menu lists models first, then reasoning effort');

// 3. 选模型与推理强度会记住；下次生成把它们一起发给服务端。
run("menuNodes.find(node=>node.props.text==='m2').props.onclick();");
assert.equal(run('wsState().selection.model'), 'm2');
assert.equal(run('state.db.state.workstation.selection.model'), 'm2');
run("globalThis.menuNodes2 = nodes(find(node=>node.props.class==='agent-model'));");
run("menuNodes2.find(node=>node.props.text==='max').props.onclick();");
assert.equal(run('wsState().selection.effort'), 'max');
assert.equal(run('state.db.state.workstation.selection.effort'), 'max');
assert.equal(run("nodes(find(node=>node.props.class==='agent-model')).find(node=>node.props.class==='agent-model-effort').textContent"),
  'max');
console.log('PASS: choosing a model and an effort level is remembered');

run("wsState().prompt='写一段雨夜';");
(async () => {
  await run('runWorkstation()');
  const body = run('requests[0].body');
  assert.equal(body.surface, 'workstation');
  assert.deepEqual(JSON.parse(JSON.stringify(body.override)), {model: 'm2', effort: 'max'});
  assert.equal(body.prompt, '写一段雨夜');
  assert.equal(run('state.db.state.workstation.output'), '生成结果');
  console.log('PASS: the request carries both the model and the effort override');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
