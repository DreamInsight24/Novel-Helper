// Real-browser member A acceptance. Requires Playwright and a locally installed Chrome.
// Uses an isolated runtime; never contacts an AI provider.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'novelhelper_a_browser_'));
  const out=process.env.SCREENSHOT_DIR || path.join(runtime,'screenshots');fs.mkdirSync(out,{recursive:true});
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const log=fs.openSync(path.join(runtime,'server.log'),'w');
  const server=spawn(process.env.PYTHON || path.join(root,'.venv/bin/python'),['-B',path.join(root,'app/run.py'),'--no-window','--port',String(port)],{
    cwd:root,env:{...process.env,NOVELHELPER_HOME:runtime,NOVELHELPER_DATA:path.join(runtime,'data')},stdio:['ignore',log,log]});
  let browser, page;
  try{
    const base=`http://127.0.0.1:${port}`;
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/state')).ok)break;}catch{}await delay(100);}
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    page=await browser.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const api=async(route,data)=>{
      const res=data===undefined?await page.request.get(base+route):await page.request.post(base+route,{data});
      assert.ok(res.ok(),`${route}: ${await res.text()}`);return res.json();
    };
    await api('/api/settings/language',{language:'zh-CN'});
    const cfg=(await api('/api/settings/config')).global;cfg.language='zh-CN';cfg.initial_language='zh-CN';cfg.onboarding={done:true};
    await api('/api/settings/config',{scope:'global',config:cfg});
    const novel=(await api('/api/novels',{title:'A acceptance'})).novel.id;await api('/api/novels/open',{id:novel});
    await page.goto(base);await page.getByRole('button',{name:'继续写作',exact:true}).click();
    await page.waitForFunction(()=>state.view==='writer' && !state.switchingNovel);
    await page.evaluate(()=>go('characters'));
    assert.equal(await page.getByRole('button',{name:'AI 生成设定',exact:true}).count(),1,'Empty state has only the header AI button');
    await page.getByRole('button',{name:'＋ 新建人物',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0,'New record is created inline');
    await page.locator('.record-name-input').fill('林默');
    assert.ok(await page.getByRole('textbox',{name:'本名',exact:true}).isVisible(),'Template is immediately visible');
    await page.getByRole('textbox',{name:'年龄',exact:true}).fill('22');
    await page.evaluate(()=>go('items'));
    await page.getByRole('button',{name:'＋ 新建物品',exact:true}).click();
    await page.locator('.record-name-input').fill('短剑');
    await page.getByRole('button',{name:'添加类别',exact:true}).click();
    await page.getByRole('dialog').getByRole('textbox').fill('验收分类');
    await page.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click();
    await page.getByRole('textbox',{name:'标签',exact:true}).fill('武器,常用');
    await page.getByRole('button',{name:'添加标签',exact:true}).click();
    assert.ok((await page.locator('[data-record-filter="tag"] option').allTextContents()).includes('武器'),'New tags refresh filter immediately');
    await page.locator('[data-record-filter="tag"]').selectOption('武器');
    assert.equal(await page.locator('.record-name-input').inputValue(),'短剑');
    await page.getByRole('button',{name:'管理标签',exact:true}).click();
    // Inputs keep live values as DOM properties; find the matching row through its textbox.
    const rows=page.getByRole('dialog').locator('.category-manage-row');
    for(let i=0;i<await rows.count();i++)if(await rows.nth(i).getByRole('textbox').inputValue()==='武器'){
      await rows.nth(i).getByRole('textbox').fill('近战');await rows.nth(i).getByRole('button',{name:'保存',exact:true}).click();break;
    }
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    assert.ok((await page.locator('[data-record-filter="tag"] option').allTextContents()).includes('近战'));
    await page.getByRole('button',{name:'管理分类',exact:true}).click();
    const categoryRows=page.getByRole('dialog').locator('.category-manage-row');
    for(let i=0;i<await categoryRows.count();i++)if(await categoryRows.nth(i).getByRole('textbox').inputValue()==='验收分类'){
      await categoryRows.nth(i).getByRole('button',{name:'删除',exact:true}).click();break;
    }
    assert.equal(await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
    assert.equal(await page.locator('.record-detail select').first().inputValue(),'','Deleting a category keeps its record uncategorized');
    // Settings management hosts the compact local upload panel.
    await page.evaluate(()=>go('sections'));
    await page.getByRole('button',{name:'导入设定',exact:true}).click();
    await page.getByRole('dialog').locator('select').first().selectOption('other');
    await page.locator('.settings-import-fields input[type=file]').setInputFiles({name:'local.TXT',mimeType:'text/plain',buffer:Buffer.from('Local TXT acceptance content')});
    await page.waitForFunction(()=>document.querySelectorAll('.settings-import-fields select')[1]?.value);
    await page.getByRole('dialog').getByRole('button',{name:'导入',exact:true}).click();
    await page.waitForFunction(()=>state.db.other.items.some(record=>record.content==='Local TXT acceptance content'));
    await page.evaluate(()=>go('other'));
    await page.getByRole('button',{name:'AI 生成设定',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'读取',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#setting-gen-source')?.value==='Local TXT acceptance content');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>go('writer'));
    await page.locator('.agent-target summary').click();
    await page.getByRole('button',{name:'不限字数',exact:true}).click();
    assert.equal(await page.locator('.agent-target-menu input').isVisible(),false);
    await page.getByRole('button',{name:'限定字数',exact:true}).click();
    await page.locator('.agent-target-menu input').fill('1234');
    await page.locator('.agent-target summary').click();
    await page.locator('.agent-model summary').click();
    await page.locator('.agent-model-item', {hasText: 'deepseek-v4-pro'}).click();
    await page.locator('.agent-prompt').fill('Acceptance request');
    let sent;
    await page.route('**/api/workstation/stream', async route => {
      sent = route.request().postDataJSON();
      await route.fulfill({status:200,contentType:'application/x-ndjson; charset=utf-8',
        body: JSON.stringify({type:'error',error:'Acceptance request captured',status:400})+'\n'});
    });
    await page.getByRole('button',{name:'开始生成',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[role=alert]'));
    assert.equal(sent.override.model,'deepseek-v4-pro');assert.equal(sent.selection.target_chars,1234);assert.equal(sent.selection.strict_length,true);
    await page.locator('.agent-target summary').click();await page.getByRole('button',{name:'不限字数',exact:true}).click();await page.locator('.agent-target summary').click();
    const unlimitedRequest=page.waitForRequest('**/api/workstation/stream');
    await page.getByRole('button',{name:'开始生成',exact:true}).click();await unlimitedRequest;
    await page.waitForFunction(()=>!state.ui.generating);
    assert.equal('target_chars' in sent.selection,false);assert.equal(sent.selection.length_mode,'unlimited');
    await page.unroute('**/api/workstation/stream');
    await page.evaluate(()=>{state.ui.wsError='';state.ui.generating=null;state.db.state.workstation.prompt='';renderMain();});
    for(const lang of ['zh-CN','en-US']){
      await page.evaluate(()=>flushPendingSaves());
      await page.goto(base+'/?lang='+lang);
      await page.waitForFunction(()=>typeof switchNovel==='function' && state.activeNovelId && state.db);
      await page.evaluate(()=>switchNovel(state.activeNovelId));
      await page.evaluate(()=>document.fonts.ready);
      for(const viewport of [{width:1024,height:720},{width:1440,height:900}]){
        await page.setViewportSize(viewport);
        for(const view of ['characters','items','writer','sections']){
          await page.evaluate(view=>go(view),view);
          if(view==='writer'){
            await page.locator('.agent-target summary').click();
            if(viewport.width===1440)await page.locator('.agent-target-menu .seg button').first().click();
          }
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${lang}/${view}/${viewport.width} horizontal overflow`);
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          await delay(150);
          await page.screenshot({path:path.join(out,`${lang}-${view}-${viewport.width}.png`)});
        }
      }
    }
    fs.rmSync(path.join(out,'failure.png'),{force:true});
    assert.deepEqual(errors,[],'No browser runtime errors');
    console.log('PASS: inline templates, categories/tags, local TXT upload, AI file read, model request and length switch; bilingual 1024/1440 screenshots: '+out);
  }catch(error){
    if(page){await page.screenshot({path:path.join(out,'failure.png')});console.error((await page.locator('body').innerText()).slice(-4000));}
    throw error;
  }finally{
    if(browser)await browser.close();server.kill();await new Promise(resolve=>server.once('exit',resolve));fs.closeSync(log);
    // Keep only explicitly requested screenshot artifacts outside the temporary runtime.
    fs.rmSync(runtime,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
