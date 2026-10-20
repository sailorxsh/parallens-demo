// Cross-metric references remain inspectable but cannot look like the current calculation's source.
async parent => {
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 const open=async q=>{await p.goto('http://127.0.0.1:8765/#/'+q);await ready();};
 try {
  for(const scope of ['', '&country=US'])for(const id of [2,3,6,21,17,18,19,20,5,22,23,32,33,52]) {
   await open(`D?metric=${id}&panel=groups${scope}`);
   const state=await p.evaluate(()=>{
    const sample=document.querySelector('.trial-samples'),chart=[...document.querySelectorAll('#D-panel-groups .detail-chart-panel')].find(n=>n.querySelector('h3')?.textContent.includes('有效订阅人数流转'));
    const read=n=>({exists:!!n,closed:!!n?.closest('details:not([open])'),label:n?.closest('.workspace-context')?.querySelector('summary')?.textContent});
    return {sample:read(sample),chart:read(chart)};
   });
   check(state.sample.exists&&state.sample.closed===(id!==18),'Trial sample ownership '+JSON.stringify({id,scope,state}));
   check(state.chart.exists&&state.chart.closed===(id!==21),'Subscription flow ownership '+JSON.stringify({id,scope,state}));
   results.push({id,scope,...state});
  }
  await open('D?metric=21&issue=21&panel=groups');
  const form=p.locator('.action-record');await form.locator('[name=owner]').fill('证据归属核查');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const saved=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
  await form.locator('[name=note]').fill('保留净增问题草稿');
  await p.getByRole('button',{name:'当前指标',exact:true}).click();
  const reference=p.locator('#D-panel-groups > .workspace-context').filter({hasText:'其他指标样本 · #18'});
  await reference.locator('> summary').focus();await p.keyboard.press('Enter');
  check(await reference.locator('.trial-sample-item').first().isVisible(),'Reference cannot be opened with keyboard');
  await p.getByRole('button',{name:'问题登记',exact:true}).click();
  check(await form.locator('[name=issueMetric]').inputValue()==='21'&&await form.locator('[name=note]').inputValue()==='保留净增问题草稿'&&await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===saved,'Inspecting another metric alters record or draft');
  await open('D?metric=21&panel=groups');
  await p.locator('.detail-chart svg').first().waitFor();
  await p.screenshot({path:'output/playwright/v214-evidence/after21.png'});
  await open('D?metric=23&panel=groups');
  const flow=p.locator('#D-panel-groups > .workspace-context').filter({hasText:'其他指标对照 · 有效订阅人数流转'});
  await flow.locator('> summary').focus();await p.keyboard.press('Enter');await flow.locator('.detail-chart svg').waitFor();
  check(await flow.locator('> summary').evaluate(n=>document.activeElement===n),'Opening reference chart loses focus');
  check(!errors.length,errors.join('; '));
  return {status:'PASS',results,referenceKeyboard:true,savedRecordAndDraftPreserved:true,errors};
 }finally{await c.close();}
}
