// Separate quality signals without inventing mapping history or changing saved scope.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),states=[],errors=[];
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const [metrics,trends,snapshot]=await Promise.all(['metric-values','metric-trends','snapshot'].map(async name=>{
  const response=await parent.request.get(`${base}data/${name}.json`);return response.json();
 }));
 const fixtures=[{name:'normal',loss:220,mapped:9650},{name:'loss',loss:410,mapped:9650},
  {name:'mapping',loss:220,mapped:9400},{name:'both',loss:410,mapped:9400},
  {name:'boundary',loss:300,mapped:9500},{name:'missing-limit',loss:220,mapped:9650,missing:true},
  {name:'low-sample',loss:1,mapped:9650,denominator:29}];
 let fixture=fixtures[0];
 const current=()=>p.locator('.workspace-observation>.detail-finding');
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const fresh=async hash=>{await p.goto('about:blank');await p.goto(`${base}#/${hash}`);await ready();};
 try{
  await p.route('**/data/metric-values.json',r=>{const data=structuredClone(metrics),v=data.m54.value;
   Object.assign(v.eventLoss,{numerator:fixture.loss,denominator:fixture.denominator??10000,value:fixture.loss/(fixture.denominator??10000)});
   Object.assign(v.idMapping,{numerator:fixture.mapped,value:fixture.mapped/10000});return r.fulfill({json:data});});
  await p.route('**/data/metric-trends.json',r=>{const data=structuredClone(trends);
   Object.assign(data.m54.points.at(-1),{numerator:fixture.loss,denominator:fixture.denominator??10000,value:fixture.loss/(fixture.denominator??10000)});return r.fulfill({json:data});});
  await p.route('**/data/snapshot.json',r=>{const data=structuredClone(snapshot);if(fixture.missing)delete data.quality.thresholds.eventLossMax;return r.fulfill({json:data});});
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});
   for(fixture of fixtures){
    await fresh('');await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();
    const pending=Boolean(fixture.missing||fixture.denominator),lossWarning=!pending&&fixture.loss>300,mappingWarning=!pending&&fixture.mapped<9500;
    const warning=lossWarning||mappingWarning,expected=fixture.denominator?'不适用':fixture.missing?'待核验':warning?'演示预警':'演示正常';
    const badge=p.locator('.quality-status'),badgeText=await badge.innerText();check(badgeText.includes(expected),`${fixture.name} ${width}/${size}: expected ${expected}, received ${badgeText}`);
    check(await badge.getAttribute('data-state')===(pending?'unavailable':warning?'warning':'normal'),'Homepage warning is not distinguished from a verified normal result');
    if(width===1600&&fixture.name==='mapping')await p.screenshot({path:`output/playwright/v122-audit/12-quality-warning-header-${browser.browserType().name()}.png`,scale:'css'});
    await badge.focus();await p.keyboard.press('Enter');await ready();
    check(p.url().endsWith('/G?metric=54')&&(await current().innerText()).includes(expected),'Quality entry loses the quality metric or status');
    const rows=current().locator('.quality-check');
    if(pending){check(await rows.count()===0,'Unverifiable data creates a confident check status');}
    else{
     check(await rows.count()===2,'Quality check is missing or duplicated');
     for(const [key,numerator,value,limit,failed,word,unit] of [
      ['eventLoss',fixture.loss,fixture.loss/100,3,lossWarning,'上限','事件'],
      ['idMapping',fixture.mapped,fixture.mapped/100,95,mappingWarning,'下限','记录']]){
      const row=current().locator(`[data-check=${key}]`),text=await row.innerText();
      check(await row.getAttribute('data-state')===(failed?'warning':'normal'),'The wrong quality signal is emphasized');
      check((await row.locator('strong').innerText())===`${value.toFixed(1)}%`&&text.includes(`${numerator.toLocaleString('zh-CN')} / 10,000 ${unit}`)&&
       text.includes(`${word} ${key==='eventLoss'?'≤':'≥'}${limit.toFixed(1)}%`),'Quality value, source counts, unit or comparison limit is wrong');
      check(text.includes(failed?key==='eventLoss'?'高于演示上限':'低于演示下限':'演示范围内'),'Status depends on color alone');
     }
     check((await current().innerText()).includes('ID映射覆盖率只有当前快照'),'Snapshot is presented as a mapping trend');
     const charts=await p.locator('.income-panel:not([hidden]) .detail-chart').evaluateAll(ns=>ns.map(n=>echarts.getInstanceByDom(n)?.getOption().series.map(s=>s.name)));
     check(charts.flat(2).every(name=>!name?.includes('映射')),'A mapping historical series was invented');
    }
    await current().locator('h3').first().scrollIntoViewIfNeeded();await ready();
    check(!await current().evaluate(n=>n.scrollWidth>n.clientWidth+1)&&!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Quality status overflows the desktop or enlarged text');
    if(width===1600&&fixture.name==='mapping')await p.screenshot({path:`output/playwright/v122-audit/11-quality-checks-${browser.browserType().name()}.png`,scale:'css'});
    if(width===1366&&size===32&&fixture.name==='mapping')await p.screenshot({path:`output/playwright/v122-audit/13-quality-checks-enlarged-${browser.browserType().name()}.png`,scale:'css'});
    states.push({width,size,fixture:fixture.name,expected,lossWarning,mappingWarning});
   }
  }
  fixture=fixtures[0];await fresh('G?metric=54&issue=54');const form=()=>p.locator('.action-record');
  await form().locator('[name=owner]').fill('质量核查');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  const original=await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1')),baseline=await form().locator('> .table-note').innerText();
  fixture=fixtures[2];await p.reload();await ready();
  check((await current().innerText()).includes('数据质量：演示预警')&&await form().locator('> .table-note').innerText()===baseline,'Current quality refresh overwrites or hides the registered baseline');
  await form().locator('[name=note]').fill('映射覆盖待核查的未保存草稿');
  await p.getByRole('button',{name:'当前指标',exact:true}).click();await ready();
  await current().locator('.finding-basis summary').click();
  check(await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===original&&await form().locator('[name=note]').inputValue()==='映射覆盖待核查的未保存草稿','Reading quality checks writes saved data or loses the draft');
  for(const query of ['country=US','appPlatform=iOS','productLine=Bird']){
   await fresh(`G?metric=54&${query}`);check(await p.locator('.quality-check').count()===0&&
    (await current().innerText()).includes('待补数据'),'Unsupported quality scope reuses a global result');
  }
  await fresh('G?metric=54&appPlatform=Android&panel=change');
  check(await p.evaluate(()=>metric(54).availability)==='pending','Unsupported quality scope is not pending');
  const unrelated=p.locator('#G-panel-change > .workspace-context').filter({hasText:'其他指标对照 · 异常发现'});
  check(await unrelated.count()===1&&!await unrelated.evaluate(n=>n.open),'Unavailable quality promotes another metric as its lead evidence');
  check(await p.locator('#G-panel-change svg:visible').count()===0,'Unrelated anomaly chart is visible as quality evidence');
  await unrelated.locator(':scope > summary').click();await unrelated.locator('svg').waitFor();
  check((await unrelated.innerText()).includes('单位：条')&&await p.locator('.income-context .detail-finding').getAttribute('data-metric-id')==='54','Explicit comparison loses its unit or replaces the quality subject');
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['independent loss and mapping failures','threshold equality remains normal','no confident status for missing limit or low sample',
   'source counts and units','native header entry','no fabricated mapping history','current warning with original baseline and draft','unsupported scope remains pending'],errors};
 }finally{await c.close();}
}
