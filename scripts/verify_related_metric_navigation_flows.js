// A specifically named related metric must land on that diagnosis and retain the original draft.
async parent=>{
 const base=new URL('.',parent.url()).href,c=await parent.context().browser().newContext({reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const check=(v,m)=>{if(!v)throw Error(m);},ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));
 p.on('pageerror',e=>errors.push(e.message));
 try{
  for(const width of [1366,1600,1920])for(const font of [16,32]){
   await p.setViewportSize({width,height:1000});await p.goto(base+'#/C?metric=42&panel=groups&productLine=Bird&deviceModel=K6');await ready();
   await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);
   const link=p.getByRole('link',{name:'对照新客价值激活 ↗',exact:true});
   check((await link.getAttribute('href')).includes('metric=13'),'Named related metric points at a generic topic');
   const original=p.url(),stored=await p.evaluate(()=>JSON.stringify(localStorage));
   await link.focus();await p.keyboard.press('Enter');await ready();
   check(p.url().includes('/A?')&&p.url().includes('metric=13'),'Keyboard navigation misses the activation diagnosis');
   check(await p.evaluate(()=>filterState.productLine==='Bird'&&filterState.deviceModel==='K6'),'Supported scope lost on related navigation');
   check((await p.locator('.workspace-observation').innerText()).includes('#13'),'Target observation describes another metric');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Target overflows desktop');
   await p.goBack();await ready();check(p.url()===original,'Back loses original device evidence scope');
   check(await p.evaluate(()=>JSON.stringify(localStorage))===stored,'Browsing writes issue records');
   results.push({width,font});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.goto(base+'#/C?metric=42&issue=42&panel=groups');await ready();
  const form=p.locator('.action-record');await form.locator('[name=owner]').fill('设备核对');await form.locator('[name=note]').fill('核对固件与激活，尚未确认因果');
  const baseline=await form.locator('> .table-note').first().textContent();
  await p.getByRole('button',{name:'当前指标',exact:true}).click();
  await p.getByRole('link',{name:'对照新客价值激活 ↗',exact:true}).click();await ready();await p.goBack();await ready();
  await p.getByRole('button',{name:'问题登记',exact:true}).click();
  check(await form.locator('[name=note]').inputValue()==='核对固件与激活，尚未确认因果'&&await form.locator('[name=owner]').inputValue()==='设备核对','Related navigation loses the unsaved draft');
  check(await form.locator('> .table-note').first().textContent()===baseline,'Related navigation changes baseline');
  await p.screenshot({path:'output/playwright/v234-related-return.png'});
  check(!errors.length,errors.join(';'));return {status:'PASS',results,checks:['named metric destination','supported model and product scope','keyboard and browser back','desktop and enlarged text','unsaved owner/note and baseline retained','no storage mutation']};
 }finally{await c.close();}
}
