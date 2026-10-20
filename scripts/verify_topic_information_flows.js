async parent=>{
 fs.mkdirSync('output/playwright/v196-completeness',{recursive:true});
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),results=[],errors=[];
 const read=n=>JSON.parse(fs.readFileSync('data/'+n+'.json','utf8')),features=read('function-usage').facts.rows.at(-1),unbind=read('diagnostics').F.unbindingFacts;
 const check=(ok,msg)=>{if(!ok)throw Error(msg);},n=v=>v.toLocaleString('zh-CN');p.on('pageerror',e=>errors.push(e.message));
 const open=async(code,query='')=>{await p.goto('http://127.0.0.1:8765/#/'+code+(query?'?'+query:''));await p.locator('.topic-overview').waitFor();};
 try{
  for(const query of ['', 'country=US','appPlatform=Android']){
   const filters=Object.fromEntries(new URLSearchParams(query));await open('B',query);
   const raw=features.records.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)),totals=['on','off','unknown'].map(k=>raw.reduce((s,r)=>s+r.notification[k],0));
   const cells=await p.locator('#topic-B-metric-27 .topic-mini-table tbody tr td:nth-child(2)').allTextContents();check(JSON.stringify(cells)===JSON.stringify(totals.map(v=>n(v)+'人')),'Notification counts differ from source '+query);
   check((await p.locator('#topic-B-metric-27').innerText()).includes('未知不当作关闭'),'Unknown configuration conflated with off');
   await open('F',query);const expected=unbind.months.map(m=>m.devices.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v)).length);
   const history=await p.evaluate(()=>metricHistory(51));check(JSON.stringify(history.values)===JSON.stringify(expected),'Unbinding monthly trend disagrees with device ledger '+query);
   check(history.labels.length===12&&history.selectedPeriod==='2026-07','Wrong unbinding period');check(await p.locator('#topic-F-metric-51 .topic-sparkline svg').count()===1,'Existing monthly history not visible');results.push({query,totals,unbinding:expected});
  }
  await open('F','unbindingMonth=2026-08');check((await p.locator('#topic-F-metric-51').innerText()).includes('观察中'),'Unmatured rebound shown as final');check((await p.locator('#topic-F-metric-51 .headline-trend-label').innerText()).includes('2026-08'),'Trend ignores selected month');
  check((await p.locator('#topic-F-metric-50').innerText()).includes('不与前三项相加'),'Shared subset double counted');
  for(const [code,id]of [['D',22],['E',37],['E',40]]){await open(code);check((await p.locator(`#topic-${code}-metric-${id} .topic-window`).innerText()).includes('未提供'),'Unknown period represented as complete month '+id);}
  const snapshot=[];for(const code of 'ABCDEFG'){await open(code);snapshot.push(await p.locator('.topic-metric').evaluateAll(ns=>ns.map(n=>({id:Number(n.dataset.metricId),text:n.innerText}))));}
  fs.writeFileSync('output/playwright/v196-completeness/visible-inventory.json',JSON.stringify(snapshot.flat(),null,2));
  for(const code of ['B','F'])for(const width of [1366,1600,1920])for(const font of [16,32]){await p.setViewportSize({width,height:1000});await open(code);await p.evaluate(font=>document.documentElement.style.fontSize=font+'px',font);check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'New summary overflows '+code);if(width===1600&&font===16)await p.locator(`#topic-${code}-metric-${code==='B'?27:51}`).screenshot({path:`output/playwright/v196-completeness/${code}.png`});}
  check(!errors.length,errors.join(';'));return {status:'PASS',results,errors};
 }finally{await c.close();}
}
