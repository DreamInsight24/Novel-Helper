/* Global character cards. No novel collection or AI context dependency. */
'use strict';
function cardImageUrl(card) { return card.image ? '/api/cards/images/'+encodeURIComponent(card.image) : '/card-default.svg'; }
function viewCharacterCards(main) {
  const ui=state.ui.cards=state.ui.cards || {selected:null,q:'',sort:'updated'};
  const section=h('section',{class:'character-cards','aria-label':i18n.t('cards.title')});
  const grid=h('div',{class:'character-card-grid'}),detail=h('aside',{class:'character-card-detail',hidden:true,'aria-label':i18n.t('cards.detail')});
  const search=h('input',{type:'search',value:ui.q,placeholder:i18n.t('cards.search'),'aria-label':i18n.t('cards.search'),oninput:event=>{ui.q=event.target.value;drawGrid();}});
  const sort=h('select',{'aria-label':i18n.t('cards.sort'),onchange:event=>{ui.sort=event.target.value;drawGrid();}},
    ['updated','created','name'].map(value=>h('option',{value,text:i18n.t('cards.sort_'+value),selected:ui.sort===value})));
  const add=h('button',{class:'primary',text:i18n.t('cards.add'),onclick:()=>{ui.selected=null;drawDetail({name:'',gender:'',role:'',age:'',tags:[],summary:'',notes:''});}});
  section.appendChild(pageHead(i18n.t('cards.title'),i18n.t('cards.description'),add));
  section.appendChild(h('div',{class:'inline character-card-tools'},search,sort));
  section.appendChild(h('div',{class:'character-card-layout'},grid,detail));main.appendChild(section);
  let items=[],active=true,busy=false,detailVersion=0;
  const load=async()=>{
    try{
      const result=await api('/api/cards');if(!section.isConnected)return;
      items=result.items;drawGrid();
      if(ui.selected){const card=items.find(item=>item.id===ui.selected);if(card)drawDetail(card);}
    }catch(error){grid.textContent=error.message;}
  };
  const imageFor=card=>{
    const img=h('img',{src:cardImageUrl(card),alt:i18n.t('cards.portrait',{name:card.name || i18n.t('common.unnamed')}),loading:'lazy'});
    img.addEventListener('error',()=>{if(!img.src.endsWith('/card-default.svg'))img.src='/card-default.svg';});return img;
  };
  const drawGrid=()=>{
    clear(grid);
    const query=ui.q.trim().toLocaleLowerCase();
    const shown=items.filter(card=>[card.name,card.gender,card.role,card.summary,...(card.tags||[])].join(' ').toLocaleLowerCase().includes(query));
    shown.sort((a,b)=>ui.sort==='name'?a.name.localeCompare(b.name):String(b[ui.sort] || '').localeCompare(String(a[ui.sort] || ''))||a.name.localeCompare(b.name));
    if(!shown.length)grid.appendChild(h('div',{class:'card muted character-card-empty'},
      h('p',{text:i18n.t(items.length?'cards.no_results':'cards.empty')}),h('button',{text:i18n.t('cards.add'),onclick:()=>add.click()})));
    shown.forEach(card=>grid.appendChild(h('button',{class:'character-card'+(ui.selected===card.id?' active':''),'aria-label':i18n.t('cards.open',{name:card.name}),
      onclick:()=>{ui.selected=card.id;drawGrid();drawDetail(card);}},
      h('div',{class:'character-card-image'},imageFor(card)),
      h('div',{class:'character-card-info'},h('strong',{text:card.name}),h('span',{text:card.gender || i18n.t('cards.unspecified')}),h('span',{text:card.role || i18n.t('cards.unspecified')})))));
    i18n.apply(grid);
  };
  const close=()=>{detailVersion++;active=false;ui.selected=null;detail.hidden=true;clear(detail);drawGrid();};
  function drawDetail(original){
    const version=++detailVersion;
    active=true;clear(detail);detail.hidden=false;
    const draft={...original,tags:[...(original.tags || [])]};
    const heading=h('h3',{text:original.id?original.name:i18n.t('cards.add'),tabindex:-1});
    const fields={};
    detail.appendChild(h('div',{class:'record-section-head'},heading,h('button',{class:'ghost mini',text:i18n.t('common.close'),onclick:close})));
    detail.appendChild(h('div',{class:'character-detail-image'},imageFor(draft)));
    const upload=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp',hidden:true});
    const uploadButton=h('button',{text:i18n.t('cards.upload'),disabled:!original.id,onclick:()=>upload.click()});
    upload.addEventListener('change',async()=>{
      const file=upload.files?.[0];if(!file)return;
      if(file.size>2*1024*1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)){toast(i18n.t('cards.image_invalid'),'err');return;}
      uploadButton.disabled=true;
      try{
        const data_url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
        const result=await api('/api/cards/image',{method:'POST',body:{id:original.id,data_url}});
        items=result.items;draft.image=result.card.image;drawGrid();
        if(active && version===detailVersion){const box=detail.querySelector('.character-detail-image');clear(box);box.appendChild(imageFor(draft));}
      }catch(error){toast(error.message,'err');}finally{uploadButton.disabled=false;upload.value='';}
    });
    detail.appendChild(h('div',{class:'field'},upload,uploadButton,h('p',{class:'small muted',text:i18n.t(original.id?'cards.image_hint':'cards.save_before_image')})));
    ['name','gender','role','age','tags','summary','notes'].forEach(key=>{
      const label=i18n.t('cards.'+key),long=key==='summary'||key==='notes';
      const input=h(long?'textarea':'input',{type:long?null:'text',rows:long?3:null,value:key==='tags'?draft.tags.join(', '):draft[key] || '',
        'aria-label':label,maxlength:long?100000:200});fields[key]=input;
      detail.appendChild(h('div',{class:'field'},h('label',{text:label}),input));
    });
    const save=h('button',{class:'primary',text:i18n.t('common.save'),onclick:async()=>{
      if(busy)return;
      const body={};if(original.id)body.id=original.id;
      Object.entries(fields).forEach(([key,input])=>body[key]=key==='tags'?input.value.split(/[,，、]/).map(value=>value.trim()).filter(Boolean):input.value);
      if(!body.name.trim()){fields.name.focus();toast(i18n.t('cards.name_required'),'err');return;}
      busy=true;save.disabled=true;
      try{const result=await api('/api/cards',{method:'POST',body});items=result.items;ui.selected=result.card.id;drawGrid();drawDetail(result.card);toast(i18n.t('cards.saved'),'ok');}
      catch(error){toast(error.message,'err');}finally{busy=false;save.disabled=false;}
    }});
    detail.appendChild(h('div',{class:'inline'},save,original.id?h('button',{class:'danger',text:i18n.t('common.delete'),onclick:()=>confirmDialog(
      i18n.t('common.delete'),i18n.t('cards.delete_confirm',{name:original.name}),async()=>{
        try{const result=await api('/api/cards/delete',{method:'POST',body:{id:original.id}});items=result.items;close();}
        catch(error){toast(error.message,'err');}
      })}):null));
    detail.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();add.focus();}};
    heading.focus();i18n.apply(detail);
  }
  grid.appendChild(h('p',{class:'muted',text:i18n.t('common.loading')}));load();
}
