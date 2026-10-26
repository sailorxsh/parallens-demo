// The overview and diagnostic must describe the same primary-model sample.
async(parent)=>{
 const browser=parent.context().browser(),c=await browser.newContext({viewport:{width:1600,height:1000}}),p=await c.newPage(),states=[];
 const base=new URL('.',parent.url()).href,source=await(await parent.request.get(base+'data/model-market.json')).json();
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));};
 try{
  for(const query of['','country=US','country=DE','productLine=Bird','productLine=Hunting','deviceModel=K6','country=UK&deviceModel=Bird%20Pro','appPlatform=iOS']){
   await p.goto(base+'#/E'+(query?'?'+query:''));await ready();
   const q=new URLSearchParams(query),rows=source.records.filter(r=>(!q.has('country')||r.country===q.get('country'))&&(!q.has('productLine')||r.productLine===q.get('productLine'))&&(!q.has('deviceModel')||r.model===q.get('deviceModel')));
   const total=rows.reduce((n,r)=>n+r.owners,0),card=p.locator('#topic-E-metric-39'),text=await card.innerText();
   check(text.includes(`当前范围样本共 ${total.toLocaleString('zh-CN')} 人`),'Overview sample does not match source: '+query);
   check(text.includes('互斥归属')&&text.includes('不代表全部合资格主账号')&&!text.includes('各型号可能共享'),'Conflicting population interpretation: '+query);
   const cells=await card.locator('tbody tr').evaluateAll(es=>es.map(e=>e.innerText));
   for(const name of new Set(rows.map(r=>r.model))){const count=rows.filter(r=>r.model===name).reduce((n,r)=>n+r.owners,0);check(cells.some(t=>t.includes(name)&&t.includes(count.toLocaleString('zh-CN')+'人')),'Model count detached from sample');}
   await card.locator('.topic-diagnose').click();await ready();
   check((await p.locator('#main').innerText()).includes('主型号'),'Diagnostic loses primary-model context');
   await p.goBack();await ready();check((await card.innerText()).includes(`当前范围样本共 ${total.toLocaleString('zh-CN')} 人`),'Returning changes sample');
   states.push({query,total});
  }
  await p.goto(base+'#/E');await ready();
  for(const width of[1366,1600,1920])for(const size of[16,32]){
   await p.setViewportSize({width,height:1000});await p.evaluate(s=>document.documentElement.style.fontSize=s+'px',size);
   const card=p.locator('#topic-E-metric-39');await card.scrollIntoViewIfNeeded();
   const layout=await card.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,text:el.querySelector('.table-note')?.innerText}));
   check(layout.scroll<=layout.width+1,'Model overview overflows '+width+'/'+size);states.push({width,size,...layout});
  }
  return {status:'PASS',states,checks:['source-derived sample across eight scopes','exclusive primary-model attribution with population limit','diagnostic return retains scope','six desktop/text layouts']};
 }finally{await c.close();}
}
