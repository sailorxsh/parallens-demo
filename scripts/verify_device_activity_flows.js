// Rendered device windows, independent return denominators and historical issue guards.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),results=[],errors=[];
 const check=(ok,msg)=>{if(!ok)throw Error(msg);},response=await parent.request.get(`${base}data/device-activity-facts.json`),source=await response.json();
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(id,filters={},extra='')=>{await p.goto(`${base}#/C?metric=${id}&${new URLSearchParams(filters)}${extra}`);await ready();};
 const expected=(filters,point=source.snapshots.at(-1))=>{
  const rows=point.records.filter(r=>Object.entries(filters).every(([k,v])=>['country','productLine','deviceModel','firmware','deviceStatus'].includes(k)?r[k]===v:true));
  const bands=Array.from({length:5},(_,i)=>rows.reduce((n,r)=>n+r.counts[i],0));
  return{bands,total:bands.reduce((a,b)=>a+b,0),active:bands.slice(0,4).reduce((a,b)=>a+b,0),unused:bands[4]+(filters.season==='Other'?0:bands[3])};
 };
 const scopes=[{}, {country:'US',productLine:'Bird'}, {productLine:'Hunting'}, {country:'Other',deviceModel:'K6',firmware:'Other'}];
 const dataPair=()=>p.locator('#C-panel-data > .evidence-pair').first();
 const form=()=>p.locator('.action-record'),stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 try{
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.goto('about:blank');await p.setViewportSize({width,height:1000});
   for(const id of [41,44])for(const season of ['Migration','Other'])for(const scope of scopes){
    const filters={...scope,season};await open(id,filters);await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);
    const e=expected(filters),actual=await p.evaluate(id=>metric(id),id);
    check(actual.denominator===e.total&&actual.numerator===(id===41?e.active:e.unused),'Rendered metric does not use its selected age population');
    const chart=p.locator(`#C-panel-change .evidence-pair[data-evidence-metric="${id}"] .detail-chart`).first();await chart.locator('svg').waitFor();
    const values=await chart.evaluate(n=>echarts.getInstanceByDom(n).getOption().series[0].data);
    check(JSON.stringify(values)===JSON.stringify(source.snapshots.map(point=>{const e=expected(filters,point);return(id===41?e.active:e.unused)/e.total*100})),'A plotted period uses independent allocation or another threshold');
    const title=await p.locator('.workspace-observation .finding-title').first().innerText();
    check(title.includes(id===41?'近30天设备活跃率':`连续${season==='Other'?30:21}天未使用`),'Observation explains another window');
    await p.locator('#C-tab-data').click();const pair=dataPair();await pair.locator('summary').click();
    const rows=await pair.locator('tbody tr').evaluateAll(nodes=>nodes.map(n=>[...n.children].map(c=>c.textContent)));
    if(id===41){
     const counts=[e.bands[0],e.bands[0]+e.bands[1],e.active];
     check(rows.length===3&&rows.every((row,i)=>Number(row[1].replaceAll(',',''))===counts[i]&&Number(row[2].replaceAll(',',''))===e.total),'Daily/weekly/monthly counts or shared denominator disagree');
     check(rows[2][4]==='2026-08-25 → 2026-09-24','Thirty-day boundary is ambiguous or shifted');
    }else{
     check(rows.length===2&&Number(rows[0][1].replaceAll(',',''))===e.bands[3]+e.bands[4]&&Number(rows[1][1].replaceAll(',',''))===e.bands[4],'Unused thresholds are not monotonic subsets');
     const cohort=source.returnCohorts.find(r=>r.thresholdDays===(season==='Other'?30:21));
     const parts=cohort.records.filter(r=>Object.entries(scope).every(([k,v])=>r[k]===v));
     const n=parts.reduce((n,r)=>n+r.returned,0),d=parts.reduce((n,r)=>n+r.eligible,0);
     const cells=await p.locator('.device-return-evidence tbody tr').locator('th,td').allTextContents();
     check(Number(cells[1].replaceAll(',',''))===n&&Number(cells[2].replaceAll(',',''))===d,'Return denominator is the current inactive pool or another scope');
     check(cells[3]===(d>=30?`${(n/d*100).toFixed(1)}%`:d?'样本不足（少于30台）':'无历史入组设备'),'Small historical cohort is disguised as a reliable rate');
     check(cells[4]==='2026-09-10 → 2026-09-17','Historical cohort has no distinct complete observation dates');
    }
    check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Device window evidence overflows the desktop page');
    if(!Object.keys(scope).length&&season==='Other'){
     await p.locator('.income-evidence').scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/device-activity-${browser.browserType().name()}-${id}-${width}-${font}.png`});
    }
    results.push({width,font,id,filters,numerator:actual.numerator,denominator:actual.denominator});
   }
  }
  await p.goto('about:blank');await p.setViewportSize({width:1600,height:1000});
  // Real pointer point -> exact table row. Scope and selected threshold stay intact.
  for(const id of [41,44]){
   await open(id,{season:'Other'});const panel=p.locator(`#C-panel-change .evidence-pair[data-evidence-metric="${id}"]`).first(),plot=panel.locator('.detail-chart');await plot.locator('svg').waitFor();await plot.scrollIntoViewIfNeeded();
   const point=await plot.evaluate(n=>{const c=echarts.getInstanceByDom(n),o=c.getOption(),r=n.getBoundingClientRect(),[x,y]=c.convertToPixel({seriesIndex:0},[8,o.series[0].data[8]]);return{x:r.left+x,y:r.top+y};});
   const before=p.url();await p.mouse.click(point.x,point.y);await panel.locator('tbody tr.chart-selected').waitFor();
   check(await panel.locator('tbody tr.chart-selected').evaluate(n=>[...n.parentNode.children].indexOf(n))===8&&p.url()===before,'Point evidence changes scope or highlights another date');
  }
  // The new date column remains reachable at actual 200% text size.
  await open(44,{},'&panel=data');await p.setViewportSize({width:1366,height:1000});await p.evaluate(()=>document.documentElement.style.fontSize='32px');
  const historyTable=p.locator('.device-return-evidence');await historyTable.scrollIntoViewIfNeeded();await p.evaluate(()=>updateScrollableTables());
  if(await historyTable.evaluate(n=>n.scrollWidth>n.clientWidth+1)){
   check(await historyTable.getAttribute('tabindex')==='0'&&await historyTable.locator('.table-scroll-hint').isVisible(),'Enlarged historical dates lack a keyboard scroll route');
   await historyTable.focus();for(let i=0;i<20;i++)await historyTable.press('ArrowRight');
   await p.waitForFunction(()=>{const n=document.querySelector('.device-return-evidence');return n.scrollLeft>=n.scrollWidth-n.clientWidth-2;});
   check(await historyTable.evaluate(n=>{const r=n.getBoundingClientRect(),cell=n.querySelector('tbody td:last-child').getBoundingClientRect();return cell.right<=r.right+1;}),'Historical dates remain clipped at the scroll limit');
  }
  await p.screenshot({path:`output/playwright/device-return-dates-${browser.browserType().name()}-32.png`});
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});
  // Save a versioned new issue, then emulate pre-v1 records; updating progress keeps old evidence.
  for(const id of [41,44]){
   await open(id);await p.locator('.income-evidence > .section-top .issue-register').click();
   await form().locator('[name=owner]').fill('设备窗口核查');await form().locator('[name=note]').fill('新口径登记');
   await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
   const state=JSON.parse(await stored()),entry=Object.entries(state).find(([,r])=>r.evidenceId===id);check(entry?.[1].baselineAt.includes('设备行为口径v1'),'A new issue does not identify its behaviour definition');
   check(await form().locator('[name=reviewedAt]').getAttribute('min')==='2026-09-24','Versioned baseline loses review-date ordering');
   entry[1].baselineAt='快照 2026-09-24';entry[1].baseline=id===41?'61.0%':'8.6%';entry[1].note='旧窗口核查';
   await p.evaluate(state=>localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(state)),state);await p.reload();await ready();await p.getByRole('button',{name:'问题登记',exact:true}).click();
   check(await form().locator('.device-definition-warning').isVisible()&&(await form().innerText()).includes('不能自动作同口径比较'),'A matching percentage silently becomes a same-definition baseline');
   await form().locator('[name=note]').fill('旧基线的新进度草稿');
   const url=await p.evaluate(id=>routeHref('C',id===41?44:41),id);await p.goto(base+url);await ready();await p.goBack();await ready();await p.getByRole('button',{name:'问题登记',exact:true}).click();
   check(await form().locator('[name=note]').inputValue()==='旧基线的新进度草稿','Auxiliary evidence discards an old issue draft');
   await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
   const saved=Object.values(JSON.parse(await stored())).find(r=>r.evidenceId===id);
   check(saved.baseline===entry[1].baseline&&saved.baselineAt===entry[1].baselineAt,'Saving progress migrates an old definition or baseline');
  }
  // Return history failure must not make a valid current pool disappear or borrow its denominator.
  let fixture=JSON.parse(JSON.stringify(source));
  await p.route('**/data/device-activity-facts.json',r=>r.fulfill({json:fixture}));
  for(const mode of ['unmatured','missing-history','small29','zero30','empty0']){
   fixture=JSON.parse(JSON.stringify(source));const cohort=fixture.returnCohorts[0];
   if(mode==='unmatured'){cohort.entryAt='2026-09-20T00:00:00Z';cohort.observedThrough='2026-09-27T00:00:00Z';}
   else if(mode==='missing-history')fixture.returnCohorts=[];
   else{cohort.records.forEach(r=>{r.eligible=0;r.returned=0;});const d=mode==='small29'?29:mode==='zero30'?30:0;cohort.records[0].eligible=d;cohort.eligibleDevices=d;cohort.returnedDevices=0;}
   await open(44,{},'&panel=data');await p.reload();await ready();
   check(await p.evaluate(()=>metric(41).value)===.61&&await p.evaluate(()=>metric(44).numerator)===60000,'Invalid return history suppresses valid current windows');
   const text=await p.locator('.device-return-evidence').innerText();
   check(text.includes(mode==='unmatured'||mode==='missing-history'?'待核验':mode==='small29'?'样本不足（少于30台）':mode==='zero30'?'0.0%':'无历史入组设备'),'Return maturity, zero and small-sample boundaries are not distinguished');
   results.push({fixture:mode,currentPoolPreserved:true});
  }
  for(const mode of ['missing-group','bad-count','wrong-product','bad-date','bad-window','null-group']){
   fixture=JSON.parse(JSON.stringify(source));const point=fixture.snapshots.at(-1);
   if(mode==='missing-group')point.records.pop();if(mode==='bad-count')point.records[0].counts[0]++;if(mode==='wrong-product')point.records[0].productLine='Hunting';
   if(mode==='bad-date')point.at='2026-02-30T00:00:00Z';if(mode==='bad-window')point.observedFrom='2026-09-01T00:00:00Z';if(mode==='null-group')point.records[0]=null;
   await open(44);await p.reload();await ready();
   check(await p.evaluate(()=>metric(41).availability)==='pending'&&await p.evaluate(()=>metric(44).availability)==='pending','Invalid age source falls back to independent aggregates');
   check(!await p.locator('#C-panel-change .evidence-pair[data-evidence-metric="44"] .detail-chart').count(),'Invalid source still draws a reliable device trend');results.push({fixture:mode});
  }
  await p.unroute('**/data/device-activity-facts.json');await open(41,{deviceStatus:'Inactive'});await p.reload();await ready();check(await p.evaluate(()=>metric(41).kind)==='na'&&await p.evaluate(()=>metric(44).kind)==='na','Invalid devices appear as zero activity');
  check(!errors.length,errors.join('; '));return{status:'PASS',checks:['64 source, window, threshold, return and desktop states','native chart point selection','versioned new and protected legacy issue baselines and drafts','complete, missing, unmatured, 0, 29, 30-device historical cohorts','six broken age source guards','inapplicable device state'],results};
 }finally{await context.close();}
}
