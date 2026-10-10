// Complete business review, cross-topic lookup, and browser history reading continuity.
async(parent)=>{
 const base=new URL('.',parent.url()).href,context=await parent.context().browser().newContext({viewport:{width:1600,height:1100},reducedMotion:'reduce'});
 const p=await context.newPage(),states=[],errors=[],check=(ok,msg)=>{if(!ok)throw new Error(msg);};
 p.on('pageerror',e=>errors.push(e.message));
 const settle=async()=>{await p.waitForFunction(()=>typeof lastRenderedHash!=='undefined'&&lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));};
 const open=async route=>{await p.goto(`${base}#/${route}`);await settle();};
 const state=()=>p.evaluate(()=>({hash:location.hash,top:scrollY,filters:{...filterState},panel:document.querySelector('.income-tab[aria-selected=true]')?.textContent,
   open:[...document.querySelectorAll('#main details[open]')].map(n=>[n.closest('[id]')?.id,n.querySelector(':scope > summary')?.textContent,n.querySelector('caption')?.textContent]),
   note:document.querySelector('.action-record [name=note]')?.value,baseline:document.querySelector('.action-record > .table-note')?.textContent}));
 const same=(a,b)=>{
  check(a.hash===b.hash&&Math.abs(a.top-b.top)<3,`History loses reading location: ${JSON.stringify({a,b})}`);
  check(JSON.stringify(a.filters)===JSON.stringify(b.filters)&&a.panel===b.panel,'History loses business scope or evidence panel');
  check(JSON.stringify(a.open)===JSON.stringify(b.open),'History closes or opens a different disclosure');
  check(a.note===b.note&&a.baseline===b.baseline,'History changes the draft or its historical baseline');
 };
 try{
  for(const [width,height] of [[1366,768],[1600,1100],[1920,1080]]){
   await p.setViewportSize({width,height});await open('');
   await p.locator('.home-signal[data-metric-id="18"]').click();await p.locator('.home-comparison-context .insight-link').click();await settle();
   check(p.url().includes('/D?metric=18&panel=groups'),'Home story loses its evidence destination');
   await p.locator('.filter-bar > summary').click();await p.getByLabel('国家/市场',{exact:true}).selectOption('US');await settle();await p.locator('.filter-bar > summary').click();
   const disclosure=p.locator('.income-panel:not([hidden]) .workspace-calculation > summary').first();await disclosure.click();
   await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();
   await p.locator('.action-record [name=note]').fill('美国试用批次复查中的私人草稿');
   await disclosure.evaluate(n=>n.scrollIntoView({block:'start'}));await settle();const before=await state();
   await p.keyboard.press('Control+k');await p.getByRole('searchbox').fill('不同设备型号的订阅表现');await p.keyboard.press('Enter');await settle();
   check(p.url().includes('/E?country=US&metric=39'),'Search loses the common business scope');
   await p.locator('.workspace-context > summary').filter({hasText:'其他付费结构与型号对照'}).click();
   await p.locator('.workspace-context[open]').first().scrollIntoViewIfNeeded();await settle();const other=await state();
   await p.goBack();await settle();same(before,await state());
   await p.goForward();await settle();same(other,await state());
   await p.goBack();await settle();same(before,await state());
   check(!(await p.evaluate(()=>JSON.stringify(history.state))).includes('私人草稿'),'Issue text leaks into browser history metadata');
   const fresh=await context.browser().newContext({viewport:{width,height},reducedMotion:'reduce'}),recipient=await fresh.newPage();
   try{
    await recipient.goto(p.url());await recipient.locator('#metric-evidence-18').waitFor();
    check(await recipient.getByLabel('国家/市场',{exact:true}).inputValue()==='US','Shared URL loses scope');
    check(await recipient.locator('.income-tab[aria-selected=true]').innerText()==='分组证据','Shared URL loses evidence panel');
    check(await recipient.locator('.action-record [name=note]').inputValue()==='','Shared URL transmits a private draft');
   }finally{await fresh.close();}
   states.push({width,height,flow:'home → filtered D evidence and draft → E lookup → back/forward → fresh shared URL',before,other});
  }
  await p.setViewportSize({width:1600,height:1100});await open('A');
  const button=p.locator('.chart-legend-button').first();await button.click();
  const selected=await p.locator('.chart-legend-button').evaluateAll(ns=>ns.map(n=>[n.textContent,n.getAttribute('aria-pressed')]));
  await p.locator('.sidebar-nav [data-page=C]').click();await settle();await p.goBack();await settle();
  check(JSON.stringify(await p.locator('.chart-legend-button').evaluateAll(ns=>ns.map(n=>[n.textContent,n.getAttribute('aria-pressed')])))===JSON.stringify(selected),'History resets a user-hidden chart series');
  const a=await state();
  await p.locator('.sidebar-nav [data-page=C]').click();await settle();
  await p.evaluate(()=>scrollTo({top:700,behavior:'instant'}));await settle();const c=await state();
  await p.evaluate(()=>new Promise(resolve=>{
    let count=0;const listener=()=>{if(++count===1)setTimeout(()=>history.forward(),0);else{window.removeEventListener('popstate',listener);resolve();}};
    window.addEventListener('popstate',listener);history.back();
  }));
  await settle();same(c,await state());
  await p.goBack();await settle();same(a,await state());
  await open('D?metric=18&panel=groups&issue=18');
  await p.locator('.income-evidence > .section-top .issue-register').click();await settle();
  const disclosure=p.locator('.income-panel:not([hidden]) .workspace-calculation > summary').first();await disclosure.click();
  // A real pointer click first brings the button into view. Snapshot that departure
  // position rather than treating Playwright's own scroll as an application defect.
  const register=p.locator('.income-evidence > .section-top .issue-register');
  await register.scrollIntoViewIfNeeded();await settle();const duplicate=await state();
  await register.click();await settle();
  check((await state()).hash===duplicate.hash,'Repeated registration did not exercise identical history URLs');
  await p.evaluate(()=>scrollTo({top:700,behavior:'instant'}));await settle();const secondDuplicate=await state();
  await p.goBack();await settle();same(duplicate,await state());
  await p.goForward();await settle();same(secondDuplicate,await state());
  check(!errors.length,errors.join('; '));
  return {status:'PASS',checks:['homepage evidence destination','filtered cross-topic lookup','back/forward reading position and disclosures',
   'draft and baseline preservation','share URL scope with no draft transfer','native legend selection restoration','rapid back/forward without stale restoration','separate reading states for identical URLs','three desktop sizes','no runtime errors'],states};
 }finally{await context.close();}
}
