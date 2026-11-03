/* Global character cards. No novel collection or AI context dependency. */
'use strict';
function cardImageUrl(card) { return card.image ? '/api/cards/images/'+encodeURIComponent(card.image) : '/card-default.svg'; }

/** 封面图加载失败时退回默认图，避免破图标。 */
function cardImage(card) {
  const img=h('img',{src:cardImageUrl(card),alt:i18n.t('cards.portrait',{name:card.name || i18n.t('common.unnamed')}),loading:'lazy'});
  img.addEventListener('error',()=>{if(!img.src.endsWith('/card-default.svg'))img.src='/card-default.svg';});return img;
}

/** 独立「角色卡」页：整页网格，点卡片进编辑弹窗。 */
function viewCharacterCards(main) {
  const ui=state.ui.cards=state.ui.cards || {q:'',sort:'updated'};
  const section=h('section',{class:'character-cards','aria-label':i18n.t('cards.title')});
  const grid=h('div',{class:'character-card-grid'});
  const search=h('input',{type:'search',value:ui.q,placeholder:i18n.t('cards.search'),'aria-label':i18n.t('cards.search'),oninput:event=>{ui.q=event.target.value;drawGrid();}});
  const sort=h('select',{'aria-label':i18n.t('cards.sort'),onchange:event=>{ui.sort=event.target.value;drawGrid();}},
    ['updated','created','name'].map(value=>h('option',{value,text:i18n.t('cards.sort_'+value),selected:ui.sort===value})));
  const add=h('button',{class:'primary',text:i18n.t('cards.add'),onclick:()=>openCardEditor(null,handlers)});
  const tools=h('div',{class:'inline character-card-tools'},search,sort);
  section.appendChild(pageHead(i18n.t('cards.title'),i18n.t('cards.description'),add));
  section.appendChild(tools);
  section.appendChild(grid);main.appendChild(section);
  let items=[];
  const refocus=id=>{
    const card=id&&grid.querySelector('.character-card[data-id="'+id+'"]');
    const target=card || (add.hidden?(tools.hidden?grid.querySelector('.character-card-empty button'):search):add);
    target?.focus?.({preventScroll:true});
  };
  const handlers={
    onSaved:result=>{
      items=result.items;drawGrid();
      // 新建的卡片可能被当前搜索条件挡住，先清掉筛选再画一次，免得看起来没保存。
      const id=result.card&&result.card.id;
      if(id && ui.q.trim() && !grid.querySelector('.character-card[data-id="'+id+'"]')){ui.q='';search.value='';drawGrid();}
      toast(i18n.t('cards.saved'),'ok');
    },
    onImage:result=>{items=result.items;drawGrid();},
    onDeleted:result=>{items=result.items;drawGrid();toast(i18n.t('common.deleted'),'ok');refocus(null);},
    // 关掉弹窗后把焦点还给刚编辑的卡片（被删掉就落到空态或「添加角色卡」）。
    onClose:id=>refocus(id)
  };
  const load=async()=>{
    try{
      const result=await api('/api/cards');if(!section.isConnected)return;
      items=result.items;drawGrid();
    }catch(error){grid.textContent=error.message;}
  };
  const drawGrid=()=>{
    clear(grid);
    const query=ui.q.trim().toLocaleLowerCase();
    const shown=items.filter(card=>[card.name,card.gender,card.role,card.summary,...(card.tags||[])].join(' ').toLocaleLowerCase().includes(query));
    shown.sort((a,b)=>ui.sort==='name'?a.name.localeCompare(b.name):String(b[ui.sort] || '').localeCompare(String(a[ui.sort] || ''))||a.name.localeCompare(b.name));
    if(!shown.length)grid.appendChild(h('div',{class:'card muted character-card-empty'},
      h('div',{class:'empty-icon'},svgIcon(ICONS.user,34)),
      h('p',{text:i18n.t(items.length?'cards.no_results':'cards.empty')}),h('button',{class:'primary',text:i18n.t('cards.add'),onclick:()=>add.click()})));
    // 空态已经有一个「添加角色卡」，页头那个就不要同时出现；一条都没有时搜索排序也没有意义。
    add.hidden = !items.length;
    tools.hidden = !items.length;
    shown.forEach(card=>grid.appendChild(h('button',{class:'character-card','data-id':card.id,'aria-label':i18n.t('cards.open',{name:card.name}),
      onclick:()=>openCardEditor(card,handlers)},
      h('div',{class:'character-card-image'},cardImage(card)),
      h('div',{class:'character-card-info'},h('strong',{text:card.name}),h('span',{text:card.gender || i18n.t('cards.unspecified')}),h('span',{text:card.role || i18n.t('cards.unspecified')})))));
    i18n.apply(grid);
  };
  grid.appendChild(h('p',{class:'muted',text:i18n.t('common.loading')}));load();
}

