// Regression checks for empty-conversation reuse; no user data or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({i18n: {t: key => key}, window: {addEventListener() {}},
  document: {querySelector: () => ({focus() {}})}});
for (const file of ['core', 'workstation']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/novelhelper/web/' + file + '.js'), 'utf8'), context);
}
const run = code => vm.runInContext(code, context);
run(`workModes = () => [{id:'draft'}]; touch = () => {}; toast = () => {};
  flushPendingSaves = async () => {}; refreshWorkstationHistory = async () => {};
  go = () => {}; globalThis.requests = [];
  api = async (url, options) => { requests.push({url, options}); return {session:{id:'new-session',turns:[]}}; };`);
function reset(ws, session) {
  context.fixture = {ws, session};
  run(`state.db = {state:{workstation:fixture.ws}}; state.ui = {currentSession:fixture.session}; requests.length=0;`);
}
(async () => {
  reset({mode:'draft'}, null);
  await run('newConversation()');
  assert.equal(run('requests.length'), 0, 'An untouched workspace must not create a session');
  reset({mode:'draft',current_session:'empty',prompt:'  ',output:''}, {id:'empty',turns:[]});
  await run('newConversation()');
  assert.equal(run('requests.length'), 0, 'Reuse the current empty conversation');
  assert.equal(run('wsState().current_session'), 'empty');
  reset({mode:'draft',current_session:'draft',prompt:'Unsent draft'}, {id:'draft',turns:[]});
  await run('newConversation()');
  assert.equal(run('requests.length'), 1, 'A nonempty draft permits a new conversation');
  assert.equal(run('wsState().drafts.draft'), 'Unsent draft');
  assert.equal(run('wsState().prompt'), '');
  reset({mode:'draft',current_session:'written'}, {id:'written',turns:[{output:'Earlier result'}]});
  await run('newConversation()');
  assert.equal(run('requests.length'), 1, 'Existing turns count as conversation content');
  reset({mode:'draft',prompt:'Keep'}, null);
  run('state.ui.busy = true');
  await run('newConversation()');
  assert.equal(run('requests.length'), 0);
  assert.equal(run('wsState().prompt'), 'Keep');
  console.log('PASS: empty conversations are reused, existing turns and drafts allow new conversations, drafts survive, and busy work is guarded');
})().catch(error => {console.error(error); process.exitCode=1;});
