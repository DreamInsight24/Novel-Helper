/* Novel-scoped record relationships. SVG layout has no remote dependencies. */
'use strict';

function relationKey(ref) { return (ref?.collection || '') + ':' + (ref?.id || ''); }
function relationCatalog() {
  const entries = settingEntries(true).filter(entry=>entry.coll && entry.coll!=='worldmap');
  entries.push({coll:'memories',label:i18n.t('nav.memories')});
  const nodes = entries.flatMap(entry=>collItems(entry.coll).map(rec=>({
    collection:entry.coll,id:rec.id,name:recordName(rec),label:entry.label,rec
  })));
  Object.entries(state.db.worldmap?.regions || {}).forEach(([id,rec])=>nodes.push({
    collection:'worldmap',id,name:recordName(rec),label:i18n.t('nav.worldmap'),rec}));
  return new Map(nodes.map(node=>[relationKey(node),node]));
}
function relationEdges() {
  const pool=relationCatalog();
  return ((state.db.relations || {}).items || []).filter(edge=>edge && pool.has(relationKey(edge.source))&&pool.has(relationKey(edge.target))&&relationKey(edge.source)!==relationKey(edge.target)&&String(edge.type || '').trim());
}
function relationVisibleGraph(center, expanded, pool=relationCatalog(), edges=relationEdges(), limit=60) {
  const root=relationKey(center), keys=new Set([root]);
  const reveal=key=>edges.forEach(edge=>{
    const a=relationKey(edge.source),b=relationKey(edge.target);
    if(a===key && pool.has(b) && keys.size<limit)keys.add(b);
    if(b===key && pool.has(a) && keys.size<limit)keys.add(a);
  });
  reveal(root);
  const visited=new Set();
  let pending=true;
  while(pending){pending=false;expanded.forEach(key=>{if(keys.has(key)&&!visited.has(key)){visited.add(key);reveal(key);pending=true;}});}
  return {nodes:Array.from(keys).map(key=>pool.get(key)).filter(Boolean),
    edges:edges.filter(edge=>keys.has(relationKey(edge.source))&&keys.has(relationKey(edge.target)))};
}
function relationLayout(nodes, edges, root, previous={}) {
  const n=nodes.length, positions={};
  nodes.forEach((node,i)=>{
    const key=relationKey(node),angle=(nodes.some(item=>relationKey(item)===root)?(i-1)/Math.max(1,n-1):i/Math.max(1,n))*Math.PI*2-Math.PI/2;
    positions[key]=key===root?{x:390,y:245}:{...(previous[key] || {x:390+210*Math.cos(angle),y:245+160*Math.sin(angle)})};
  });
  for(let step=0;step<Math.min(200,Math.max(30,Math.floor(18000/Math.max(1,n))));step++) {
    const forces=Object.fromEntries(Object.keys(positions).map(key=>[key,{x:0,y:0}]));
    const keys=Object.keys(positions);
    for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
      const a=positions[keys[i]],b=positions[keys[j]],dx=a.x-b.x,dy=a.y-b.y,d=Math.max(1,Math.hypot(dx,dy));
      const f=Math.min(25,15000/(d*d)+Math.max(0,150-d)*.15);
      forces[keys[i]].x+=dx/d*f;forces[keys[i]].y+=dy/d*f;
      forces[keys[j]].x-=dx/d*f;forces[keys[j]].y-=dy/d*f;
    }
    edges.forEach(edge=>{
      const ak=relationKey(edge.source),bk=relationKey(edge.target),a=positions[ak],b=positions[bk];
      if(!a||!b)return;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),f=(d-165)*.035;
      forces[ak].x+=dx/d*f;forces[ak].y+=dy/d*f;forces[bk].x-=dx/d*f;forces[bk].y-=dy/d*f;
    });
    keys.filter(key=>key!==root).forEach(key=>{
      const p=positions[key],anchor=previous[key];
      const fx=forces[key].x+(390-p.x)*.006+(anchor?(anchor.x-p.x)*.08:0);
      const fy=forces[key].y+(245-p.y)*.006+(anchor?(anchor.y-p.y)*.08:0);
      p.x=Math.max(65,Math.min(715,p.x+Math.max(-8,Math.min(8,fx))));
      p.y=Math.max(62,Math.min(425,p.y+Math.max(-8,Math.min(8,fy))));
    });
  }
  return positions;
}
function relationSyncLocal() {
  collItems('factions').forEach(faction=>{
    const edges=relationEdges().filter(edge=>edge.directed!==false&&edge.type==='隶属'&&edge.source.collection==='characters'&&edge.target.collection==='factions'&&edge.target.id===faction.id);
    faction.members=edges.map(edge=>edge.source.id);
    faction.member_roles=Object.fromEntries(edges.filter(edge=>edge.note).map(edge=>[edge.source.id,edge.note]));
  });
}
async function relationSave() {
  if(state.ui.relationSaving)throw new Error(i18n.t('common.saving'));
  state.ui.relationSaving=true;
  try{
  const novel=state.activeNovelId;
  // Newly created endpoints and any legacy membership edits must reach disk first.
  await flushPendingSaves();
  if(novel!==state.activeNovelId)throw new Error(i18n.t('errors.workspace_changed'));
  const result=await api('/api/collections/relations',{method:'POST',body:{
    novel_id:novel,data:{items:state.db.relations.items,initialized:true}}});
  if(novel!==state.activeNovelId)return;
  state.db.relations=result.data;state.db.factions=result.factions;
  if(result.discarded)toast(i18n.t('relations.discarded',{count:result.discarded}),'err');
  relationSyncLocal();
  }finally{state.ui.relationSaving=false;}
}
async function relationRemove(edge, changed) {
  if(state.ui.relationSaving)return;
  const previous=JSON.parse(JSON.stringify(state.db.relations)),novel=state.activeNovelId;
  state.db.relations.items=(state.db.relations.items || []).filter(item=>item?.id!==edge.id);
  try{await relationSave();changed();}
  catch(error){if(novel===state.activeNovelId)state.db.relations=previous;toast(error.message,'err');}
}
function openRelationRecord(ref) {
  const modalOnly=ref.collection==='memories'||ref.collection==='worldmap';
  state.ui[ref.collection]={...(state.ui[ref.collection]||{}),sel:ref.id,...(modalOnly?{}:{q:'',category:null,tag:''})};
  state.ui.recordTabs=state.ui.recordTabs||{};state.ui.recordTabs[relationKey(ref)]='relations';
  if(modalOnly) {
    const node=relationCatalog().get(relationKey(ref));if(!node)return;
    let body=h('div');const draw=()=>{clear(body);body.appendChild(relationEditor(ref,draw));};draw();
    const dialog=modal(node.name,body,[h('button',{text:i18n.t('common.close'),onclick:()=>dialog.close()})]);
    dialog.dlg.classList.add('relation-wide-dialog');
  } else go(ref.collection);
}
function relationDialog(center, changed, existing=null) {
  let pool=relationCatalog();const root=relationKey(center),novel=state.activeNovelId;
  let selected=existing ? (relationKey(existing.source)===root?existing.target:existing.source) : null;
  const query=h('input',{type:'search',placeholder:i18n.t('relations.search'),'aria-label':i18n.t('relations.search')});
  const kind=h('input',{type:'text',maxlength:80,value:existing?.type || i18n.t('relations.default_type'),list:'relation-types','aria-label':i18n.t('relations.type')});
  const note=h('textarea',{rows:3,maxlength:2000,value:existing?.note || '','aria-label':i18n.t('relations.note')});
  const direction=h('select',{'aria-label':i18n.t('relations.direction')},[
    ['out',i18n.t('relations.out')],['in',i18n.t('relations.in')],['both',i18n.t('relations.both')]
  ].map(([value,text])=>h('option',{value,text,selected:existing?(existing.directed===false?value==='both':value===(relationKey(existing.source)===root?'out':'in')):value==='out'})));
  const list=h('div',{class:'relation-picker-list'}),chosen=h('div',{class:'relation-chosen','aria-live':'polite'});
  const choices=settingEntries(true).filter(entry=>entry.coll && entry.coll!=='worldmap');
  choices.push({coll:'memories',label:i18n.t('nav.memories')},{coll:'worldmap',label:i18n.t('nav.worldmap')});
  const collection=h('select',{'aria-label':i18n.t('relations.filter')},h('option',{value:'',text:i18n.t('relations.all_categories')}),
    choices.map(entry=>h('option',{value:entry.coll,text:entry.label})));
  const createCollection=h('select',{'aria-label':i18n.t('relations.create_collection')},choices.map(entry=>h('option',{value:entry.coll,text:entry.label})));
  const createButton=h('button',{text:i18n.t('records.create_linked'),onclick:()=>{
    const name=query.value.trim();if(!name){query.focus();toast(i18n.t('records.name_required'),'err');return;}
    const coll=collection.value || createCollection.value,def=defFor(coll);
    let record;
    if(def){record=newRecord(def);record.name=name;}
    else if(coll==='worldmap')record=newRegionRecord(name);
    else if(coll==='memories')record={id:newId('mm'),title:name,category:i18n.t('defaults.memory.short'),content:'',tags:[],created:nowStr(),updated:nowStr()};
    if(!record)return;
    if(presetsOf(coll).length){record.elements=record.elements || [];applyPreset(record.elements,presetsOf(coll));}
    if(coll==='worldmap'){
      state.db.worldmap=state.db.worldmap || {regions:{}};state.db.worldmap.regions[record.id]=record;
    }else{state.db[coll]=state.db[coll] || {items:[]};state.db[coll].items.unshift(record);}
    touch(coll);
    selected={collection:coll,id:record.id};pool=relationCatalog();draw();
  }});
  const draw=()=>{
    clear(list);chosen.textContent=selected?(pool.get(relationKey(selected))?.name||''):i18n.t('relations.pick_target');
    const nodes=Array.from(pool.values()).filter(node=>relationKey(node)!==root&&(!collection.value||node.collection===collection.value)
      &&(node.name+' '+node.label).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()));
    nodes.forEach(node=>list.appendChild(h('button',{class:'relation-pick-item'+(selected&&relationKey(selected)===relationKey(node)?' active':''),
      'aria-pressed':String(!!selected&&relationKey(selected)===relationKey(node)),
      onclick:()=>{selected={collection:node.collection,id:node.id};draw();}},h('span',{text:node.name}),h('span',{class:'small muted',text:node.label}))));
    if(!nodes.length)list.appendChild(h('p',{class:'muted small',text:i18n.t('records.no_match_create')}));
    createCollection.hidden=!!collection.value;
    createButton.disabled=!query.value.trim();
    i18n.apply(list);
  };
  query.addEventListener('input',draw);collection.addEventListener('change',draw);
  query.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();list.querySelector('button')?.click();}});
  const save=h('button',{class:'primary',text:i18n.t('common.save'),dataset:{noclose:'1'},onclick:async()=>{
    if(state.ui.relationSaving)return;
    if(!selected||!kind.value.trim()){toast(i18n.t('relations.required'),'err');return;}
    if(novel!==state.activeNovelId){toast(i18n.t('errors.workspace_changed'),'err');dialog.close();return;}
    const relationType=kind.value.trim()===i18n.t('relations.membership_type')?'隶属':kind.value.trim();
    const source=direction.value==='in'?selected:center,target=direction.value==='in'?center:selected,directed=direction.value!=='both';
    const duplicate=relationEdges().some(edge=>edge.id!==existing?.id&&edge.type===relationType&&(edge.directed!==false)===directed&&(
      relationKey(edge.source)===relationKey(source)&&relationKey(edge.target)===relationKey(target)||!directed&&relationKey(edge.source)===relationKey(target)&&relationKey(edge.target)===relationKey(source)));
    if(duplicate){toast(i18n.t('relations.duplicate'),'err');return;}
    const previous=JSON.parse(JSON.stringify(state.db.relations || {items:[],initialized:true}));
    const edge={id:existing?.id||newId('rel'),source:{collection:source.collection,id:source.id},target:{collection:target.collection,id:target.id},type:relationType,directed,note:note.value.trim()};
    state.db.relations={items:(state.db.relations?.items || []).filter(item=>!existing || item?.id!==existing.id).concat(edge),initialized:true};
    save.disabled=true;
    try{await relationSave();dialog.close();changed();}
    catch(error){if(novel===state.activeNovelId)state.db.relations=previous;toast(error.message,'err');}
    finally{save.disabled=false;}
  }});
  const body=h('div',{class:'relation-dialog-body'},
    h('div',{class:'relation-form-row'},h('div',{class:'field'},h('label',{text:i18n.t('relations.search')}),query),
      h('div',{class:'field'},h('label',{text:i18n.t('relations.filter')}),collection)),list,
    h('div',{class:'relation-create-row inline'},createCollection,createButton),chosen,
    h('div',{class:'relation-form-row'},h('label',null,i18n.t('relations.type'),kind),h('label',null,i18n.t('relations.direction'),direction)),
    h('div',{class:'field'},h('label',{text:i18n.t('relations.note')}),note),
    h('datalist',{id:'relation-types'},i18n.t('relations.suggestions').split('|').map(value=>h('option',{value}))));
  const dialog=modal(i18n.t(existing?'relations.edit':'records.add_relation'),body,[h('button',{text:i18n.t('common.cancel'),onclick:()=>dialog.close()}),save]);
  dialog.dlg.classList.add('relation-picker');draw();query.focus();
}
function relationDirectList(center,changed,pool=relationCatalog()) {
  const root=relationKey(center),list=h('div',{class:'relation-direct-list'});
  const links=relationEdges().filter(edge=>relationKey(edge.source)===root||relationKey(edge.target)===root);
  links.forEach(edge=>{
    const outgoing=relationKey(edge.source)===root,other=outgoing?edge.target:edge.source,node=pool.get(relationKey(other));
    if(!node)return;
    list.appendChild(h('div',{class:'relation-direct-row'},
      h('span',{class:'relation-direction',text:edge.directed===false?'↔':outgoing?'→':'←'}),h('span',{class:'relation-type',text:edge.type}),
      h('button',{class:'relation-target',text:node.name,title:node.label,onclick:()=>openRelationRecord(other)}),
      h('span',{class:'small muted relation-note',text:edge.note||node.label}),
      h('button',{class:'ghost mini',text:i18n.t('sections.edit_action'),onclick:()=>relationDialog(center,changed,edge)}),
      h('button',{class:'ghost mini',text:'×','aria-label':i18n.t('records.remove_relation'),onclick:()=>confirmDialog(
        i18n.t('records.remove_relation'),i18n.t('relations.remove_confirm'),()=>relationRemove(edge,changed))})));
  });
  if(!links.length)list.appendChild(h('p',{class:'small muted',text:i18n.t('records.relations_empty')}));
  return list;
}
function relationEditor(center, changed) {
  state.db.relations=state.db.relations||{items:[],initialized:true};
  const root=relationKey(center),pool=relationCatalog(),box=h('div',{class:'record-relations relation-workspace'});
  const links=relationEdges().filter(edge=>relationKey(edge.source)===root||relationKey(edge.target)===root);
  box.appendChild(h('div',{class:'record-section-head'},h('h3',{text:i18n.t('relations.direct',{count:links.length})}),
    h('button',{class:'mini',text:i18n.t('records.add_relation'),onclick:()=>relationDialog(center,changed)})));
  box.appendChild(relationDirectList(center,changed,pool));
  box.appendChild(h('button',{class:'mini',text:i18n.t('relations.open_network'),onclick:()=>go('relations')}));
  box.appendChild(relationGraph(center,pool));return box;
}
function viewRelations(main) {
  const ui=state.ui.relationNetwork=state.ui.relationNetwork || {q:'',collection:''};
  const host=h('div',{class:'relation-network'});
  main.appendChild(pageHead(i18n.t('relations.network'),i18n.t('relations.network_desc')));
  const query=h('input',{type:'search',value:ui.q,placeholder:i18n.t('relations.search'),'aria-label':i18n.t('relations.search'),oninput:event=>{ui.q=event.target.value;draw();}});
  const filter=h('select',{'aria-label':i18n.t('relations.filter'),onchange:event=>{ui.collection=event.target.value;draw();}},
    h('option',{value:'',text:i18n.t('relations.all_categories')}),
    Array.from(new Map(Array.from(relationCatalog().values()).map(node=>[node.collection,node.label]))).map(([value,text])=>h('option',{value,text,selected:value===ui.collection})));
  const source=h('select',{'aria-label':i18n.t('relations.source'),onchange:event=>{ui.source=event.target.value;}});
  const create=h('button',{class:'primary',text:i18n.t('records.add_relation'),onclick:()=>{
    const center=relationCatalog().get(source.value);if(center)relationDialog(center,draw);
  }});
  main.appendChild(h('div',{class:'card inline relation-network-tools'},query,filter,source,create));main.appendChild(host);
  function draw(){
    clear(host);clear(source);
    const pool=new Map(Array.from(relationCatalog()).filter(([key,node])=>(!ui.collection||node.collection===ui.collection)&&
      (node.name+' '+node.label).toLocaleLowerCase().includes(ui.q.trim().toLocaleLowerCase())));
    pool.forEach((node,key)=>source.appendChild(h('option',{value:key,text:node.name,selected:key===ui.source})));
    create.disabled=!pool.size;
    if(!pool.size){host.appendChild(h('p',{class:'card muted',text:i18n.t('relations.network_empty')}));return;}
    host.appendChild(relationGraph({collection:'network',id:'all'},pool,true,{network:true,changed:draw}));
    i18n.apply(host);
  }
  draw();
}
function relationGraph(center,pool,large=false,options={}) {
  const network=options.network===true;
  const root=relationKey(center),cache=state.ui.relationGraphs=state.ui.relationGraphs||{};
  const ui=cache[root]=cache[root]||{expanded:[],positions:{},zoom:1,pan:{x:0,y:0},selected:root};
  if(network && !pool.has(ui.selected))ui.selected=pool.keys().next().value;
  const wrap=h('section',{class:'relation-graph'+(network?' relation-network-graph':''),'aria-label':i18n.t('relations.graph')}),canvas=h('div',{class:'relation-canvas'}),info=h('div',{class:'relation-graph-info'});
  let svg,layer,view;
  const svgNode=(tag,props={},...children)=>{
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(props).forEach(([key,value])=>key.startsWith('on')?el.addEventListener(key.slice(2),value):el.setAttribute(key,value));
    children.forEach(child=>el.appendChild(typeof child==='string'?document.createTextNode(child):child));return el;
  };
  const transform=()=>layer.setAttribute('transform',`translate(${ui.pan.x} ${ui.pan.y}) translate(390 245) scale(${ui.zoom}) translate(-390 -245)`);
  const detail=()=>{
    clear(info);const node=pool.get(ui.selected);if(!node)return;
    svg?.querySelectorAll('.relation-node').forEach(node=>node.classList.toggle('selected',node.dataset.key===ui.selected));
    svg?.querySelectorAll('.relation-edge').forEach(edge=>edge.classList.toggle('highlighted',edge.dataset.source===ui.selected||edge.dataset.target===ui.selected));
    info.append(h('div',null,h('strong',{text:node.name}),h('span',{class:'small muted',text:' · '+node.label})),
      h('div',{class:'inline'},ui.selected!==root?h('button',{class:'mini',text:i18n.t('relations.center_here'),onclick:()=>openRelationRecord(node)}):null,
        network?h('button',{class:'mini',text:i18n.t('records.add_relation'),onclick:()=>relationDialog(node,options.changed)}):null));
    if(network)info.appendChild(relationDirectList(node,options.changed));
  };
  const draw=()=>{
    clear(canvas);
    if(network){
      view={nodes:Array.from(pool.values()),edges:relationEdges().filter(edge=>pool.has(relationKey(edge.source))&&pool.has(relationKey(edge.target)))};
    }else{
      view=relationVisibleGraph(center,[],pool,relationEdges(),Infinity);
      view.edges=view.edges.filter(edge=>relationKey(edge.source)===root||relationKey(edge.target)===root);
    }
    ui.positions=relationLayout(view.nodes,view.edges,root,ui.positions);
    svg=svgNode('svg',{viewBox:'0 0 780 490',role:'group','aria-label':i18n.t('relations.graph')});
    const markerId='rel-arrow-'+center.id.replace(/[^a-zA-Z0-9_-]/g,'');
    const defs=svgNode('defs',{},svgNode('marker',{id:markerId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'},svgNode('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#93a7be'})));
    svg.appendChild(defs);layer=svgNode('g');svg.appendChild(layer);transform();
    const lines=svgNode('g',{class:'relation-lines'});layer.appendChild(lines);
    const pairCounts=new Map(),edgeUpdates=new Map();
    view.edges.forEach(edge=>{
      const ak=relationKey(edge.source),bk=relationKey(edge.target),a=ui.positions[ak],b=ui.positions[bk];if(!a||!b)return;
      const pair=[ak,bk].sort().join('|'),index=pairCounts.get(pair)||0;pairCounts.set(pair,index+1);
      const group=svgNode('g',{'data-source':ak,'data-target':bk,class:'relation-edge'+(ak===ui.selected||bk===ui.selected?' highlighted':''),role:network?'button':'group',tabindex:network?0:-1,
        onclick:event=>{if(network){event.stopPropagation();relationDialog(edge.source,options.changed,edge);}},
        onkeydown:event=>{if(network&&event.key==='Enter'){event.preventDefault();relationDialog(edge.source,options.changed,edge);}}});
      const line=svgNode('path',{fill:'none',stroke:'#a6b6ca','stroke-width':1.5,...(edge.directed!==false?{'marker-end':`url(#${markerId})`}:{})});
      const label=svgNode('text',{'text-anchor':'middle',class:'relation-edge-label'},edge.type.slice(0,10));
      const update=()=>{
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),ar=ak===root?46:34,br=bk===root?46:34;
        const ax=a.x+dx/d*ar,ay=a.y+dy/d*ar,bx=b.x-dx/d*(br+7),by=b.y-dy/d*(br+7),bend=index?34*Math.ceil(index/2)*(index%2?1:-1):0;
        const cx=(ax+bx)/2-dy/d*bend,cy=(ay+by)/2+dx/d*bend;
        line.setAttribute('d',`M${ax},${ay} Q${cx},${cy} ${bx},${by}`);
        label.setAttribute('x',(ax+2*cx+bx)/4);label.setAttribute('y',(ay+2*cy+by)/4-6);
      };
      [ak,bk].forEach(key=>{if(!edgeUpdates.has(key))edgeUpdates.set(key,[]);edgeUpdates.get(key).push(update);});
      update();
      group.appendChild(line);group.appendChild(svgNode('title',{},`${pool.get(ak)?.name} ${edge.directed===false?'↔':'→'} ${pool.get(bk)?.name} · ${edge.type}${edge.note?' · '+edge.note:''}`));
      group.appendChild(label);
      lines.appendChild(group);
    });
    const colors={characters:'#d9e9ff',factions:'#dbefe8',worldmap:'#f1e4d7',items:'#ffedcb',equipment:'#e6e2fa',memories:'#f7dfe8'};
    view.nodes.forEach(node=>{
      const key=relationKey(node),pos=ui.positions[key],isRoot=key===root,r=isRoot?46:34;
      const group=svgNode('g',{'data-key':key,class:'relation-node'+(isRoot?' is-center':'')+(ui.selected===key?' selected':''),transform:`translate(${pos.x} ${pos.y})`,role:'button',tabindex:0,'aria-label':node.name+' · '+node.label,
        onclick:()=>{if(!dragged){ui.selected=key;detail();}},ondblclick:()=>{if((network||!isRoot)&&!dragged)openRelationRecord(node);},
        onkeydown:e=>{if(e.key==='Enter'){ui.selected=key;detail();}if(e.key===' '){e.preventDefault();openRelationRecord(node);}}});
      group.appendChild(svgNode('circle',{r,fill:isRoot?'#3b6ef0':colors[node.collection]||'#e9e5f7',stroke:isRoot?'#315fda':'#b9cce1','stroke-width':isRoot?3:1.5}));
      group.appendChild(svgNode('title',{},node.name+' · '+node.label));
      const clean=node.name.replace(/^【示例】/,'');
      group.appendChild(svgNode('text',{'text-anchor':'middle',y:clean.length>7?-9:-3,class:'relation-node-name'},clean.slice(0,7)));
      if(clean.length>7)group.appendChild(svgNode('text',{'text-anchor':'middle',y:4,class:'relation-node-name'},clean.slice(7,13)+(clean.length>13?'…':'')));
      group.appendChild(svgNode('text',{'text-anchor':'middle',y:isRoot?22:21,class:'relation-node-category'},isRoot?i18n.t('relations.current'):node.label));
      let dragged=false,start=null;
      const graphPoint=e=>{
        const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
        return point.matrixTransform(layer.getScreenCTM().inverse());
      };
      const move=e=>{
        if(!start||e.pointerId!==start.pointerId)return;
        if(!dragged&&Math.hypot(e.clientX-start.clientX,e.clientY-start.clientY)<3)return;
        const point=graphPoint(e);dragged=true;
        pos.x=start.x+point.x-start.point.x;pos.y=start.y+point.y-start.point.y;
        group.setAttribute('transform',`translate(${pos.x} ${pos.y})`);
        (edgeUpdates.get(key)||[]).forEach(update=>update());
      };
      group.addEventListener('pointerdown',e=>{
        if(isRoot||e.button!==0||e.target.closest('.relation-expand'))return;
        e.stopPropagation();dragged=false;
        start={pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,point:graphPoint(e),x:pos.x,y:pos.y};
        group.setPointerCapture(e.pointerId);
      });
      group.addEventListener('pointermove',move);
      group.addEventListener('pointerup',e=>{
        if(!start||e.pointerId!==start.pointerId)return;
        move(e);start=null;
        if(group.hasPointerCapture(e.pointerId))group.releasePointerCapture(e.pointerId);
      });
      group.addEventListener('pointercancel',()=>{start=null;});
      group.addEventListener('lostpointercapture',()=>{start=null;});
      layer.appendChild(group);
    });
    let panStart=null;
    svg.addEventListener('pointerdown',e=>{if(e.target.closest('.relation-node')||e.target.closest('.relation-edge'))return;panStart={x:e.clientX,y:e.clientY,px:ui.pan.x,py:ui.pan.y};svg.setPointerCapture(e.pointerId);});
    svg.addEventListener('pointermove',e=>{if(!panStart)return;const rect=svg.getBoundingClientRect();ui.pan={x:panStart.px+(e.clientX-panStart.x)*780/rect.width,y:panStart.py+(e.clientY-panStart.y)*490/rect.height};transform();});
    svg.addEventListener('pointerup',()=>{panStart=null;});
    svg.addEventListener('wheel',e=>{e.preventDefault();ui.zoom=Math.max(.5,Math.min(2.5,ui.zoom*(e.deltaY>0?.9:1.1)));transform();},{passive:false});
    canvas.appendChild(svg);detail();
    count.textContent=i18n.t('relations.graph_count',{nodes:view.nodes.length,edges:view.edges.length})+'';
  };
  const count=h('span',{class:'small muted'});
  wrap.appendChild(h('div',{class:'relation-graph-head'},h('strong',{text:i18n.t('relations.graph')}),count,
    h('div',{class:'inline'},large?null:h('button',{class:'mini',text:'⤢',title:i18n.t('relations.large_view'),'aria-label':i18n.t('relations.large_view'),onclick:()=>{
      const dialog=modal(i18n.t('relations.graph'),relationGraph(center,pool,true),[h('button',{text:i18n.t('common.close'),onclick:()=>dialog.close()})],()=>draw());dialog.dlg.classList.add('relation-wide-dialog');
    }}),h('button',{class:'mini',text:'−','aria-label':i18n.t('relations.zoom_out'),onclick:()=>{ui.zoom=Math.max(.5,ui.zoom-.2);transform();}}),
      h('button',{class:'mini',text:'+','aria-label':i18n.t('relations.zoom_in'),onclick:()=>{ui.zoom=Math.min(2.5,ui.zoom+.2);transform();}}),
      h('button',{class:'mini',text:i18n.t('relations.reset'),onclick:()=>{ui.expanded=[];ui.positions={};ui.zoom=1;ui.pan={x:0,y:0};ui.selected=network?pool.keys().next().value:root;draw();}}))));
  wrap.append(canvas,info,h('div',{class:'small muted relation-graph-hint',text:i18n.t(network?'relations.network_hint':'relations.radial_hint')}));draw();return wrap;
}
