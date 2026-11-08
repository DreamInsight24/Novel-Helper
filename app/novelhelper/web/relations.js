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
  state.db.relations=state.db.relations||{items:[],initialized:true};
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
/** Categories shown in relationship pickers: only settings the user can currently see. */
function relationCollectionChoices() {
  const choices=settingEntries(false).filter(entry=>entry.coll);
  if(!choices.some(entry=>entry.coll==='memories'))choices.push({coll:'memories',label:i18n.t('nav.memories')});
  return choices;
}
function relationDialog(center, changed, existing=null) {
  const root=relationKey(center),novel=state.activeNovelId;
  const choices=relationCollectionChoices();
  const visibleCollections=new Set(choices.map(entry=>entry.coll));
  // Existing endpoints stay visible even if their section was hidden after the link was made.
  const buildPool=()=>{
    const all=relationCatalog(),pool=new Map();
    all.forEach((node,key)=>{if(visibleCollections.has(node.collection))pool.set(key,node);});
    [center,...(existing?[existing.source,existing.target]:[])].forEach(ref=>{
      const node=all.get(relationKey(ref));if(node)pool.set(relationKey(ref),node);
    });
    return pool;
  };
  let pool=buildPool(),selected=existing?(relationKey(existing.source)===root?existing.target:existing.source):null;
  const query=h('input',{type:'search',placeholder:i18n.t('relations.search'),'aria-label':i18n.t('relations.search')});
  const kind=h('input',{type:'text',maxlength:80,value:existing?.type||i18n.t('relations.default_type'),list:'relation-types','aria-label':i18n.t('relations.type')});
  const note=h('textarea',{rows:3,maxlength:2000,value:existing?.note||'','aria-label':i18n.t('relations.note')});
  const direction=h('select',{'aria-label':i18n.t('relations.direction')},[
    ['out',i18n.t('relations.out')],['in',i18n.t('relations.in')],['both',i18n.t('relations.both')]
  ].map(([value,text])=>h('option',{value,text,selected:existing?(existing.directed===false?value==='both':value===(relationKey(existing.source)===root?'out':'in')):value==='out'})));
  const collection=h('select',{'aria-label':i18n.t('relations.category')},h('option',{value:'',text:i18n.t('relations.all_categories')}),
    choices.map(entry=>h('option',{value:entry.coll,text:entry.label})));
  const createCollection=h('select',{'aria-label':i18n.t('relations.create_collection')},choices.map(entry=>h('option',{value:entry.coll,text:entry.label})));
  const list=h('div',{class:'relation-picker-list'});
  const createRow=h('div',{class:'relation-create-row inline'},createCollection,
    h('button',{text:i18n.t('records.create_linked'),onclick:()=>{
      const name=query.value.trim();if(!name){query.focus();toast(i18n.t('records.name_required'),'err');return;}
      const coll=collection.value||createCollection.value,def=defFor(coll);
      let record;
      if(def){record=newRecord(def);record.name=name;}
      else if(coll==='worldmap')record=newRegionRecord(name);
      else if(coll==='memories')record={id:newId('mm'),title:name,category:i18n.t('defaults.memory.short'),content:'',tags:[],created:nowStr(),updated:nowStr()};
      if(!record)return;
      if(presetsOf(coll).length){record.elements=record.elements||[];applyPreset(record.elements,presetsOf(coll));}
      if(coll==='worldmap'){
        state.db.worldmap=state.db.worldmap||{regions:{}};state.db.worldmap.regions[record.id]=record;
      }else{state.db[coll]=state.db[coll]||{items:[]};state.db[coll].items.unshift(record);}
      touch(coll);
      selected={collection:coll,id:record.id};pool=buildPool();draw();
    }}));
  const picker=h('section',{class:'relation-picker-panel'},h('strong',{class:'relation-picker-title',text:i18n.t('relations.choose_target')}),
    h('div',{class:'relation-picker-filters'},
      h('div',{class:'field'},h('label',{text:i18n.t('relations.category')}),collection),
      h('div',{class:'field'},h('label',{text:i18n.t('relations.search')}),query)),
    list,createRow);
  picker.hidden=!!existing;
  const currentName=h('strong',{class:'relation-endpoint-name'}),
    currentMeta=h('span',{class:'relation-endpoint-meta'}),
    targetName=h('strong',{class:'relation-endpoint-name'}),
    targetMeta=h('span',{class:'relation-endpoint-meta'}),
    targetCard=h('section',{class:'relation-endpoint target'}),
    arrowGlyph=h('span',{class:'relation-arrow-glyph','aria-hidden':'true',text:'→'}),
    arrowType=h('span',{class:'relation-arrow-type'}),
    pairArrow=h('div',{class:'relation-pair-arrow'},arrowGlyph,arrowType),
    targetChange=h('button',{class:'ghost mini relation-change-target',text:i18n.t('relations.change_target'),onclick:()=>{
      picker.hidden=false;draw();query.focus();
    }});
  targetCard.append(h('div',{class:'relation-endpoint-head'},h('span',{class:'relation-endpoint-role',text:i18n.t('relations.target')}),targetChange),targetName,targetMeta);
  const pair=h('div',{class:'relation-pair','aria-label':i18n.t('relations.endpoints')},
    h('section',{class:'relation-endpoint current'},h('div',{class:'relation-endpoint-head'},h('span',{class:'relation-endpoint-role',text:i18n.t('relations.current')})),currentName,currentMeta),
    pairArrow,targetCard);
  const syncArrow=()=>{
    const glyph=direction.value==='in'?'←':direction.value==='both'?'↔':'→';
    arrowGlyph.textContent=glyph;
    arrowType.textContent=kind.value.trim()||i18n.t('relations.default_type');
    pairArrow.setAttribute('aria-label',direction.options[direction.selectedIndex]?.text||'');
  };
  const draw=()=>{
    const current=pool.get(root)||center,target=selected?pool.get(relationKey(selected)):null;
    currentName.textContent=current?.name||recordName(center);
    currentMeta.textContent=current?.label||'';
    targetName.textContent=target?.name||i18n.t('relations.pick_target');
    targetMeta.textContent=target?.label||'';
    targetCard.classList.toggle('is-empty',!target);
    targetChange.hidden=!existing||!picker.hidden;
    clear(list);
    const nodes=Array.from(pool.values()).filter(node=>relationKey(node)!==root&&(!collection.value||node.collection===collection.value)
      &&(node.name+' '+node.label).toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()));
    nodes.forEach(node=>list.appendChild(h('button',{class:'relation-pick-item'+(selected&&relationKey(selected)===relationKey(node)?' active':''),
      'aria-pressed':String(!!selected&&relationKey(selected)===relationKey(node)),
      onclick:()=>{selected={collection:node.collection,id:node.id};draw();}},h('span',{text:node.name}),h('span',{class:'small muted',text:node.label}))));
    if(!nodes.length)list.appendChild(h('p',{class:'muted small',text:i18n.t('records.no_match_create')}));
    createRow.hidden=!query.value.trim()||!!nodes.length;
    createCollection.hidden=!!collection.value;
    syncArrow();i18n.apply(list);
  };
  query.addEventListener('input',draw);collection.addEventListener('change',draw);
  kind.addEventListener('input',syncArrow);direction.addEventListener('change',syncArrow);
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
    const previous=JSON.parse(JSON.stringify(state.db.relations||{items:[],initialized:true}));
    const edge={id:existing?.id||newId('rel'),source:{collection:source.collection,id:source.id},target:{collection:target.collection,id:target.id},type:relationType,directed,note:note.value.trim()};
    state.db.relations={items:(state.db.relations?.items||[]).filter(item=>!existing||item?.id!==existing.id).concat(edge),initialized:true};
    save.disabled=true;
    try{await relationSave();dialog.close();changed();}
    catch(error){if(novel===state.activeNovelId)state.db.relations=previous;toast(error.message,'err');}
    finally{save.disabled=false;}
  }});
  const body=h('div',{class:'relation-dialog-body relation-editor'},
    pair,h('p',{class:'relation-pair-hint small muted',text:i18n.t('relations.pair_hint')}),picker,
    h('div',{class:'relation-fields'},
      h('div',{class:'field'},h('label',{text:i18n.t('relations.type')}),kind),
      h('div',{class:'field'},h('label',{text:i18n.t('relations.direction')}),direction),
      h('div',{class:'field relation-note-field'},h('label',{text:i18n.t('relations.note')}),note)),
    h('datalist',{id:'relation-types'},i18n.t('relations.suggestions').split('|').map(value=>h('option',{value}))));
  const dialog=modal(i18n.t(existing?'relations.edit':'relations.create'),body,[h('button',{text:i18n.t('common.cancel'),onclick:()=>dialog.close()}),save]);
  dialog.dlg.classList.add('relation-picker');draw();
  if(existing){kind.focus();kind.select?.();}else query.focus();
}
let relationOpenMenu = null;
function closeRelationMenu() {
  if (!relationOpenMenu) return;
  relationOpenMenu.remove();
  relationOpenMenu = null;
}
function relationContextMenu(items, event) {
  closeRelationMenu();
  const menu = h('div', { class: 'relation-context-menu', role: 'menu' });
  items.forEach(item => menu.appendChild(h('button', {
    type: 'button', role: 'menuitem', class: item.danger ? 'danger' : '', text: item.label,
    onclick: () => { closeRelationMenu(); item.run(); }
  })));
  document.body.appendChild(menu);
  const width = 184, height = items.length * 38 + 10;
  menu.style.left = Math.max(8, Math.min(event.clientX, (window.innerWidth || 1024) - width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(event.clientY, (window.innerHeight || 768) - height - 8)) + 'px';
  relationOpenMenu = menu;
  menu.addEventListener('pointerdown', e => e.stopPropagation());
  setTimeout(() => {
    document.addEventListener('pointerdown', event => {
      if (!menu.contains(event.target)) closeRelationMenu();
    }, { once: true });
  }, 0);
}
/** Same as the setting page's 新建: create a preset record and open its editor. */
function relationAddSetting(node) {
  const def = defFor(node.collection);
  if (!def) { toast(i18n.t('relations.add_setting_unavailable'), 'err'); return; }
  const record = newRecord(def);
  state.db[def.coll] = state.db[def.coll] || { items: [], categories: [] };
  state.db[def.coll].items = state.db[def.coll].items || [];
  state.db[def.coll].items.unshift(record);
  state.ui[def.coll] = { ...(state.ui[def.coll] || {}), sel: record.id, q: '', category: null, tag: '' };
  state.ui.recordTabs = state.ui.recordTabs || {};
  state.ui.recordTabs[def.coll + ':' + record.id] = 'content';
  state.ui.recordNewRecord = def.coll + ':' + record.id;
  touch(def.coll);
  go(node.collection);
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
  // 关系图放在关系列表上面：第一眼先看到结构，再读逐条关系。
  box.appendChild(relationGraph(center,pool,false,{changed}));
  box.appendChild(relationDirectList(center,changed,pool));
  box.appendChild(h('button',{class:'mini',text:i18n.t('relations.open_network'),onclick:()=>go('relations')}));
  return box;
}
function viewRelations(main) {
  const ui=state.ui.relationNetwork=state.ui.relationNetwork || {q:'',collection:''};
  const host=h('div',{class:'relation-network'});
  main.appendChild(pageHead(i18n.t('relations.network'),i18n.t('relations.network_desc')));
  const query=h('input',{type:'search',value:ui.q,placeholder:i18n.t('relations.search'),'aria-label':i18n.t('relations.search'),oninput:event=>{ui.q=event.target.value;draw();}});
  const presentCollections=new Set(Array.from(relationCatalog().values()).map(node=>node.collection));
  const filterChoices=relationCollectionChoices().filter(entry=>presentCollections.has(entry.coll));
  if(ui.collection&&!filterChoices.some(entry=>entry.coll===ui.collection))ui.collection='';
  const filter=h('select',{'aria-label':i18n.t('relations.filter'),onchange:event=>{ui.collection=event.target.value;draw();}},
    h('option',{value:'',text:i18n.t('relations.all_categories')}),
    filterChoices.map(entry=>h('option',{value:entry.coll,text:entry.label,selected:entry.coll===ui.collection})));
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
  const ui=cache[root]=cache[root]||{expanded:[],positions:{},zoom:1,pan:{x:0,y:0},selected:network?null:root};
  if(network && ui.selected && !pool.has(ui.selected))ui.selected=null;
  const wrap=h('section',{class:'relation-graph'+(network?' relation-network-graph':''),'aria-label':i18n.t('relations.graph')}),canvas=h('div',{class:'relation-canvas'}),info=h('div',{class:'relation-graph-info'});
  let svg,layer,view,linkPreview=null;
  const markerId='rel-arrow-'+String(center.id||'graph').replace(/[^a-zA-Z0-9_-]/g,'');
  const changed=typeof options.changed==='function'?options.changed:()=>draw();
  const svgNode=(tag,props={},...children)=>{
    const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(props).forEach(([key,value])=>key.startsWith('on')?el.addEventListener(key.slice(2),value):el.setAttribute(key,value));
    children.forEach(child=>el.appendChild(typeof child==='string'?document.createTextNode(child):child));return el;
  };
  const transform=()=>layer.setAttribute('transform',`translate(${ui.pan.x} ${ui.pan.y}) translate(390 245) scale(${ui.zoom}) translate(-390 -245)`);
  const cancelLink=()=>{
    ui.link=null;
    wrap.classList.toggle('relation-linking',false);
    if(linkPreview)linkPreview.setAttribute('opacity','0');
  };
  const detail=()=>{
    clear(info);
    const node=ui.selected?pool.get(ui.selected):null;
    svg?.querySelectorAll('.relation-node').forEach(item=>item.classList.toggle('selected',item.dataset.key===ui.selected));
    svg?.querySelectorAll('.relation-edge').forEach(edge=>edge.classList.toggle('highlighted',!!node&&(edge.dataset.source===ui.selected||edge.dataset.target===ui.selected)));
    wrap.classList.toggle('relation-show-all-labels',!node);
    if(!node){
      if(network)info.appendChild(h('p',{class:'small muted relation-graph-empty',text:i18n.t('relations.network_all_hint')}));
      return;
    }
    info.append(h('div',null,h('strong',{text:node.name}),h('span',{class:'small muted',text:' · '+node.label})),
      h('div',{class:'inline'},ui.selected!==root?h('button',{class:'mini',text:i18n.t('relations.center_here'),onclick:()=>openRelationRecord(node)}):null,
        network?h('button',{class:'mini',text:i18n.t('records.add_relation'),onclick:()=>relationDialog(node,changed)}):null));
    if(network)info.appendChild(relationDirectList(node,changed));
  };
  const graphPoint=e=>{
    const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
    return point.matrixTransform(layer.getScreenCTM().inverse());
  };
  const updateLink=point=>{
    if(!ui.link||!linkPreview)return;
    const a=ui.positions[ui.link.source];if(!a)return;
    const radius=ui.link.source===root?46:34;
    const dx=point.x-a.x,dy=point.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
    linkPreview.setAttribute('d',`M${a.x+dx/d*radius},${a.y+dy/d*radius} L${point.x},${point.y}`);
    linkPreview.setAttribute('opacity','0.9');
  };
  const beginLink=node=>{
    cancelLink();
    ui.link={source:relationKey(node)};
    wrap.classList.toggle('relation-linking',true);
    const point=ui.positions[ui.link.source];
    if(point)updateLink(point);
  };
  const createQuickRelation=async targetKey=>{
    const sourceKey=ui.link&&ui.link.source,target=pool.get(targetKey);
    if(!sourceKey||!target||sourceKey===targetKey)return;
    const source=pool.get(sourceKey)||relationCatalog().get(sourceKey);
    if(!source)return;
    const type=i18n.t('relations.default_type');
    const duplicate=relationEdges().find(edge=>edge.type===type&&(edge.directed!==false)&&
      relationKey(edge.source)===sourceKey&&relationKey(edge.target)===targetKey);
    cancelLink();
    if(duplicate){relationDialog(source,changed,duplicate);return;}
    state.db.relations=state.db.relations||{items:[],initialized:true};
    const previous=JSON.parse(JSON.stringify(state.db.relations||{items:[],initialized:true}));
    const edge={id:newId('rel'),source:{collection:source.collection,id:source.id},
      target:{collection:target.collection,id:target.id},type,directed:true,note:''};
    state.db.relations={items:(state.db.relations?.items||[]).concat(edge),initialized:true};
    try{
      await relationSave();
      toast(i18n.t('relations.link_created'),'ok');
      changed();
    }catch(error){
      state.db.relations=previous;
      toast(error.message,'err');
    }
  };
  const draw=()=>{
    closeRelationMenu();cancelLink();clear(canvas);
    if(network){
      view={nodes:Array.from(pool.values()),edges:relationEdges().filter(edge=>pool.has(relationKey(edge.source))&&pool.has(relationKey(edge.target)))};
    }else{
      view=relationVisibleGraph(center,[],pool,relationEdges(),Infinity);
      view.edges=view.edges.filter(edge=>relationKey(edge.source)===root||relationKey(edge.target)===root);
    }
    ui.positions=relationLayout(view.nodes,view.edges,root,ui.positions);
    svg=svgNode('svg',{viewBox:'0 0 780 490',role:'group','aria-label':i18n.t('relations.graph')});
    const defs=svgNode('defs',{},svgNode('marker',{id:markerId,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto-start-reverse'},svgNode('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#93a7be'})));
    svg.appendChild(defs);layer=svgNode('g');svg.appendChild(layer);transform();
    const lines=svgNode('g',{class:'relation-lines'});layer.appendChild(lines);
    const pairCounts=new Map(),edgeUpdates=new Map();
    view.edges.forEach(edge=>{
      const ak=relationKey(edge.source),bk=relationKey(edge.target),a=ui.positions[ak],b=ui.positions[bk];if(!a||!b)return;
      const pair=[ak,bk].sort().join('|'),index=pairCounts.get(pair)||0;pairCounts.set(pair,index+1);
      const group=svgNode('g',{'data-source':ak,'data-target':bk,class:'relation-edge'+(ak===ui.selected||bk===ui.selected?' highlighted':''),role:'button',tabindex:0,
        onclick:event=>{if(event)event.stopPropagation();cancelLink();relationDialog(edge.source,changed,edge);},
        oncontextmenu:event=>{
          event.preventDefault();event.stopPropagation();cancelLink();
          relationContextMenu([
            {label:i18n.t('relations.edit_relation'),run:()=>relationDialog(edge.source,changed,edge)},
            {label:i18n.t('relations.delete_relation'),danger:true,run:()=>confirmDialog(i18n.t('relations.delete_relation'),i18n.t('relations.remove_confirm'),()=>relationRemove(edge,changed))}
          ],event);
        },
        onkeydown:event=>{if(event.key==='Enter'){event.preventDefault();cancelLink();relationDialog(edge.source,changed,edge);}}});
      const line=svgNode('path',{fill:'none',stroke:'#a6b6ca','stroke-width':1.5,...(edge.directed!==false?{'marker-end':`url(#${markerId})`}:{})});
      const hit=svgNode('path',{fill:'none',stroke:'#000','stroke-opacity':0,'stroke-width':14,'pointer-events':'stroke',class:'relation-edge-hit'});
      const label=svgNode('text',{'text-anchor':'middle',class:'relation-edge-label'},edge.type.slice(0,10));
      const update=()=>{
        const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),ar=ak===root?46:34,br=bk===root?46:34;
        const ax=a.x+dx/d*ar,ay=a.y+dy/d*ar,bx=b.x-dx/d*(br+7),by=b.y-dy/d*(br+7),bend=index?34*Math.ceil(index/2)*(index%2?1:-1):0;
        const cx=(ax+bx)/2-dy/d*bend,cy=(ay+by)/2+dx/d*bend;
        const path=`M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
        line.setAttribute('d',path);hit.setAttribute('d',path);
        label.setAttribute('x',(ax+2*cx+bx)/4);label.setAttribute('y',(ay+2*cy+by)/4-6);
      };
      [ak,bk].forEach(key=>{if(!edgeUpdates.has(key))edgeUpdates.set(key,[]);edgeUpdates.get(key).push(update);});
      update();
      group.appendChild(hit);group.appendChild(line);group.appendChild(svgNode('title',{},`${pool.get(ak)?.name} ${edge.directed===false?'↔':'→'} ${pool.get(bk)?.name} · ${edge.type}${edge.note?' · '+edge.note:''}`));
      group.appendChild(label);
      lines.appendChild(group);
    });
    const colors={characters:'#d9e9ff',factions:'#dbefe8',worldmap:'#f1e4d7',items:'#ffedcb',equipment:'#e6e2fa',memories:'#f7dfe8'};
    view.nodes.forEach(node=>{
      const key=relationKey(node),pos=ui.positions[key],isRoot=key===root,r=isRoot?46:34;
      const group=svgNode('g',{'data-key':key,class:'relation-node'+(isRoot?' is-center':'')+(ui.selected===key?' selected':''),transform:`translate(${pos.x} ${pos.y})`,role:'button',tabindex:0,'aria-label':node.name+' · '+node.label,
        onclick:event=>{
          // 连线模式下点击目标必须优先建关系；不要被上一次拖拽留下的 dragged 状态拦住。
          if(ui.link){
            event?.stopPropagation();
            if(key!==ui.link.source)createQuickRelation(key);
            return;
          }
          if(dragged)return;
          ui.selected=key;detail();
        },
        oncontextmenu:event=>{
          event.preventDefault();event.stopPropagation();cancelLink();
          const items=[{label:i18n.t('relations.add_relation'),run:()=>beginLink(node)}];
          if(!network&&isRoot&&defFor(node.collection))items.push({label:i18n.t('relations.add_setting'),run:()=>relationAddSetting(node)});
          relationContextMenu(items,event);
        },
        ondblclick:()=>{if((network||!isRoot)&&!dragged)openRelationRecord(node);},
        onkeydown:e=>{if(e.key==='Enter'){ui.selected=key;detail();}if(e.key===' '){e.preventDefault();openRelationRecord(node);}}});
      group.appendChild(svgNode('circle',{r,fill:isRoot?'#3b6ef0':colors[node.collection]||'#e9e5f7',stroke:isRoot?'#315fda':'#b9cce1','stroke-width':isRoot?3:1.5}));
      group.appendChild(svgNode('title',{},node.name+' · '+node.label));
      const clean=node.name.replace(/^【示例】/,'');
      group.appendChild(svgNode('text',{'text-anchor':'middle',y:clean.length>7?-9:-3,class:'relation-node-name'},clean.slice(0,7)));
      if(clean.length>7)group.appendChild(svgNode('text',{'text-anchor':'middle',y:4,class:'relation-node-name'},clean.slice(7,13)+(clean.length>13?'…':'')));
      group.appendChild(svgNode('text',{'text-anchor':'middle',y:isRoot?22:21,class:'relation-node-category'},isRoot?i18n.t('relations.current'):node.label));
      let dragged=false,start=null;
      const move=e=>{
        if(!start||e.pointerId!==start.pointerId)return;
        if(!dragged&&Math.hypot(e.clientX-start.clientX,e.clientY-start.clientY)<3)return;
        const point=graphPoint(e);dragged=true;
        pos.x=start.x+point.x-start.point.x;pos.y=start.y+point.y-start.point.y;
        group.setAttribute('transform',`translate(${pos.x} ${pos.y})`);
        (edgeUpdates.get(key)||[]).forEach(update=>update());
      };
      group.addEventListener('pointerdown',e=>{
        // 建立关系时，目标节点上的 pointerdown 不能冒泡到画布，否则画布会先取消连线，
        // 随后的 click 就只剩普通选中，关系也就创建不出来了。
        if(ui.link){e.stopPropagation();return;}
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
    linkPreview=svgNode('path',{class:'relation-link-preview',fill:'none',stroke:'#547eb6','stroke-width':2,
      'stroke-dasharray':'7 5','marker-end':`url(#${markerId})`,opacity:0});
    layer.appendChild(linkPreview);
    let panStart=null;
    svg.addEventListener('pointerdown',e=>{
      if(ui.link){cancelLink();return;}
      if(e.target.closest('.relation-node')||e.target.closest('.relation-edge'))return;
      panStart={x:e.clientX,y:e.clientY,px:ui.pan.x,py:ui.pan.y,moved:false};svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove',e=>{
      if(ui.link)updateLink(graphPoint(e));
      if(!panStart)return;
      if(Math.hypot(e.clientX-panStart.x,e.clientY-panStart.y)>4)panStart.moved=true;
      const rect=svg.getBoundingClientRect();ui.pan={x:panStart.px+(e.clientX-panStart.x)*780/rect.width,y:panStart.py+(e.clientY-panStart.y)*490/rect.height};transform();
    });
    svg.addEventListener('pointerup',()=>{
      const wasPan=panStart;panStart=null;
      // 点在空白处（不是拖动平移）时退出单条目聚焦，重新显示全部关系。
      if(network&&wasPan&&!wasPan.moved&&ui.selected){ui.selected=null;detail();}
    });
    svg.addEventListener('wheel',e=>{e.preventDefault();ui.zoom=Math.max(.5,Math.min(2.5,ui.zoom*(e.deltaY>0?.9:1.1)));transform();},{passive:false});
    canvas.appendChild(svg);detail();
    if(ui.link)wrap.classList.toggle('relation-linking',true);
    count.textContent=i18n.t('relations.graph_count',{nodes:view.nodes.length,edges:view.edges.length})+'';
  };
  const count=h('span',{class:'small muted'});
  wrap.appendChild(h('div',{class:'relation-graph-head'},h('strong',{text:i18n.t('relations.graph')}),count,
    h('div',{class:'inline'},large?null:h('button',{class:'mini',text:'⤢',title:i18n.t('relations.large_view'),'aria-label':i18n.t('relations.large_view'),onclick:()=>{
      const dialog=modal(i18n.t('relations.graph'),relationGraph(center,pool,true,{changed}),[h('button',{text:i18n.t('common.close'),onclick:()=>dialog.close()})],()=>draw());dialog.dlg.classList.add('relation-wide-dialog');
    }}),h('button',{class:'mini relation-zoom',text:i18n.t('relations.zoom_out_short'),title:i18n.t('relations.zoom_out'),'aria-label':i18n.t('relations.zoom_out'),onclick:()=>{ui.zoom=Math.max(.5,ui.zoom-.2);transform();}}),
      h('button',{class:'mini relation-zoom',text:i18n.t('relations.zoom_in_short'),title:i18n.t('relations.zoom_in'),'aria-label':i18n.t('relations.zoom_in'),onclick:()=>{ui.zoom=Math.min(2.5,ui.zoom+.2);transform();}}),
      h('button',{class:'mini',text:i18n.t('relations.reset'),onclick:()=>{ui.expanded=[];ui.positions={};ui.zoom=1;ui.pan={x:0,y:0};ui.selected=network?null:root;draw();}}))));
  wrap.append(canvas,info,h('div',{class:'small muted relation-graph-hint',text:i18n.t(network?'relations.network_hint':'relations.radial_hint')}));draw();return wrap;
}
