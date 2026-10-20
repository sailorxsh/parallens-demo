// Business subitems are checked against raw source records, not the UI summary helpers.
async parent=>{
 const base=new URL('.',parent.url()).href,b=parent.context().browser(),c=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);},read=async name=>(await(await parent.request.get(base+'data/'+name+'.json')).json()),[activity,binding,diagnostics]=await Promise.all(['device-activity-facts','binding-device-facts','diagnostics'].map(read));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));},open=async(code,filters={})=>{await p.goto(base+'#/'+code+'?'+new URLSearchParams(filters));await ready();};
 const n=x=>x.toLocaleString('zh-CN'),match=(r,filters)=>Object.entries(filters).every(([k,v])=>r[k]===v),assertRows=async(root,rows)=>{const text=await root.innerText();for(const[label,value]of rows)check(text.includes(label)&&text.includes(value),'Missing/wrong business subitem '+label+' '+value);};
 p.on('pageerror',e=>errors.push(e.message));
 const riskRows=filters=>{const s=diagnostics.D.riskFacts,w=s.snapshots.at(-1),at=Date.parse(w.at),day=86400000,within=v=>v!==null&&Date.parse(v)>=at-30*day&&Date.parse(v)<at;let intentOnly=0,behaviorOnly=0,both=0;for(const r of w.accounts.filter(r=>match(r,filters))){const days=s.dates.map(d=>Date.parse(d+'T00:00:00Z')),bits=s.activity[r.id],sum=(lo,hi)=>bits.reduce((n,v,i)=>n+(days[i]>=at-lo*day&&days[i]<at-hi*day?v:0),0),recent=sum(7,0),previous=sum(35,7),intent=r.cancelAutoRenew||within(r.trialEndedAt)&&!r.trialPaid||within(r.expiredAt),qualified=previous>0&&recent*8<previous&&(r.devices.some(d=>at-Date.parse(d.lastOnlineAt)>=7*day)||!r.pushEnabled||r.ignoredAlerts.filter(within).length>=3);if(intent&&qualified)both++;else if(intent)intentOnly++;else if(qualified)behaviorOnly++;}return [['仅意图层',n(intentOnly)+'人'],['仅行为叠加层',n(behaviorOnly)+'人'],['两者同时命中',n(both)+'人']];};
 try{
  for(const filters of [{},{country:'US'},{deviceModel:'K6',firmware:'2.8'}]){
   await open('C',filters);const rows=activity.snapshots.at(-1).records.filter(r=>match(r,filters)),bands=Array.from({length:5},(_,i)=>rows.reduce((n,r)=>n+r.counts[i],0));
   await assertRows(p.locator('#topic-C-metric-41'),[['近24小时活跃设备',n(bands[0])+'台'],['近7天活跃设备',n(bands[0]+bands[1])+'台'],['近30天活跃设备',n(bands.slice(0,4).reduce((a,b)=>a+b,0))+'台']]);
   await assertRows(p.locator('#topic-C-metric-44'),[['至少21天未使用设备',n(bands[3]+bands[4])+'台'],['至少30天未使用设备',n(bands[4])+'台']]);results.push({kind:'activity-and-unused',filters});
  }
  for(const code of ['A','G'])for(const filters of [{},{country:'US'}]){
   await open(code,filters);const at=Date.parse(binding.asOf),selected=binding.records.filter(r=>match(r,filters)&&Date.parse(r.boundAt)<at-72*3600000&&(r.firstImageAt===null||Date.parse(r.firstImageAt)>at)),bands=[0,0,0];for(const r of selected){const days=Math.floor((at-Date.parse(r.boundAt))/86400000);bands[days>=14?2:days>=7?1:0]++;}
   const labels=['超过3天、未满7天','7–13天','14天及以上'];await assertRows(p.locator(`#topic-${code}-metric-15`),labels.map((label,i)=>[label,n(bands[i])+'台']));check(bands.reduce((a,b)=>a+b,0)===await p.evaluate(()=>metric(15).value),'Waiting classes do not close to current device population');results.push({kind:'waiting-categories',code,filters});
  }
  for(const code of ['D','G'])for(const filters of (code==='D'?[{},{country:'US'},{plan:'Free'}]:[{},{country:'US'}])){
   await open(code,filters);const rows=riskRows(filters);await assertRows(p.locator(`#topic-${code}-metric-52`),rows);const sum=rows.reduce((n,[,v])=>n+Number(v.replace(/[^\d]/g,'')),0);check(sum===await p.evaluate(()=>metric(52).value),'Risk exclusive classes do not close');results.push({kind:'risk-intersections',code,filters,rows});
  }
  for(const filters of [{},{country:'US'},{appPlatform:'Android'},{anomalyType:'Business'}]){
   await open('G',filters);const s=diagnostics.G.anomalyEvents,ids=new Set(s.windows.at(-1).eventIds),events=s.events.filter(r=>ids.has(r.id)&&match(r,filters)),labels={Business:'业务异常',Device:'设备异常',Quality:'数据质量'};
   const actual=await p.locator('#topic-G-metric-53 .topic-mini-table tbody tr').allTextContents();check(actual.length===3,'Current event classification missing');const counts=['Business','Device','Quality'].map(k=>events.filter(r=>r.anomalyType===k).length);for(let i=0;i<3;i++)check(actual[i].includes(n(counts[i])+'条'),'Wrong event class count');check(events.length===await p.evaluate(()=>metric(53).value),'Event classifications use another window');check((await p.locator('#topic-G-metric-53').innerText()).includes('严重程度和受影响人数尚未提供'),'Unavailable severity is implied by event count');results.push({kind:'event-categories',filters,counts});
  }
  await open('E');const tables=p.locator('#topic-E-metric-38 .topic-mini-table');check(await tables.count()===3,'Three source populations missing');for(const [i,view]of diagnostics.E.structureViews.entries()){
   const root=tables.nth(i);check((await root.innerText()).includes(n(view.denominator)+view.unit),'Missing exact population denominator');await assertRows(root,view.rows.map(([label,count])=>[label,n(count)+view.unit]));
  }
  await open('E',{country:'US'});check(await p.locator('#topic-E-metric-38 .topic-mini-table').count()===0,'Missing structure scope keeps overall counts');
  await open('C',{appPlatform:'iOS'});check(await p.evaluate(()=>!filterState.appPlatform),'Unsupported page filter became active');await assertRows(p.locator('#topic-C-metric-41'),[['近24小时活跃设备','16,200台']]);
  await open('G',{plan:'Free'});check(await p.evaluate(()=>!filterState.plan),'Unsupported page plan became active');await assertRows(p.locator('#topic-G-metric-52'),riskRows({}));
  for(const[width,size]of[[1366,16],[1600,16],[1920,16],[1366,32],[1600,32],[1920,32]])for(const code of ['A','C','D','E','G']){
   await p.setViewportSize({width,height:1000});await open(code);await p.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);await ready();check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'New summary overflows '+code+' '+width+' '+size);if(width===1600&&size===16)await p.screenshot({path:`output/playwright/v187-audit/${b.browserType().name()}-summary-${code}.png`,fullPage:true});
  }
  check(!errors.length,errors.join('; '));return {status:'PASS',sourceCases:results.length,layouts:30,checks:['raw age-band active and unused counts','raw waiting-device mutually exclusive classes','independent risk rule intersections','24-hour event classes and explicit unknown severity','existing structure counts and denominators, no reverse allocation','missing attribution hides subitems; out-of-page filters do not alter current scope','six desktop/text states'],results,errors};
 }finally{await c.close();}
}
