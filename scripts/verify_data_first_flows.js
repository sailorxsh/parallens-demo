// Complete data remains usable while the chart script is pending, without rerendering late.
async(parent)=>{
 const browser=parent.context().browser(),base=new URL('.',parent.url()).href,results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));let releaseLibrary,libraryReleased=false;
  const gate=new Promise(r=>{releaseLibrary=()=>{libraryReleased=true;r();};});
  const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  const capture=async name=>{
   if(browser.browserType().name()!=='chromium')return;
   // A pending deferred script can keep fonts.ready pending in WebKit; Chrome CDP captures the actual frame.
   const session=await context.newCDPSession(p),shot=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   fs.writeFileSync(`output/playwright/v92-${name}-${width}.png`,Buffer.from(shot.data,'base64'));await session.detach();
  };
  try{
   await p.route('**/vendor/echarts.min.js*',async route=>{await gate;await route.continue();});
   await p.goto(`${base}#/D?country=US&metric=18&issue=18`,{waitUntil:'commit'});
   await p.getByRole('button',{name:'先查看数据表',exact:true}).waitFor();
   const status=await p.evaluate(()=>({progress:document.querySelector('#load-meter').value,total:document.querySelector('#load-meter').max,busy:document.querySelector('#main').getAttribute('aria-busy'),
    data:document.querySelector('#load-title').textContent,partial:!!document.querySelector('.detail-kpi'),charts:typeof window.echarts}));
   check(status.progress===status.total&&status.busy==='true'&&!status.partial&&status.charts==='undefined','Data-first choice appears before complete data or replaces normal waiting');
   await capture('library-choice');
   const choice=p.getByRole('button',{name:'先查看数据表',exact:true});await choice.focus();await p.keyboard.press('Enter');await ready();
   check(await p.locator('.load-panel').count()===0&&await p.locator('.action-record').count()===1,'Data-first mode stays busy or loses its deep-linked issue');
   check(p.url().includes('country=US')&&p.url().includes('metric=18')&&p.url().includes('issue=18'),'Data-first mode changes the requested scope');
   check(await p.locator('#open-metric-search').isEnabled()&&await p.getByRole('tab',{name:'完整数据',exact:true}).getAttribute('aria-selected')==='true',
    'Data-first choice does not open the complete-data view or enable navigation/search');
   check(await p.locator('.income-panel:not([hidden]) table:visible').first().isVisible(),'Complete calculation table is not readable without charts');
   const owner=p.locator('.action-record [name="owner"]');await owner.fill('Data-first QA');
   await p.locator('.action-record').getByRole('button',{name:'保存本地记录',exact:true}).click();
   check(await p.locator('.action-receipt').getAttribute('data-state')==='saved','Data-first issue cannot be saved while charts are pending');
   await p.locator('.action-record [name="note"]').fill('Preserve this draft when the chart script arrives');
   for(const page of ['A','B','C','D','E','F','G']){
    await p.locator(`.nav-link[data-page="${page}"]`).click();await ready();
    check(await p.locator('.topic-overview').count()===1&&await p.evaluate(()=>typeof window.echarts)==='undefined','Topic overview depends on the pending chart library');
    await p.locator('.topic-diagnose').first().click();await ready();
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();
    check(await p.locator('.income-panel:not([hidden]) table:visible').first().isVisible()&&await p.evaluate(()=>typeof window.echarts)==='undefined',
     'Data-first navigation loses complete data while charts are pending: '+page);
   }
   await p.goto(`${base}#/D?country=US&metric=18&issue=18&panel=data`,{waitUntil:'commit'});await ready();
   check(await owner.inputValue()==='Data-first QA'&&await p.locator('.action-record [name="note"]').inputValue()==='Preserve this draft when the chart script arrives',
    'Data-first navigation loses its saved record or draft');
   const before=await p.locator('.action-record-header').innerText();
   await p.evaluate(()=>{window.__dataFirstForm=document.querySelector('.action-record');});
   await capture('data-first');
   releaseLibrary();await p.waitForFunction(()=>!!window.echarts);await p.waitForLoadState('domcontentloaded');
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
   check(await p.evaluate(()=>window.__dataFirstForm===document.querySelector('.action-record')),'Late charts unexpectedly replace the working form');
   check(await owner.inputValue()==='Data-first QA'&&await p.locator('.action-record [name="note"]').inputValue()==='Preserve this draft when the chart script arrives'&&
    await p.locator('.action-record-header').innerText()===before,'Late charts lose the draft or its issue identity');
   await p.locator('.action-record').getByRole('button',{name:'保存本地记录',exact:true}).click();
   check(await p.locator('.action-receipt').getAttribute('data-state')==='saved','Data-first issue cannot be saved');
   const record=await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('parallens-demo-actions-v1'))).find(r=>r.evidenceId===18));
   check(record.owner==='Data-first QA'&&record.filters.country==='US'&&record.baseline&&record.baselineAt,'Data-first save changes the record scope or baseline');
   await p.locator('.action-record .insight-link').click();await ready();
   check(await p.locator('.income-panel:not([hidden]) .detail-chart svg').count()>0,'Explicit navigation after late arrival cannot show charts');
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Data-first desktop overflows');
   results.push({width,status,record:{id:record.evidenceId,country:record.filters.country,baseline:record.baseline,baselineAt:record.baselineAt}});
  }finally{
   if(!libraryReleased)releaseLibrary();
   await p.waitForLoadState('domcontentloaded').catch(()=>{});await context.close();
  }
 }
 for(const libraryOutcome of ['abort','continue']){
 const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 let releaseData,releaseLibrary;
 const dataGate=new Promise(r=>{releaseData=r;}),libraryGate=new Promise(r=>{releaseLibrary=r;});
 try{
  await p.route('**/vendor/echarts.min.js*',async route=>{await libraryGate;await route[libraryOutcome]();});
  await p.route('**/data/route-core.json*',async route=>{await dataGate;await route.abort();});
  await p.goto(base,{waitUntil:'commit'});
  await p.waitForFunction(()=>document.querySelector('#load-meter')?.value===document.querySelector('#load-meter')?.max-1,{},{polling:50});
  check(await p.getByRole('button',{name:'先查看数据表',exact:true}).count()===0&&
   await p.locator('#main').getAttribute('aria-busy')==='true','Incomplete data falsely enables the data-first choice');
  releaseData();await p.getByRole('button',{name:'重新加载',exact:true}).waitFor();
  check(await p.getByRole('button',{name:'先查看数据表',exact:true}).count()===0&&await p.locator('.home-results').count()===0,
   'Failed data exposes a partial dashboard or data-first choice');
  await p.unroute('**/data/route-core.json*');
  await p.getByRole('button',{name:'重新加载',exact:true}).focus();await p.keyboard.press('Enter');
  await p.getByRole('button',{name:'先查看数据表',exact:true}).click();
  await p.locator('.home-results').waitFor();
  check(await p.locator('.trend-table-wrap').evaluate(n=>n.open)&&
   await p.locator('.trend-table-wrap table').isVisible()&&await p.locator('.trend-table-wrap tbody tr').count()===12,
   'Homepage data-first choice does not open the complete weekly evidence');
  check(await p.locator('.status-details table').isVisible(),'Homepage data-first choice loses subscription status');
  check(await p.locator('#trendChart').evaluate(n=>n.getBoundingClientRect().height<100)&&
   await p.locator('.trend-panel .chart-scale-note').isHidden()&&
   await p.locator('.trend-table-wrap tbody tr').first().evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight),
   'Empty chart area or irrelevant axis notes hide the first table row below the desktop viewport');
  await p.evaluate(()=>{window.__dataFirstHome=document.querySelector('.home-results');});
  releaseLibrary();await p.waitForLoadState('domcontentloaded');
  check(await p.evaluate(()=>window.__dataFirstHome===document.querySelector('.home-results'))&&
   await p.locator('.trend-table-wrap').evaluate(n=>n.open),'Late library failure rerenders the data-first homepage');
  await p.screenshot({path:`output/playwright/v92-data-first-home-${browser.browserType().name()}-${libraryOutcome}.png`});
  if(libraryOutcome==='continue'){
   await p.getByRole('button',{name:'并列对照',exact:true}).click();
   await p.locator('#trendChart svg').waitFor();
   check(await p.locator('#trendChart').evaluate(n=>!n.classList.contains('chart-fallback')&&
    n.getAttribute('role')==='img'&&n.getBoundingClientRect().height>=200)&&
    await p.locator('.trend-panel .chart-scale-note').isVisible(),
    'Explicit redraw does not restore the real chart height, role or axis explanation');
   check(await p.locator('.trend-table-wrap').evaluate(n=>n.open),'Explicit redraw closes available evidence');
   await p.screenshot({path:`output/playwright/v92-data-first-home-${browser.browserType().name()}-restored.png`});
  }
  results.push({kind:'incomplete, failed, retry and homepage',dataRows:12,lateOutcome:libraryOutcome,noReplacement:true});
 }finally{
  releaseData();releaseLibrary();await p.waitForLoadState('domcontentloaded').catch(()=>{});await context.close();
 }
 }
 check(!errors.length,errors.join('; '));
 return {status:'PASS',checks:['complete-data gate at three desktop sizes','native keyboard choice','direct scope, metric and issue preserved',
  'calculation table and navigation without charts','late script does not replace form or lose draft','save retains owner, scope and historical baseline',
  'explicit evidence navigation renders late charts','all seven topics retain complete data','incomplete or failed data never exposes the choice',
  'retry and homepage expose complete weekly and status tables','late library failure does not replace the homepage',
  'compact fallback exposes the first row and explicit redraw restores chart sizing and evidence',
  'no desktop overflow or runtime errors'],results};
}
