// SPDX-License-Identifier: GPL-3.0-or-later
// Real Chrome acceptance in an isolated library. Playwright is a development-only tool.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const root=path.resolve(__dirname,'..'),runtime=fs.mkdtempSync(path.join(os.tmpdir(),'novelhelper_bc_'));
  const out=process.env.SCREENSHOT_DIR || path.join(os.tmpdir(),'novel-helper-bc-screenshots');fs.mkdirSync(out,{recursive:true});
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
    const text=key=>page.evaluate(key=>i18n.t(key),key);
    const button=async(key,scope=page)=>scope.getByRole('button',{name:await text(key),exact:true});
    await api('/api/settings/language',{language:'zh-CN'});
    const config=(await api('/api/settings/config')).global;config.onboarding={done:true};await api('/api/settings/config',{scope:'global',config});
    await page.goto(base);await page.waitForSelector('.character-cards');
    assert.ok(await page.locator('.novel-empty').isVisible(),'Card entry appears before any novel exists');
    await (await button('cards.add',page.locator('.page-head').last())).click();
    await page.getByRole('textbox',{name:await text('cards.name'),exact:true}).fill('Aster');
    await page.getByRole('textbox',{name:await text('cards.gender'),exact:true}).fill('Nonbinary');
    await page.getByRole('textbox',{name:await text('cards.role'),exact:true}).fill('Explorer');
    await page.getByRole('textbox',{name:await text('cards.tags'),exact:true}).fill('oc,traveller');
    await (await button('common.save',page.locator('.character-card-detail'))).click();
    await page.waitForFunction(()=>document.querySelectorAll('.character-card').length===1);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPioAAAAASUVORK5CYII=','base64');
    await page.locator('.character-card-detail input[type=file]').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:png});
    await page.waitForFunction(()=>document.querySelector('.character-detail-image img')?.src.includes('/api/cards/images/'));
    await api('/api/cards',{name:'Mira',gender:'Female',role:'Cartographer',summary:'A global character independent from novels.',tags:['oc']});
    await page.reload();await page.waitForSelector('.character-card');
    assert.equal(await page.locator('.character-card').count(),2);
    await page.getByRole('searchbox',{name:await text('cards.search'),exact:true}).fill('Mira');
    assert.equal(await page.locator('.character-card').count(),1);
    await page.locator('.character-card').focus();await page.keyboard.press('Enter');
    assert.ok(await page.locator('.character-card-detail').isVisible());
    await page.keyboard.press('Escape');assert.equal(await page.locator('.character-card-detail').isVisible(),false);
    await page.getByRole('searchbox',{name:await text('cards.search'),exact:true}).fill('');
    await page.locator('.character-card').filter({hasText:'Mira'}).click();
    await (await button('common.delete',page.locator('.character-card-detail'))).click();
    assert.equal(await (await button('common.cancel',page.getByRole('dialog'))).evaluate(el=>el===document.activeElement),true);
    await (await button('common.cancel',page.getByRole('dialog'))).click();
    assert.equal((await api('/api/cards')).items.length,2);
    const ratio=await page.locator('.character-card').first().evaluate(el=>el.querySelector('.character-card-image').getBoundingClientRect().height/el.getBoundingClientRect().height);
    assert.ok(Math.abs(ratio-.6)<.025,'Portrait occupies three fifths of the card');
    const novel=(await api('/api/novels',{title:'Network acceptance'})).novel.id;
    await page.reload();await page.waitForSelector('.novel-card');
    await page.evaluate(id=>switchNovel(id),novel);
    await page.evaluate(()=>go('characters'));
    await page.getByRole('button',{name:await page.evaluate(()=>i18n.t('records.new',{singular:defFor('characters').singular})),exact:true}).click();
    await page.locator('.record-name-input').fill('A');
    await page.getByRole('tab',{name:await text('records.tab_relations'),exact:true}).click();
    const newLink=async name=>{
      await (await button('records.add_relation',page.locator('main'))).click();
      const dialog=page.getByRole('dialog');
      await dialog.getByRole('combobox',{name:await text('relations.filter'),exact:true}).selectOption('characters');
      await dialog.getByRole('searchbox',{name:await text('relations.search'),exact:true}).fill(name);
      await (await button('records.create_linked',dialog)).click();
      await dialog.getByRole('combobox',{name:await text('relations.type'),exact:true}).fill('Knows');
      await dialog.getByRole('textbox',{name:await text('relations.note'),exact:true}).fill('Met on the road');
      await (await button('common.save',dialog)).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
    };
    await newLink('B');
    const initial=(await api('/api/state')).collections;
    assert.equal(initial.characters.items.length,2,'New endpoint and original debounced record are persisted before the edge');
    assert.equal(initial.relations.items.length,1);
    assert.ok(initial.characters.items[1].elements?.length || initial.characters.items[0].elements?.length,'New linked record applies its section template');
    assert.equal(await page.locator('.relation-node').count(),2);
    assert.equal(await page.locator('.relation-expand').count(),0);
    await page.evaluate(()=>{state.ui.characters.q='No match';state.ui.characters.tag='Hidden';});
    await page.locator('.relation-node[data-key$="'+initial.characters.items.find(item=>item.name==='B').id+'"]').dblclick();
    assert.equal(await page.locator('.record-name-input').inputValue(),'B');
    assert.equal(await page.getByRole('tab',{name:await text('records.tab_relations'),exact:true}).getAttribute('aria-selected'),'true');
    await newLink('C');
    const current=(await api('/api/state')).collections;
    const a=current.characters.items.find(item=>item.name==='A');
    await page.locator('.relation-node[data-key="characters:'+a.id+'"]').dblclick();
    assert.equal(await page.locator('.relation-node').count(),2,'A one-hop view excludes C beyond B');
    await (await button('relations.open_network')).click();
    assert.equal(await page.locator('.relation-node').count(),3,'Network contains the entire chain');
    await page.getByRole('searchbox',{name:await text('relations.search'),exact:true}).fill('C');
    assert.equal(await page.locator('.relation-node').count(),1);
    await page.getByRole('searchbox',{name:await text('relations.search'),exact:true}).fill('');
    await (await button('relations.zoom_in')).click();
    assert.ok(await page.evaluate(()=>state.ui.relationGraphs['network:all'].zoom>1));
    await (await button('relations.reset')).click();
    assert.equal(await page.evaluate(()=>state.ui.relationGraphs['network:all'].zoom),1);
    // Editing through the shared direct-list controls in the global graph.
    await page.locator('.relation-graph-info .relation-direct-list').getByRole('button',{name:await text('sections.edit_action'),exact:true}).first().click();
    let dialog=page.getByRole('dialog');
    assert.equal(await dialog.getByRole('textbox',{name:await text('relations.note'),exact:true}).inputValue(),'Met on the road');
    await dialog.getByRole('combobox',{name:await text('relations.direction'),exact:true}).selectOption('both');
    await dialog.getByRole('combobox',{name:await text('relations.type'),exact:true}).fill('Travels with');
    await (await button('common.save',dialog)).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
    assert.ok((await api('/api/state')).collections.relations.items.some(edge=>edge.type==='Travels with'&&edge.directed===false));
    // Create and unlink through the global entry point; keep the newly created record.
    await page.getByRole('combobox',{name:await text('relations.source'),exact:true}).selectOption('characters:'+a.id);
    await page.locator('.relation-network-tools button.primary').click();
    dialog=page.getByRole('dialog');
    await dialog.getByRole('combobox',{name:await text('relations.filter'),exact:true}).selectOption('items');
    await dialog.getByRole('searchbox',{name:await text('relations.search'),exact:true}).fill('Sword');
    await (await button('records.create_linked',dialog)).click();
    await (await button('common.save',dialog)).click();await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
    let linked=(await api('/api/state')).collections;const sword=linked.items.items.find(item=>item.name==='Sword');
    assert.ok(sword&&linked.relations.items.length===3);
    await page.locator('.relation-node[data-key="items:'+sword.id+'"]').click();
    await page.locator('.relation-graph-info .relation-direct-list').getByRole('button',{name:await text('records.remove_relation'),exact:true}).click();
    await (await button('common.confirm',page.getByRole('dialog'))).click();
    await page.waitForFunction(()=>state.db.relations.items.length===2);
    assert.equal((await api('/api/state')).collections.items.items.length,1,'Unlinking retains the endpoint record');
    // An unselected peer is referenced by name in context, without its body.
    const preview=await api('/api/ai/preview',{surface:'workstation',mode_id:'draft',selection:{record_selections:{characters:[a.id]},setting_categories:['characters']}});
    assert.ok(!preview.user.includes('## 条目关联')&&preview.user.includes('条目关联'));
    for(const lang of ['zh-CN','en-US']){
      await page.evaluate(()=>flushPendingSaves());await page.goto(base+'/?lang='+lang);
      await page.waitForSelector('.character-card');
      for(const size of [{width:1024,height:720},{width:1440,height:900}]){
        await page.setViewportSize(size);await page.evaluate(()=>go('home'));
        await page.waitForSelector('.character-card');
        await page.locator('.character-card').filter({hasText:'Mira'}).click();
        await page.locator('.character-cards').scrollIntoViewIfNeeded();
        await shot('cards');
        await page.evaluate(id=>switchNovel(id),novel);await page.evaluate(()=>go('relations'));await shot('network');
        await page.evaluate(ref=>openRelationRecord(ref),{collection:'characters',id:a.id});await shot('radial');
        await (await button('records.add_relation',page.locator('main'))).click();
        await shot('relation-dialog');await page.keyboard.press('Escape');
        await page.evaluate(()=>go('home'));
        async function shot(view){
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await wait(150);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${lang}/${view}/${size.width} overflow`);
          await page.screenshot({path:path.join(out,`${lang}-${view}-${size.width}.png`)});
        }
      }
    }
    assert.deepEqual(errors,[]);fs.rmSync(path.join(out,'failure.png'),{force:true});
    console.log('PASS: empty-library cards, image upload, search/keyboard/confirm, template-linked creation without debounce races, one-hop radial, full network, edit/filter/zoom/context; 16 bilingual screenshots: '+out);
  }catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png')});console.error((await page.locator('body').innerText()).slice(-3500));}throw error;}
  finally{if(browser)await browser.close();server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once('exit',resolve));fs.closeSync(log);fs.rmSync(runtime,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
