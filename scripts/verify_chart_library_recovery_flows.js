// Recover a failed shared chart resource in place, without replacing the user's form.
async parent=>{
 const browser=parent.context().browser(),base=new URL('.',parent.url()).href,states=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);};
 for(const width of [1366,1600,1920])for(const font of [16,32]){
  const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
  try{
   await p.route('**/vendor/echarts.min.js*',r=>r.abort());
   await p.goto(base+'#/D?country=US&metric=18&issue=18');await ready();
   await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);
   const form=p.locator('.action-record');await form.locator('[name=owner]').fill('资源恢复验收');
   await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
   const saved=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
   await form.locator('[name=note]').fill('重试时保留此未保存草稿');
   await p.evaluate(()=>window.__recoveryForm=document.querySelector('.action-record'));
   const retry=p.getByRole('button',{name:'重新加载图表',exact:true}).first();
   await retry.click();await p.getByText('图表仍未加载，请检查网络后重试；完整数据与草稿保留。',{exact:true}).waitFor();
   check(await retry.isEnabled(),'Repeated failure leaves retry disabled');
   check(await retry.evaluate(n=>document.activeElement===n),'Repeated failure loses keyboard retry focus');
   await p.unroute('**/vendor/echarts.min.js*');
   await retry.focus();await p.keyboard.press('Enter');await p.locator('.detail-chart svg').first().waitFor();
   check(await form.locator('[name=note]').inputValue()==='重试时保留此未保存草稿','Recovery loses draft');
   check(await p.evaluate(()=>document.querySelector('.action-record')===__recoveryForm),'Recovery replaces form');
   check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===saved,'Recovery changes saved baseline');
   check(p.url().includes('country=US')&&p.url().includes('issue=18'),'Recovery changes scope');
   check(await p.evaluate(()=>document.activeElement.classList.contains('detail-chart')),'Recovery loses keyboard focus');
   check(!await p.locator('[data-chart-library-pending]').count(),'Recovery leaves stale fallback');
   check(!errors.length,errors.join(';'));states.push({width,font,pass:true});
  }finally{await c.close();}
 }
 const c=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage();let release;
 try{
  await p.route('**/vendor/echarts.min.js*',r=>r.abort());await p.goto(base);await p.locator('.home-results').waitFor();
  await p.unroute('**/vendor/echarts.min.js*');
  const gate=new Promise(r=>release=r);let requests=0;
  await p.route('**/vendor/echarts.min.js*',async r=>{requests++;await gate;await r.continue();});
  const buttons=p.getByRole('button',{name:'重新加载图表',exact:true});check(await buttons.count()>=2,'Home lacks chart retry');
  await buttons.nth(0).click();await buttons.nth(1).click();
  await p.locator('.nav-link[data-page="B"]').click();release();
  await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]')&&window.echarts);
  check(p.url().endsWith('#/B'),'Late recovery changes route');check(requests===1,'Concurrent retry duplicates script requests');
  await p.locator('.nav-link[data-page=""]').click();await p.locator('#trendChart svg').waitFor();await p.locator('#statusChart svg').waitFor();
  check(await p.locator('#trendChart + .chart-scale-note').isVisible(),'Recovered chart hides scale explanation');
  return {status:'PASS',states,checks:['repeat failure retry','keyboard recovery','same form and unsaved draft','saved record unchanged','filtered issue URL unchanged','single shared request','late completion preserves new route','home charts restored']};
 }finally{release?.();await c.close();}
}
