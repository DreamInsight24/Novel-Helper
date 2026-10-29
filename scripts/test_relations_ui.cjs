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
run(`touch=()=>{};relationSave();`);
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
   constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.dataset={};this.captures=new Set();
     this.classList={toggle:(key,on)=>{const parts=new Set((this.attrs.class||'').split(' ').filter(Boolean));on?parts.add(key):parts.delete(key);this.attrs.class=[...parts].join(' ');}};}
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
 globalThis.document={createElementNS:(ns,tag)=>new GraphElement(tag),createTextNode:text=>({textContent:text,children:[]})};
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
