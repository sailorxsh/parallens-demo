// A group summary describes the full selected population, not the source's first entry.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),states=[],errors=[];
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const models=await(await parent.request.get(`${base}data/model-market.json`)).json(),metrics=await(await parent.request.get(`${base}data/metric-values.json`)).json();
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(id,query='')=>{await p.goto(`${base}#/E?metric=${id}&panel=${id===39?'groups':'data'}${query?'&'+query:''}`);await ready();};
 const text=()=>p.locator('.detail-finding').innerText(),num=n=>n.toLocaleString('zh-CN');
 try{
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.goto('about:blank');await p.setViewportSize({width,height:1000});
   for(const query of ['','country=US','country=UK','country=DE','country=Other','productLine=Bird','productLine=Hunting','country=US&deviceModel=Bird%20Pro']){
    await open(39,query);await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();
    const params=new URLSearchParams(query),rows=models.records.filter(r=>(!params.has('country')||r.country===params.get('country'))&&
     (!params.has('productLine')||r.productLine===params.get('productLine'))&&(!params.has('deviceModel')||r.model===params.get('deviceModel')));
    const groups=[...new Set(rows.map(r=>r.model))],owners=rows.reduce((s,r)=>s+r.owners,0),subscribed=rows.reduce((s,r)=>s+r.subscribedOwners,0),body=await text();
    if(groups.length>1){
     check(body.includes(`${groups.length}种主型号样本`)&&body.includes(num(owners))&&body.includes(num(subscribed)),'Full group count or source totals are missing');
     check(body.includes(`合并订阅率 ${(subscribed/owners*100).toFixed(1)}%`),'Group summary averages rates instead of numerator/denominator');
     const rates=groups.map(name=>{const g=rows.filter(r=>r.model===name);return g.reduce((s,r)=>s+r.subscribedOwners,0)/g.reduce((s,r)=>s+r.owners,0)*100;});
     check(body.includes(`${Math.min(...rates).toFixed(1)}%–${Math.max(...rates).toFixed(1)}%`),'Range is outside the selected source scope');
    }else check(body.includes(`${groups[0]}主型号样本`)&&!body.includes('种主型号样本'),'One selected model is described as multiple groups');
    check(body.includes('合成样本')&&body.includes('不代表全部合资格主账号')&&body.includes('不能据此判断型号差异的原因'),'Summary loses scope or causal boundary');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||[...document.querySelectorAll('.detail-finding')].some(n=>n.scrollWidth>n.clientWidth+1)),'Group summary clips enlarged text');
    states.push({id:39,width,size,query,owners,subscribed});
   }
   for(const query of ['','salesChannel=Amazon','salesChannel=Shopify']){
    await open(40,query);const params=new URLSearchParams(query),body=await text(),names=params.has('salesChannel')?[params.get('salesChannel')]:Object.keys(metrics.m40.value);
    check(body.includes(`当前 ${names.length} 个自报渠道演示样本`),'Channel group count is wrong');
    for(const name of names){const part=metrics.m40.value[name];check(body.includes(`${name} ${num(part.owners)} 位主账号，订阅率 ${(part.subscriptionRate*100).toFixed(1)}%`),'Channel summary omits or changes a selected group');}
    check(body.includes('不将分组人数相加')&&body.includes('不能直接解释购买归因'),'Channel groups are totalled or treated as purchase attribution');
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Channel summary causes page overflow');
    states.push({id:40,width,size,query});
   }
  }
  await p.goto('about:blank');await p.setViewportSize({width:1600,height:1000});
  for(const id of [39,40]){
   await open(id);const before=await text();
   const path=id===39?'model-market':'metric-values';
   const copy=id===39?{...models,records:[...models.records].reverse()}:{...metrics,m40:{...metrics.m40,value:Object.fromEntries(Object.entries(metrics.m40.value).reverse())}};
   await p.route(`**/data/${path}.json`,r=>r.fulfill({json:copy}));await p.reload();await ready();
   check(await text()===before,'Unchanged facts produce a different summary after source reordering');await p.unroute(`**/data/${path}.json`);
   states.push({id,kind:'source-order-invariance'});
  }
  await open(39);await p.locator('.detail-finding .issue-register').click();await ready();
  await p.locator('.action-record [name=note]').fill('分组概览核对草稿');const baseline=await p.locator('.action-record > .table-note').innerText();
  await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();await p.getByRole('tab',{name:'分组证据',exact:true}).click();await ready();
  check(await p.locator('.action-record [name=issueMetric]').inputValue()==='39'&&await p.locator('.action-record [name=note]').inputValue()==='分组概览核对草稿'&&
   await p.locator('.action-record > .table-note').innerText()===baseline,'Reading group summary changes issue context');
  await p.locator('.income-context-controls').getByRole('button',{name:'当前指标',exact:true}).click();await ready();
  await p.screenshot({path:`output/playwright/v120-audit/05-group-summary-${browser.browserType().name()}.png`,scale:'css'});
  await open(40,'country=US');check(!(await text()).includes('当前 2 个自报渠道'),'Missing channel geography retains overall facts');
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['44 scoped and enlarged layouts','weighted model rate from raw counts','all selected channels without combining overlapping groups',
   'source order does not choose a group','single-group and missing-data scope','original issue and draft unchanged'],errors};
 }finally{await c.close();}
}
