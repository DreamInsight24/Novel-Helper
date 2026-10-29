const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const ctx=vm.createContext({i18n:{t:key=>key},window:{addEventListener(){}}});
for(const file of ['core','workstation'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/novelhelper/web/'+file+'.js'),'utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);
run(`touch=()=>{};workModes=()=>[{id:'draft'}];
state.db={sections:{items:[{key:'world',on:true},{key:'hidden',on:false}],builtins:{world:{on:false}}},
characters:{items:[{id:'c1',name:'Character'}]},factions:{items:[{id:'f1',name:'Faction'}]},
section_world:{items:[{id:'w1',name:'World'}]},section_hidden:{items:[{id:'h1',name:'Hidden'}]},
items:{items:[{id:'i1',name:'Item'}]},state:{workstation:{mode:'draft',extra:'Notes',work_prompt:'Requirements',current_state:'Old state',
selection:{include:{characters:true,world:true,factions:true,memory:false,worldmap:true,state:true},character_ids:['c1'],world_ids:['w1','h1']}}}};`);
assert.equal(run(`wsSettingChoices().find(choice=>choice.id==='worldmap').visible`),false);
assert.equal(run(`wsSettingChoices().find(choice=>choice.id==='section_hidden').visible`),false);
assert.equal(run(`wsSettingChoices().find(choice=>choice.id==='memories').visible`),true);
run('globalThis.sent=wsSelection()');
assert.equal(run('sent.extra'),'Notes\n\nRequirements');
assert.equal(run('wsSelection().extra'),'Notes\n\nRequirements','Re-render must not duplicate the supplement');
assert.equal(run('sent.current_state'),'');assert.equal(run('sent.work_prompt'),'');
assert.equal(run('sent.include.state'),false);
assert.equal(run('sent.include.worldmap'),false,'Hidden whole-map legacy switches are not default choices');
assert.equal(run('sent.record_selections.characters[0]'),'c1');
assert.equal(run('sent.record_selections.factions[0]'),'f1');
assert.equal(run(`sent.setting_categories.includes('section_hidden')`),true,'Explicit legacy hidden entries survive migration');
run(`const sel=wsDetailedSelection(wsState());toggleId(sel.setting_categories,'section_hidden',false);
sel.record_selections.items=['i1'];toggleId(sel.setting_categories,'items',true);globalThis.changed=wsSelection();`);
assert.equal(run(`changed.setting_categories.includes('section_hidden')`),false);
assert.equal(run(`changed.setting_categories.includes('items')`),true);
assert.equal(run('changed.record_selections.items[0]'),'i1');
console.log('PASS: sidebar defaults, more settings, legacy selection preservation, explicit categories, merged supplement and removed current state');
