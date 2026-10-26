async parent => {
 const context=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage(),results=[];
 const ready=()=>p.waitForFunction(()=>typeof lastRenderedHash!=='undefined'&&lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 try {
  for(const route of ['/','/A','/B','/C','/D','/E','/F','/G','/D?metric=18&panel=groups']) {
   await p.goto('http://127.0.0.1:8765/#'+route);await ready();
   const controls=await p.locator('.home-result-link,.node-link,.card-link,.home-signal-actions a,.topic-diagnose,.issue-register,.action-evidence-link').evaluateAll(ns=>ns.map(n=>{
    const normalize=s=>s.replace(/[\s↗↘↓]/g,'');
    return {visible:n.innerText,name:n.getAttribute('aria-label'),matches:normalize(n.getAttribute('aria-label')??n.innerText).includes(normalize(n.innerText))};
   }));
   check(controls.every(c=>c.matches),'Visible label omitted: '+JSON.stringify({route,controls:controls.filter(c=>!c.matches)}));results.push({route,count:controls.length});
  }
  await p.goto('http://127.0.0.1:8765/#/');await ready();
  await p.getByRole('link',{name:/^核对分组证据：试用转正/}).click();await ready();
  check(p.url().includes('metric=18')&&p.url().includes('panel=groups'),'Home evidence opens wrong scope');
  await p.getByRole('button',{name:/^登记 #18 问题：/}).click();
  const form=p.locator('.action-record');await form.locator('[name=owner]').fill('可见名称任务');await form.locator('[name=status]').selectOption('reviewing');await form.locator('[name=note]').fill('核对总体-1.6个百分点与组内-4.0个百分点，暂不归因。');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const before=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));check(before&&before.includes('可见名称任务'),'Record was not saved');
  await p.locator('.nav-link[data-page=E]').click();await ready();await p.reload();await ready();
  await p.getByRole('button',{name:/^已登记问题/}).click();await p.locator('#saved-issues-query').fill('可见名称任务');await p.getByRole('button',{name:/^打开 /}).click();await ready();
  check(await form.locator('[name=owner]').inputValue()==='可见名称任务','Saved issue not restored');
  check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===before,'Opening issue changed baseline');
  await form.locator('[name=note]').fill('未保存草稿仍应保留');await p.getByRole('button',{name:'当前指标',exact:true}).click();await p.getByRole('button',{name:/^登记 #18 试用→转正率问题/}).click();
  check(await form.locator('[name=note]').inputValue()==='未保存草稿仍应保留','Draft lost when reopening registration');
  return {status:'PASS',results,journey:['home visible label to D18 groups','compact visible registration label','save record','E reload and find original issue','baseline unchanged','full visible registration label preserves draft']};
 } finally {await context.close()}
}