/**
 * 角色卡新建 / 编辑弹窗：图片、字段、保存与删除都在一个窗口里完成，
 * 列表本身只负责浏览、搜索和排序。
 */
function openCardEditor(original, handlers) {
  handlers=handlers || {};
  const isNew=!(original && original.id);
  const draft=Object.assign({name:'',gender:'',role:'',age:'',tags:[],summary:'',notes:''},original || {});
  draft.tags=(draft.tags || []).slice();
  let busy=false,savedId=null;

  const preview=h('div',{class:'character-edit-preview'},cardImage(draft));
  const upload=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp',hidden:true});
  const uploadButton=h('button',{text:i18n.t('cards.upload'),disabled:isNew,onclick:()=>upload.click()});
  upload.addEventListener('change',async()=>{
    const file=upload.files?.[0];if(!file)return;
    if(file.size>2*1024*1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)){toast(i18n.t('cards.image_invalid'),'err');return;}
    uploadButton.disabled=true;
    try{
      const data_url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      const result=await api('/api/cards/image',{method:'POST',body:{id:draft.id,data_url}});
      draft.image=result.card.image;clear(preview);preview.appendChild(cardImage(draft));
      handlers.onImage?.(result);
    }catch(error){toast(error.message,'err');}finally{uploadButton.disabled=false;upload.value='';}
  });

  const fields={};
  const fieldFor=(key,full)=>{
    const label=i18n.t('cards.'+key),long=key==='summary'||key==='notes';
    const input=h(long?'textarea':'input',{type:long?null:'text',rows:long?2:null,
      value:key==='tags'?draft.tags.join(', '):draft[key] || '','aria-label':label,maxlength:long?100000:200});
    fields[key]=input;
    return h('div',{class:'field'+(full?' full':'')},h('label',{text:label}),input);
  };

  const media=h('div',{class:'character-edit-media'},preview,upload,uploadButton,
    h('p',{class:'small muted',text:i18n.t(isNew?'cards.save_before_image':'cards.image_hint')}));
  const body=h('div',{class:'character-edit'},media,
    h('div',{class:'character-edit-fields'},
      fieldFor('name'),fieldFor('gender'),fieldFor('role'),fieldFor('age'),
      fieldFor('tags',true),fieldFor('summary',true),fieldFor('notes',true)));

  const saveButton=h('button',{class:'primary',text:i18n.t('common.save'),dataset:{noclose:'1'},onclick:async()=>{
    if(busy)return;
    const payload={};if(original&&original.id)payload.id=original.id;
    Object.entries(fields).forEach(([key,input])=>{
      payload[key]=key==='tags'?input.value.split(/[,，、]/).map(value=>value.trim()).filter(Boolean):input.value;
    });
    if(!String(payload.name || '').trim()){fields.name.focus();toast(i18n.t('cards.name_required'),'err');return;}
    busy=true;saveButton.disabled=true;
    try{
      const result=await api('/api/cards',{method:'POST',body:payload});
      savedId=result.card&&result.card.id;
      handlers.onSaved?.(result);
      dialog.close();
    }catch(error){toast(error.message,'err');}finally{busy=false;saveButton.disabled=false;}
  }});

  const removeButton=isNew?null:h('button',{class:'danger foot-start',text:i18n.t('common.delete'),dataset:{noclose:'1'},onclick:()=>{
    // 先关掉编辑窗口：确认弹窗会清空遮罩层，避免两个窗口叠在一起。
    dialog.close();
    confirmDialog(i18n.t('common.delete'),i18n.t('cards.delete_confirm',{name:original.name}),async()=>{
      try{const result=await api('/api/cards/delete',{method:'POST',body:{id:original.id}});handlers.onDeleted?.(result);}
      catch(error){toast(error.message,'err');}
    },{confirmLabel:i18n.t('common.delete_named',{name:original.name}),danger:true});
  }});

  const dialog=modal(isNew?i18n.t('cards.add'):i18n.t('cards.edit'),body,
    [removeButton,h('button',{text:i18n.t('common.cancel'),onclick:()=>dialog.close()}),saveButton],
    ()=>handlers.onClose?.(savedId||(original&&original.id)||null),{size:'form'});

  fields.name.focus();
  return dialog;
}
