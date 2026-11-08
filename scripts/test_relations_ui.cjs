const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({i18n:{t:key=>key},window:{addEventListener(){}}});
for(const f of ['core','records','relations'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/novelhelper/web/'+f+'.js'),'utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);
run(`state.db={sections:{items:[]},characters:{items:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]},factions:{items:[{id:'o',name:'O'}]},
 relations:{items:[
 {id:'ao',source:{collection:'characters',id:'a'},target:{collection:'factions',id:'o'},type:'隶属'},
 {id:'bo',source:{collection:'characters',id:'b'},target:{collection:'factions',id:'o'},type:'隶属'},
 {id:'ab',source:{collection:'characters',id:'a'},target:{collection:'characters',id:'b'},type:'认识',directed:false},
 {id:'co',source:{collection:'characters',id:'c'},target:{collection:'factions',id:'o'},type:'隶属'}]}};
 globalThis.center={collection:'characters',id:'a'};
 globalThis.graph=relationVisibleGraph(center,[]);`);
assert.equal(run('graph.nodes.length'),3,'Only direct neighbors appear initially');
assert.equal(run('graph.edges.length'),3,'The common organization closes the triangle');
assert.equal(run("graph.nodes.filter(n=>n.id==='o').length"),1,'A shared target is one node');
run(`graph=relationVisibleGraph(center,['factions:o']);globalThis.layout=relationLayout(graph.nodes,graph.edges,relationKey(center));`);
assert.equal(run('graph.nodes.length'),4,'Expanding an organization adds its other members');
assert.equal(run('layout[relationKey(center)].x'),390);
assert.equal(run('layout[relationKey(center)].y'),245);
assert.equal(run('Object.values(layout).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))'),true);
run(`touch=()=>{};relationSyncLocal();`);
assert.equal(run('state.db.factions.items[0].members.join(",")'),'a,b,c','Legacy membership is a projection');
console.log('PASS: one shared node, closed cycles, one-hop expansion, centered layout and membership projection');

run(`state.db.characters.items.push({id:'d',name:'D'});state.db.relations.items.push({id:'cd',source:{collection:'characters',id:'c'},target:{collection:'characters',id:'d'},type:'knows'});
 graph=relationVisibleGraph(center,['characters:c']);`);
assert.equal(run('graph.nodes.length'),3,'An unreachable expanded branch cannot leak into the graph');
run(`graph=relationVisibleGraph(center,['characters:c','factions:o']);`);
assert.equal(run('graph.nodes.length'),5,'Reachable nested expansions resolve regardless of expansion order');
console.log('PASS: collapsing a parent hides detached branches');

// Dispatch pointer events without releasing the pointer: paths and labels must already follow.
run(`
 class GraphElement {
   constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.dataset={};this.captures=new Set();this.style={};
     this.classList={toggle:(key,on)=>{const parts=new Set((this.attrs.class||'').split(' ').filter(Boolean));on?parts.add(key):parts.delete(key);this.attrs.class=[...parts].join(' ');}};}
   remove(){if(globalThis.document?.body)globalThis.document.body.children=globalThis.document.body.children.filter(child=>child!==this);}
   setAttribute(key,value){this.attrs[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5)]=String(value);}
   getAttribute(key){return this.attrs[key];}
   addEventListener(key,fn){(this.events[key]=this.events[key]||[]).push(fn);}
   appendChild(node){this.children.push(node);return node;}
   append(...nodes){nodes.forEach(node=>this.appendChild(node));}
   querySelectorAll(selector){const cls=selector.slice(1);return this.children.flatMap(child=>[
     ...((child.attrs?.class||'').split(' ').includes(cls)?[child]:[]),...(child.querySelectorAll?child.querySelectorAll(selector):[])]);}
   closest(selector){return (this.attrs.class||'').split(' ').includes(selector.slice(1))?this:null;}
   setPointerCapture(id){this.captures.add(id);}
   hasPointerCapture(id){return this.captures.has(id);}
   releasePointerCapture(id){this.captures.delete(id);}
   getScreenCTM(){return {inverse:()=>({a:.5,d:.5,e:-10,f:-20})};}
   createSVGPoint(){return {x:0,y:0,matrixTransform(matrix){return {x:this.x*matrix.a+matrix.e,y:this.y*matrix.d+matrix.f};}};}
 }
 globalThis.document={createElementNS:(ns,tag)=>new GraphElement(tag),createTextNode:text=>({textContent:text,children:[]}),
   body:new GraphElement('body'),addEventListener(){}};
 globalThis.setTimeout=()=>0;
 h=(tag,props,...children)=>{const node=new GraphElement(tag);for(const [key,value]of Object.entries(props||{})){
   if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else node.setAttribute(key,value);
 }children.flat(Infinity).filter(child=>child!=null&&child!==false).forEach(child=>node.appendChild(child));return node;};
 clear=node=>{node.children=[];};
 globalThis.graphView=relationGraph(center,relationCatalog());
 globalThis.nodeB=graphView.querySelectorAll('.relation-node').find(node=>node.dataset.key==='characters:b');
 globalThis.edgeAB=graphView.querySelectorAll('.relation-edge').find(node=>node.dataset.source==='characters:a'&&node.dataset.target==='characters:b');
 globalThis.pathAB=edgeAB.children.find(node=>node.tag==='path');
 globalThis.labelAB=edgeAB.children.find(node=>node.tag==='text');
 globalThis.oldPath=pathAB.getAttribute('d');globalThis.oldLabel=labelAB.getAttribute('x');
 globalThis.positionB=state.ui.relationGraphs['characters:a'].positions['characters:b'];
 globalThis.startX=positionB.x;
 globalThis.pointer=(type,x,y)=>nodeB.events[type].forEach(fn=>fn({pointerId:7,button:0,clientX:x,clientY:y,target:nodeB,stopPropagation(){}}));
 pointer('pointerdown',100,100);pointer('pointermove',180,140);
`);
assert.notEqual(run("pathAB.getAttribute('d')"),run('oldPath'),'Line must update before pointerup');
assert.notEqual(run("labelAB.getAttribute('x')"),run('oldLabel'),'Relationship text must update during drag');
assert.equal(run('positionB.x-startX'),40,'Screen transform must account for CSS size, pan and zoom');
run(`globalThis.finalPath=pathAB.getAttribute('d');globalThis.finalX=positionB.x;pointer('pointerup',180,140);`);
assert.equal(run("pathAB.getAttribute('d')"),run('finalPath'),'Release must not change line geometry');
assert.equal(run('positionB.x'),run('finalX'),'Release must not run auto-layout');
assert.equal(run("graphView.querySelectorAll('.relation-node').find(node=>node.dataset.key==='characters:b')===nodeB"),true,'Release must preserve DOM nodes');
run(`pointer('pointerdown',180,140);pointer('pointercancel',180,140);pointer('pointermove',300,200);`);
assert.equal(run('positionB.x'),run('finalX'),'Cancelled pointer capture must stop dragging');
console.log('PASS: live edges and labels before release, screen transforms, stable release and pointer cancellation');

// Regression: while linking, the pointerdown on the target node must not bubble
// to the canvas. Otherwise the canvas cancels link mode before the click arrives.
run(`
 globalThis.linkView=relationGraph(center,relationCatalog());
 globalThis.linkSource=linkView.querySelectorAll('.relation-node').find(node=>node.dataset.key==='characters:a');
 globalThis.linkTarget=linkView.querySelectorAll('.relation-node').find(node=>node.dataset.key==='characters:b');
 globalThis.findTag=(node,tag)=>{if(node.tag===tag)return node;for(const child of node.children||[]){const hit=findTag(child,tag);if(hit)return hit;}return null;};
 globalThis.linkSvg=findTag(linkView,'svg');
 linkSource.events.contextmenu[0]({preventDefault(){},stopPropagation(){},clientX:120,clientY:180});
 globalThis.linkMenu=document.body.children.find(node=>node.getAttribute('class')==='relation-context-menu');
 linkMenu.children.find(node=>node.getAttribute('text')==='relations.add_relation').events.click[0]();
 relationSave=async()=>{};toast=()=>{};
 globalThis.linkBubble={stopped:false,stopPropagation(){this.stopped=true;}};
 linkTarget.events.pointerdown[0]({pointerId:9,button:0,clientX:0,clientY:0,target:linkTarget,stopPropagation:()=>{linkBubble.stopped=true;}});
 if(!linkBubble.stopped)linkSvg.events.pointerdown[0]({pointerId:9,button:0,clientX:0,clientY:0,target:linkSvg});
 linkTarget.events.click[0]({stopPropagation(){}});
`);
assert.equal(run('linkBubble.stopped'),true,'Target pointerdown must not bubble to the canvas while linking');
assert.equal(run("state.db.relations.items.filter(edge=>relationKey(edge.source)==='characters:a'&&relationKey(edge.target)==='characters:b'&&edge.directed!==false).length"),1,
  'Clicking a target node must create the relationship instead of only selecting it');
assert.equal(run('state.db.relations.items.length'),6,'The newly created relationship must be persisted in local state');
console.log('PASS: target click during link mode creates a relationship');

// Right-clicking an edge offers both actions and wires them to the existing logic.
run(`
 globalThis.edgeMenuPrevented=false;globalThis.edgeMenuEdit=null;
 relationDialog=(source,changed,edge)=>{edgeMenuEdit=edge;};
 edgeAB.events.contextmenu[0]({preventDefault(){edgeMenuPrevented=true;},stopPropagation(){},clientX:220,clientY:200});
 globalThis.edgeMenu=document.body.children.find(node=>node.getAttribute('class')==='relation-context-menu');
 globalThis.edgeMenuLabels=edgeMenu.children.map(node=>node.getAttribute('text')).join(',');
 edgeMenu.children.find(node=>node.getAttribute('text')==='relations.edit_relation').events.click[0]();
`);
assert.equal(run('edgeMenuPrevented'),true,'Right-clicking an edge must suppress the browser menu');
assert.equal(run('edgeMenuLabels'),'relations.edit_relation,relations.delete_relation','Edge menu must offer edit and delete');
assert.equal(run('edgeMenuEdit.id'),'ab','The edit action must open the clicked edge');
run(`
 globalThis.deletedEdge=null;globalThis.deletePrompt=null;
 relationRemove=(edge)=>{deletedEdge=edge;};
 confirmDialog=(title,message,run)=>{deletePrompt=message;run();};
 edgeAB.events.contextmenu[0]({preventDefault(){},stopPropagation(){},clientX:220,clientY:200});
 edgeMenu=document.body.children.find(node=>node.getAttribute('class')==='relation-context-menu');
 edgeMenu.children.find(node=>node.getAttribute('text')==='relations.delete_relation').events.click[0]();
`);
assert.equal(run('deletedEdge.id'),'ab','The delete action must remove the clicked edge');
assert.equal(run('deletePrompt'),'relations.remove_confirm','Deleting an edge must keep the confirmation step');
console.log('PASS: edge context menu edits and confirms deletion');

assert.equal(run("graphView.querySelectorAll('.relation-expand').length"),0,'Record graph has no expansion controls');
console.log('PASS: record graph is a fixed one-hop radial view');

run(`globalThis.recordRelations=relationEditor(center,()=>{});`);
assert.equal(run("recordRelations.children[0].getAttribute('class')"),'record-section-head');
assert.equal(run("recordRelations.children[1].getAttribute('class')"),'relation-graph','Graph must sit above the relationship list');
assert.equal(run("recordRelations.children[2].getAttribute('class')"),'relation-direct-list','Relationship list follows the graph');
assert.equal(run("graphView.querySelectorAll('.relation-zoom').map(node=>node.getAttribute('text')).join(',')"),
  'relations.zoom_out_short,relations.zoom_in_short');
console.log('PASS: relationship graph precedes the list and zoom controls are labelled, not +/-');

run(`state.ui.characters={q:'hidden query',category:'hidden category',tag:'hidden tag'};go=view=>{state.view=view;};openRelationRecord({collection:'characters',id:'b'});`);
assert.equal(run('state.ui.characters.sel'),'b');
assert.equal(run('state.ui.characters.q'),'');
assert.equal(run('state.ui.characters.category'),null);
assert.equal(run('state.ui.characters.tag'),'');
assert.equal(run("state.ui.recordTabs['characters:b']"),'relations');
console.log('PASS: record jumps clear filters that could hide the target');

run(`
 globalThis.networkView=relationGraph({collection:'network',id:'all'},relationCatalog(),true,{network:true});
 globalThis.networkUi=state.ui.relationGraphs['network:all'];
 globalThis.networkSvg=findTag(networkView,'svg');
 globalThis.networkInitialSelected=networkUi.selected;
 globalThis.networkInitialClass=networkView.getAttribute('class');
 globalThis.networkNode=networkView.querySelectorAll('.relation-node').find(node=>node.dataset.key==='characters:a');
 networkNode.events.click[0]({stopPropagation(){}});
 globalThis.networkSelectedAfterClick=networkUi.selected;
 networkSvg.getBoundingClientRect=()=>({width:780,height:490});
 const blankTarget={closest:()=>null};
 const blankEvent={pointerId:11,clientX:400,clientY:300,target:blankTarget};
 networkSvg.events.pointerdown[0](blankEvent);
 networkSvg.events.pointerup[0](blankEvent);
`);
assert.equal(run('networkInitialSelected'),null,'Relationship network must open with no focused record');
assert.equal(run("networkInitialClass.includes('relation-show-all-labels')"),true,'All relationship labels must be visible without a selection');
assert.equal(run('networkSelectedAfterClick'),'characters:a','Clicking a node focuses that record');
assert.equal(run('networkUi.selected'),null,'Clicking blank space clears the focused record');
assert.equal(run("networkView.getAttribute('class').includes('relation-show-all-labels')"),true,'Blank click returns to the all-relationships preview');
console.log('PASS: network opens with all labels and blank click clears focus');

run(`
 state.db.sections={items:[{key:'world',label:'世界设定',on:true},{key:'species',label:'物种',on:false}],
   builtins:{characters:{on:true},inventory:{on:true},world:{on:true},factions:{on:false},items:{on:false},other:{on:false}}};
 globalThis.choiceKeys=relationCollectionChoices().map(entry=>entry.coll);
 state.db.sections.builtins.world.on=false;state.db.sections.items[0].on=false;
 globalThis.choiceKeysWithoutWorld=relationCollectionChoices().map(entry=>entry.coll);
`);
assert.equal(run('choiceKeys.join(",")'),'characters,section_world,worldmap,memories','Only visible sections are offered as relationship categories');
assert.equal(run('choiceKeysWithoutWorld.join(",")'),'characters,memories','Hidden world settings and their map are omitted');
console.log('PASS: relationship categories follow visible settings');
