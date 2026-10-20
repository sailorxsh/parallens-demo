// Verify complete UTC-day Session evidence through the rendered B workspace.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name(),c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};p.on('pageerror',e=>errors.push(e.message));
 const diagnostics=await(await parent.request.get(base+'data/diagnostics.json')).json(),old=JSON.parse(fs.readFileSync('scripts/fixtures/session-before-daily.json','utf8')).records;
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(query='')=>{await p.goto(`${base}#/B?metric=26${query?'&'+query:''}`);await ready();};
 const form=()=>p.locator('.action-record'),pairs=()=>p.locator('.evidence-pair[data-evidence-metric="26"]'),stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
 const bundle=await(await parent.request.get(base+'data/route-B.json')).json();
 const setSource=async d=>{await c.unroute('**/data/route-B.json*');const changed=structuredClone(bundle);changed.diagnostics.B.sessionDepth=d.B.sessionDepth;await c.route('**/data/route-B.json*',r=>r.fulfill({json:changed}));await p.reload();await ready();check(await p.evaluate(source=>JSON.stringify(sourceData.diagnostics.B.sessionDepth)===JSON.stringify(source),d.B.sessionDepth),'Injected Session source did not reach the loaded topic');};
 const reveal=async details=>{if(!await details.evaluate(n=>n.open))await details.locator(':scope > summary').click();await ready();};
 try{
  await open();await p.evaluate(r=>localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(r)),old);await p.reload();await ready();const original=await stored();
  for(const country of['','US','UK','DE','Other'])for(const appPlatform of['','iOS','Android']){
   const query=new URLSearchParams(Object.entries({country,appPlatform}).filter(([,v])=>v));await open(query.toString());
   const info=await p.evaluate(()=>({part:sessionDepthProjection(),active:activeWindowProjection(),metric:metric(26)}));
   check(info.part.current.accounts===info.active.current.counts.appDAU,'#26 daily account denominator differs from #25');
   check(info.part.rows.length===84&&await pairs().count()===3,'Missing source-backed 84-day trends');
   for(let i=0;i<3;i++){
    const chart=pairs().nth(i).locator('.detail-chart');await chart.scrollIntoViewIfNeeded();await chart.locator('svg').waitFor();
    const values=await chart.evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {values:o.series[0].data,min:o.yAxis[0].min,max:o.yAxis[0].max};});
    const key=['frequency','p50','p90'][i],divisor=i?60:1;
    check(values.values.length===84&&values.values.every((v,j)=>v===info.part.rows[j][key]/divisor),'Rendered Session trend differs from independent daily counts');
    if(!i)check(values.max-values.min<1,'Frequency trend flattened by integer-only axis');
   }
   await p.locator('#B-tab-groups').click();const selector=p.locator('[name=sessionDistributionDay]');
   for(const index of[0,40,83]){
    await selector.selectOption(info.part.rows[index].end);await ready();const row=info.part.rows[index];
    check((await p.locator('.session-distribution-window').innerText()).includes(row.start),'Selected distribution date differs from source');
    const plots=p.locator('.session-distribution-content .detail-chart');for(let j=0;j<2;j++){await plots.nth(j).scrollIntoViewIfNeeded();await plots.nth(j).locator('svg').waitFor();}
    const totals=await plots.evaluateAll(nodes=>nodes.map(n=>echarts.getInstanceByDom(n).getOption().series[0].data.reduce((n,v)=>n+v,0)));
    check(totals[0]===row.accounts&&totals[1]===row.timedSessions,'Distribution does not close to selected daily denominator or qualified Sessions');
    check(await p.evaluate(()=>sessionDepthProjection().current.end)==='2026-09-24T00:00:00Z','Viewing historical distribution changes current values');
   }
   results.push({label:query.toString()||'overall',current:info.part.current,periods:84,distributionDates:3});
  }
  check(await stored()===original,'Viewing filters or distributions rewrites old issues');
  // A native date selection and a chart point change only the distribution view.
  await open();await p.locator('#B-tab-groups').click();await ready();await p.locator('[name=sessionDistributionDay]').scrollIntoViewIfNeeded();await p.locator('[name=sessionDistributionDay]').focus();await p.keyboard.press('Tab');check(await p.evaluate(()=>document.activeElement.tagName)==='SUMMARY','Date selector does not lead to the frequency disclosure in keyboard order');await p.keyboard.press('Shift+Tab');check(await p.locator('[name=sessionDistributionDay]').evaluate(n=>n===document.activeElement),'Date selector is not keyboard reachable');await p.locator('[name=sessionDistributionDay]').selectOption({index:1});await ready();check(await p.locator('[name=sessionDistributionDay]').inputValue()==='2026-07-04T00:00:00Z','Native date selection failed');
  await p.locator('#B-tab-change').click();const first=pairs().first(),chart=first.locator('.detail-chart');await chart.scrollIntoViewIfNeeded();await chart.locator('svg').waitFor();
  const point=await chart.evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect(),o=e.getOption(),[x,y]=e.convertToPixel({seriesIndex:0},[39,o.series[0].data[39]]);return {x:r.left+x,y:r.top+y};});await p.mouse.click(point.x,point.y);await ready();
  check((await first.locator('.chart-selected').innerText()).startsWith('2026-08-11'),'Session native point selects wrong daily row');await p.locator('#B-tab-groups').click();check(await p.locator('[name=sessionDistributionDay]').inputValue()==='2026-08-11T00:00:00Z','Trend point and distribution day disagree');await p.locator('.session-distribution-content .detail-chart').first().locator('svg').waitFor();
  await open('issue=26');const entry=Object.entries(old)[0],[oldKey,oldRecord]=entry;check(await form().locator('.session-legacy-note').count()===1,'Old unspecified Session window is silently treated as current UTC day');
  await form().locator('[name=note]').fill('保留旧日窗与原编号，仅更新进度');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const updated=JSON.parse(await stored())[oldKey];for(const field of['issueId','baseline','baselineAt','scope','filters','reviewMetric'])check(JSON.stringify(updated[field])===JSON.stringify(oldRecord[field]),'Silently changed old '+field);
  // New current-day issue includes full frequency shape in the existing baseline field.
  await open('country=US&appPlatform=iOS&issue=26');await form().locator('[name=owner]').fill('会话日证据核查');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const records=JSON.parse(await stored()),[newKey,newRecord]=Object.entries(records).find(([,r])=>r.filters.country==='US'&&r.filters.appPlatform==='iOS');
  check(newRecord.baseline.startsWith('会话日证据v1：')&&newRecord.baselineAt.includes('2026-09-23 → 2026-09-24'),'New issue omits canonical distribution or exact UTC day');
  await form().locator('[name=note]').fill('草稿不应被分布选择覆盖');await p.locator('#B-tab-groups').click();await p.locator('[name=sessionDistributionDay]').selectOption({index:3});check(await form().locator('[name=note]').inputValue()==='草稿不应被分布选择覆盖','Date control loses issue draft');
  await p.reload();await ready();const baseline=await stored(),sameHeadline=await p.evaluate(()=>metric(26).value);
  const reorder=structuredClone(diagnostics);reorder.B.sessionDepth.rows.at(-1).cells[0].durationSecondsFrequency.reverse();await setSource(reorder);check(await form().locator('.session-evidence-change').count()===0,'Reordered frequency rows cause a false evidence-change warning');
  await c.unroute('**/data/route-B.json*');const changed=structuredClone(diagnostics),cell=changed.B.sessionDepth.rows.at(-1).cells.find(r=>r.country==='US'&&r.appPlatform==='iOS');cell.durationSecondsFrequency[0][1]++;cell.durationSecondsFrequency[1][1]--;await setSource(changed);
  check(JSON.stringify(await p.evaluate(()=>metric(26).value))===JSON.stringify(sameHeadline),'Test shape change unexpectedly changes headline values');check(await form().locator('.session-evidence-change').count()===1,'Same headline values conceal changed distribution evidence');
  await form().locator('[name=note]').fill('更新进度，保留首次完整分布');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const changedRecord=JSON.parse(await stored())[newKey];check(changedRecord.baseline===newRecord.baseline&&changedRecord.baselineAt===newRecord.baselineAt,'Saving progress overwrites original distribution');await c.unroute('**/data/route-B.json*');await p.reload();await ready();
  // Review dates still validate against the original complete-day cutoff.
  await form().locator('[name=status]').selectOption('resolved');await form().locator('[name=target]').fill('人工核对');await form().locator('[name=reviewValue]').fill('已检查');await form().locator('[name=reviewedAt]').fill('2026-09-23');const beforeInvalid=await stored();await form().getByRole('button',{name:'保存本地记录',exact:true}).click();check(await stored()===beforeInvalid&&await form().locator('[name=reviewedAt]').getAttribute('aria-invalid')==='true','Review before complete-day cutoff was saved');await p.reload();await ready();
  for(const[label,mutate,bad]of[['missing-old-day',s=>s.rows.shift(),false],['old-count',s=>s.rows[0].cells[0].activeAccounts++,false],['current-negative',s=>s.rows.at(-1).cells[0].activeAccounts=-1,true],['duplicate-cell',s=>s.rows.at(-1).cells[0]=s.rows.at(-1).cells[1],true]]){
   const d=structuredClone(diagnostics);mutate(d.B.sessionDepth);await setSource(d);check(await p.evaluate(b=>metric(26).kind===(b?'na':'group'),bad),'History failure and reliable current day are conflated');check(await p.evaluate(()=>metric(25).value.appDAU)>0,'Session source failure contaminates #25');check(await pairs().count()===0,'Bad history leaves misleading old trend');if(!bad){await p.locator('#B-tab-groups').click();await p.locator('.session-distribution-content .detail-chart').first().locator('svg').waitFor();}
   await c.unroute('**/data/route-B.json*');await p.reload();await ready();results.push({label,bad});
  }
  const untimed=structuredClone(diagnostics);for(const cell of untimed.B.sessionDepth.rows.at(-1).cells)cell.durationSecondsFrequency=[];await setSource(untimed);await open();check(await p.evaluate(()=>metric(26).value.durationP50Minutes)===null,'No duration samples fabricate zero minutes');check((await p.locator('.session-depth-summary').innerText()).includes('无合格时长'),'Missing duration samples are not explained');await c.unroute('**/data/route-B.json*');await p.reload();await ready();
  for(const[width,font]of[[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open();await p.evaluate(f=>document.documentElement.style.fontSize=f+'px',font);await pairs().first().scrollIntoViewIfNeeded();await ready();
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Session workspace overflows the desktop');
   for(const plot of await pairs().locator('.detail-chart').all()){await plot.scrollIntoViewIfNeeded();await plot.locator('svg').waitFor();const rect=await plot.boundingBox(),texts=await plot.locator('svg text').evaluateAll(ns=>ns.map(n=>({text:n.textContent,b:n.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(n).fontSize)})));for(const t of texts)check(t.font>=12*font/16-.1&&t.b.x>=rect.x-1&&t.b.right<=rect.x+rect.width+1,'Clipped or undersized Session label '+t.text);}
   await p.screenshot({path:`output/playwright/v164-audit/${engine}-session-${width}-${font}.png`});await p.locator('#B-tab-groups').click();await p.locator('.session-distribution-content .detail-chart').first().locator('svg').waitFor();check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Distribution layout overflows desktop');await p.screenshot({path:`output/playwright/v164-audit/${engine}-distributions-${width}-${font}.png`});results.push({label:`layout-${width}-${font}`});
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.setViewportSize({width:1600,height:1000});await c.route('**/vendor/echarts.min.js*',r=>r.abort());await p.goto('about:blank');await open();check(await p.evaluate(()=>!window.echarts),'Chart-library fallback did not actually disable the library');await reveal(pairs().first().locator('.workspace-calculation'));check(await pairs().first().locator('tbody tr').count()===84,'Missing chart library loses exact daily counts');await p.locator('#B-tab-groups').click();await reveal(p.locator('.session-raw-duration'));check((await p.locator('.session-raw-duration tbody').innerText()).includes('3,983'),'Missing library loses raw duration frequencies');
  await p.locator('#B-tab-data').click();check(await p.locator('.session-depth-full tbody tr').count()===84,'Full data does not cover all complete UTC days');check(errors.length===0,errors.join('\n'));return {status:'PASS',engine,results,oldRecordsPreserved:1,newDistributionBaseline:true,errors};
 }finally{await c.close();}
}
