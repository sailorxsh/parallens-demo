// Changes must identify their actual measure; current DAU does not inherit MAU history.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],states=[];
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async q=>{await p.goto(`${base}#/B?metric=25${q?'&'+q:''}`);await ready();};
 try{
  for(const query of ['', 'country=US','country=Other&appPlatform=iOS','deviceModel=K6','productLine=Hunting']){
   await open(query);const value=await p.evaluate(()=>metric(25).value),text=await p.locator('.detail-finding').innerText();
   check(text.includes(`日活 ${value.DAU.toLocaleString('en-US')} 人`)&&text.includes(`App滚动30日活跃 ${value.appMAU.toLocaleString('en-US')} 人`),'Current App or composite count missing');
   check(/滚动30天复合MAU：9\/24较9\/17(上升|下降|基本持平)/.test(text)&&text.includes('不将MAU变化当作它们的变化'),'Movement borrows an unidentified or unavailable daily history');
   check(await p.locator('.detail-finding .finding-basis').textContent().then(t=>t.includes('activity-summary-2026-10-18-v1')),'Activity wording lacks its own revision without changing unrelated comparison rules');
   check((await p.locator('.detail-kpi[data-metric-id="25"]').innerText()).includes('日活／7日活跃历史待补；MAU见证据'),'Hero falsely claims all activity history absent');
   check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===null,'Reading activity facts writes a saved issue');states.push({query,value,text});
  }
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open('');await p.evaluate(n=>document.documentElement.style.fontSize=n+'px',font);await ready();await p.locator('.detail-finding').scrollIntoViewIfNeeded();
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Activity summary overflows desktop');check(await p.locator('.detail-finding .issue-register').isVisible(),'Activity registration not reachable');await p.screenshot({path:`output/playwright/v145-audit/${engine}-activity-${width}-${font}.png`});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await open('issue=25');const form=p.locator('.action-record');await form.locator('[name=owner]').fill('活跃文案合成核验');await form.getByRole('button',{name:'保存本地记录',exact:true}).click();const original=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY)),record=JSON.parse(original)['record:B:默认演示范围:25'];
  await form.locator('[name=note]').fill('未保存活跃草稿');await p.locator('.income-context-controls').getByRole('button',{name:'当前指标',exact:true}).click();check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===original,'Viewing correct summary changes baseline');await p.locator('.income-context-controls').getByRole('button',{name:'问题登记',exact:true}).click();check(await form.locator('[name=note]').inputValue()==='未保存活跃草稿','Summary loses issue draft');
  await p.reload();await ready();check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===original&&record.baseline.includes('12,600'),'Reload migrates existing activity baseline');
  await p.route('**/data/metric-values.json',async r=>{const response=await r.fetch(),d=await response.json();d.m25.value.MAU+=10;await r.fulfill({response,json:d});});await open('');await p.reload();await ready();const warning=await p.locator('.detail-finding').innerText();check(warning.includes('当前MAU与可比趋势尚未核对一致')&&!warning.includes('较9/17上升'),'Mismatched current value inherits another metric delta');
  check(!errors.length,errors.join(';'));return {status:'PASS',states,checks:['named MAU movement','current App subset','daily and weekly history coverage','five filter scopes','three desktop widths and 200%','saved baseline and draft','mismatched trend guard'],errors};
 }finally{await c.close();}
}
