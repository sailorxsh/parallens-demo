// Inspect all metric destinations, while preserving access to explicitly identified reference charts.
async parent => {
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const check=(v,m)=>{if(!v)throw Error(m);};p.on('pageerror',e=>errors.push(e.message));
 const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 const open=async q=>{await p.goto('http://127.0.0.1:8765/#/'+q);await ready();};
 try {
  for(const code of 'ABCDEFG') {
   await open(code);const ids=await p.locator('.topic-metric').evaluateAll(ns=>ns.map(n=>Number(n.dataset.metricId)));
   for(const country of ['','US'].filter(v=>!v||['A','F'].includes(code)))for(const id of ids) {
    await open(`${code}?metric=${id}&panel=groups${country?'&country='+country:''}`);
    const foreign=await p.evaluate(({code,id})=>[...document.querySelectorAll(`#${code}-panel-groups [data-evidence-metric]`)].filter(n=>+n.dataset.evidenceMetric!==id&&!n.closest('details:not([open]),[hidden]')).map(n=>n.querySelector('h3')?.textContent),{code,id});
    check(!foreign.length,'Foreign primary chart '+JSON.stringify({code,id,country,foreign}));
    if([14,48].includes(id)) {
     const available=await p.evaluate(id=>metric(id).kind!=='na',id),own=p.locator(`#${code}-panel-groups [data-evidence-metric="${id}"]`);
     if(available)check(await own.first().isVisible(),'Own chart hidden #'+id);
     else check(await own.count()===0,'Missing source invents own chart #'+id);
    }
    results.push({code,id,country});
   }
  }
  for(const [code,id,other]of [['A',11,14],['F',51,48]]) {
   await open(`${code}?metric=${id}&issue=${id}&panel=groups`);
   const form=p.locator('.action-record');await form.locator('[name=owner]').fill('跨指标证据检查');await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
   const stored=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY)),metricBefore=await p.evaluate(id=>JSON.stringify(metric(id)),id);
   await form.locator('[name=note]').fill('保留当前指标草稿');await p.getByRole('button',{name:'当前指标',exact:true}).click();
   const reference=p.locator(`#${code}-panel-groups > .workspace-context`).filter({has:p.locator(`[data-evidence-metric="${other}"]`)}),summary=reference.locator('> summary');
   check(await reference.count()===1&&!await reference.evaluate(n=>n.open),'Missing closed reference');
   check((await summary.innerText()).startsWith('其他指标对照'),'Reference has no ownership label');
   for(const width of [1366,1600,1920])for(const scale of [100,200]) {
    await p.setViewportSize({width,height:1000});await p.evaluate(n=>document.documentElement.style.fontSize=n+'%',scale);
    await summary.focus();await p.keyboard.press('Enter');await reference.locator('.detail-chart svg').waitFor();
    check(await summary.evaluate(n=>document.activeElement===n),'Opening reference loses focus');
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Reference overflows desktop');
    if(width===1600&&scale===100)await reference.screenshot({path:`output/playwright/v215-ownership/reference-${code}${id}.png`});
    await p.keyboard.press('Enter');check(!await reference.evaluate(n=>n.open),'Reference fails to close');
   }
   await p.getByRole('button',{name:'问题登记',exact:true}).click();
   check(await form.locator('[name=issueMetric]').inputValue()===String(id)&&await form.locator('[name=note]').inputValue()==='保留当前指标草稿'&&await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===stored&&await p.evaluate(id=>JSON.stringify(metric(id)),id)===metricBefore,'Reference changes issue, draft, source value or saved baseline');
   await p.evaluate(()=>document.documentElement.style.fontSize='100%');
  }
  check(!errors.length,errors.join('; '));return {status:'PASS',results,keyboardAndLayoutStates:12,savedRecordsAndDraftsPreserved:true};
 }finally{await c.close();}
}
