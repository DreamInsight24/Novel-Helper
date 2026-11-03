// SPDX-License-Identifier: GPL-3.0-or-later
// Real-browser settings layout and page-scoped group recovery; isolated temporary data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const root=path.resolve(__dirname,'..'),runtime=fs.mkdtempSync(path.join(os.tmpdir(),'novelhelper_record_layout_'));
  const out=process.env.SCREENSHOT_DIR || path.join(os.tmpdir(),'novel-helper-record-layout');fs.mkdirSync(out,{recursive:true});
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const log=fs.openSync(path.join(runtime,'server.log'),'w');
  const server=spawn(process.env.PYTHON || path.join(root,'.venv/bin/python'),['-B',path.join(root,'app/run.py'),'--no-window','--port',String(port)],{
    env:{...process.env,NOVELHELPER_HOME:runtime,NOVELHELPER_DATA:path.join(runtime,'data')},cwd:root,stdio:['ignore',log,log]});
  let browser,page;
  try{
    const base=`http://127.0.0.1:${port}`;
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await wait(100);}
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(8000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const api=async(url,data)=>{const res=data===undefined?await page.request.get(base+url):await page.request.post(base+url,{data});assert.ok(res.ok(),url+': '+await res.text());return res.json();};
    const text=(key,params)=>page.evaluate(({key,params})=>i18n.t(key,params),{key,params});
    const button=async(key,scope=page)=>scope.getByRole('button',{name:await text(key),exact:true});
    await api('/api/settings/language',{language:'zh-CN'});
    const config=(await api('/api/settings/config')).global;config.onboarding={done:true};await api('/api/settings/config',{scope:'global',config});
    const novel=(await api('/api/novels',{title:'Settings layout acceptance'})).novel.id;await api('/api/novels/open',{id:novel});
    let db=(await api('/api/state')).collections;
    db.sections.items.push({key:'layout_custom',label:'Custom settings',on:true});await api('/api/collections/sections',{data:db.sections});
    const groups=()=>[{key:'Identity',children:[{key:'Name',value:'Original name'},{key:'Age',value:'22'}]},
      {key:'History',children:[{key:'Story',value:'Preserve this history'}]},{key:'Traits',children:[{key:'Detail',value:'Preserve this detail'}]}];
    const collections=['characters','factions','items','other',...db.sections.items.map(section=>'section_'+section.key)];
    for(const coll of collections)await api('/api/collections/'+coll,{data:{categories:['One','Two'],items:Array.from({length:14},(_,i)=>({
      id:coll+'_'+i,name:coll+' record '+i,category:i%2?'Two':'One',tags:i%2?['odd']:['even'],elements:groups(),content:'Supplement '+i,inventory:[],equipment:[]}))}});
    const world=db.worldmap;world.regions=Object.fromEntries(Array.from({length:14},(_,i)=>['region_'+i,{id:'region_'+i,name:'Region '+i,elements:groups(),parent:'',summary:'Region summary'}]));
    await api('/api/collections/worldmap',{data:world});
    await page.goto(base);await page.waitForSelector('.novel-card');await page.evaluate(id=>switchNovel(id),novel);
    // Every record-backed settings section gets the same full-width layout and controls.
    for(const coll of collections){
      await page.evaluate(view=>go(view),coll);
      assert.equal(await page.locator('.record-strip-option').count(),14,coll+' entries');
      assert.equal(await page.locator('.record-list-column').count(),0);
      const geometry=await page.evaluate(()=>{
        const strip=document.querySelector('.record-strip'),editor=document.querySelector('.record-detail');
        const a=strip.getBoundingClientRect(),b=editor.getBoundingClientRect();
        return {above:a.bottom<=b.top,overflow:strip.scrollWidth>strip.clientWidth,oneRow:Array.from(strip.children).every(item=>Math.abs(item.getBoundingClientRect().top-a.top)<6)};
      });
      assert.ok(geometry.above&&geometry.overflow&&geometry.oneRow,coll+' top horizontal strip');
      assert.equal(await page.locator('.record-element-group .record-group-delete').count(),3,coll+' deletable groups');
      await page.locator('.record-strip-option').last().click();
      assert.equal(await page.locator('.record-name-input').inputValue(),coll+' record 13');
      await page.locator('.record-strip-option').last().focus();await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('.record-name-input').inputValue(),coll+' record 12');
    }
    await page.evaluate(()=>go('characters'));
    await page.locator('.record-strip-option').first().click();
    const groupKeys=()=>page.locator('.record-element-group').evaluateAll(elements=>elements.map(el=>el.dataset.groupKey));
    const identity=page.locator('.record-element-group[data-group-key="Identity"]');
    const traits=page.locator('.record-element-group[data-group-key="Traits"]');
    await identity.locator('.record-group-drag').dragTo(traits.locator('summary'),{targetPosition:{x:60,y:30}});
    assert.deepEqual(await groupKeys(),['History','Traits','Identity'],'Native dragging changes group order');
    await page.locator('.record-element-group[data-group-key="Identity"] .record-group-drag').focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await groupKeys(),['History','Identity','Traits'],'Keyboard reordering follows the same data order');
    await identity.locator('summary').click({position:{x:100,y:15}});
    const wasOpen=await identity.evaluate(el=>el.open);
    const before=await page.evaluate(()=>JSON.stringify(state.db.characters.items[0].elements));
    await identity.locator('.record-group-delete').click();
    assert.equal(await identity.count(),0);assert.ok(await page.locator('.record-group-recovery').isVisible());
    await page.locator('.record-strip-option').nth(1).click();assert.equal(await page.locator('.record-group-recovery').count(),0);
    await page.locator('.record-strip-option').first().click();
    await page.getByRole('tab',{name:await text('records.tab_relations'),exact:true}).click();
    await page.getByRole('tab',{name:await text('records.tab_content'),exact:true}).click();
    await (await button('records.restore_group')).click();
    assert.equal(await page.evaluate(()=>JSON.stringify(state.db.characters.items[0].elements)),before,'Undo restores original nested data and order');
    assert.equal(await identity.evaluate(el=>el.open),wasOpen,'Undo preserves expanded state');
    await identity.locator('.record-group-delete').click();
    await page.locator('.record-element-group[data-group-key="History"] .record-group-delete').click();
    await (await button('records.restore_groups')).click();
    assert.equal(await page.evaluate(()=>JSON.stringify(state.db.characters.items[0].elements)),before);
    await identity.locator('.record-group-delete').click();
    await page.evaluate(()=>go('items'));await page.evaluate(()=>go('characters'));
    assert.equal(await page.locator('.record-group-recovery').count(),0,'Leaving ends recovery');
    assert.equal(await identity.count(),0,'Leaving keeps the deletion');
    await page.evaluate(()=>flushPendingSaves());
    await page.reload();await page.waitForSelector('.novel-card');await page.evaluate(id=>switchNovel(id),novel);await page.evaluate(()=>go('characters'));
    assert.equal(await identity.count(),0,'Deleted groups stay deleted after reload');
    assert.equal(await page.locator('.record-group-recovery').count(),0);
    // Other settings retain bulk selection, category and tag filters.
    await page.evaluate(()=>go('other'));
    await page.locator('.record-strip-item input[type=checkbox]').first().check();
    assert.equal(await page.evaluate(()=>state.sel.other.size),1);
    await page.locator('[data-record-filter=category]').selectOption(JSON.stringify('Two'));
    assert.equal(await page.locator('.record-strip-option').count(),7);
    await page.evaluate(()=>go('items'));await page.locator('[data-record-filter=tag]').selectOption('odd');
    assert.equal(await page.locator('.record-strip-option').count(),7);
    // Inventory has no left column; map regions use the same picker and group controls.
    await page.evaluate(()=>go('inventory'));
    assert.equal(await page.locator('.record-strip-option').count(),14);
    await page.locator('.record-strip-option').first().focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(()=>state.ui.inventory.sel),'characters_1');
    assert.ok(await page.locator('.record-strip-option[aria-pressed=true]').evaluate(el=>el===document.activeElement));
    await page.evaluate(()=>go('world'));
    await page.locator('.record-strip-option').first().click();
    assert.equal(await page.locator('.record-element-group').count(),3);
    await page.locator('.world-region-workspace .record-editor-column input[type=text]').first().fill('Renamed region');
    assert.equal(await page.locator('.world-region-workspace .record-strip-option').first().innerText(),'Renamed region');
    await page.locator('.record-element-group').first().locator('.record-group-delete').click();
    await (await button('records.restore_group')).click();
    assert.equal(await page.locator('.record-element-group').count(),3);
    // Fresh language loads ensure top-level translations and labels are consistent.
    for(const lang of ['zh-CN','en-US']){
      await page.evaluate(()=>flushPendingSaves());await page.goto(base+'/?lang='+lang);await page.waitForSelector('.novel-card');
      await page.evaluate(id=>switchNovel(id),novel);
      for(const size of [{width:1024,height:720},{width:1440,height:900}]){
        await page.setViewportSize(size);
        for(const view of ['characters','items','section_layout_custom','inventory','world']){
          await page.evaluate(view=>go(view),view);
          if(view==='world'){await page.locator('.record-strip-option').first().click();await page.locator('.world-region-workspace').scrollIntoViewIfNeeded();}
          if(view==='characters'){
            await page.locator('.record-strip-option').nth(1).click();
            await page.locator('.record-element-group').first().locator('.record-group-delete').click();
          }
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await wait(150);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,view+'/'+size.width+' overflow');
          await page.screenshot({path:path.join(out,`${lang}-${view}-${size.width}.png`)});
          if(view==='characters')await (await button('records.restore_group')).click();
        }
      }
    }
    await page.evaluate(()=>go('items'));await page.locator('.record-strip-option').last().click();
    await page.getByRole('button',{name:await page.evaluate(()=>i18n.t('records.new',{singular:defFor('items').singular})),exact:true}).click();
    assert.ok(await page.locator('.record-strip-option[aria-pressed=true]').evaluate(el=>{
      const parent=el.closest('.record-strip').getBoundingClientRect(),bounds=el.getBoundingClientRect();
      return bounds.left>=parent.left && bounds.right<=parent.right;
    }),'New records are visible even when the picker was scrolled to the end');
    await page.evaluate(()=>flushPendingSaves());
    assert.deepEqual(errors,[]);fs.rmSync(path.join(out,'failure.png'),{force:true});
    console.log('PASS: '+collections.length+' settings sections, horizontal selection/keyboard/filters, native group drag, full undo until leave, reload persistence, inventory/map compatibility; 20 bilingual screenshots: '+out);
  }catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png')});console.error((await page.locator('body').innerText()).slice(-3000));}throw error;}
  finally{if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));fs.closeSync(log);fs.rmSync(runtime,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
