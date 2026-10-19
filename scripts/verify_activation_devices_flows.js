// Independently count the raw ledger; inspect plots and test actual route-package faults.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),check=(ok,message)=>{if(!ok)throw Error(message);};
 const response=await parent.request.get(base+'data/diagnostics.json');check(response.ok(),'Missing original diagnostics');
 const facts=(await response.json()).A.activationFacts;
 const decoded=facts.records.map(r=>({id:`ACT16-${String(r[0]).padStart(6,'0')}`,firstContentDay:r[1],country:facts.codes.country[r[2]],deviceModel:facts.codes.deviceModel[r[3]],salesChannel:facts.codes.salesChannel[r[4]],productLine:r[3]===3?'Hunting':'Bird',deviceStatus:'Effective'}));
 const expected=(filters={},week=facts.defaultWeek)=>{const end=facts.weeks.find(w=>w.start===week).end;return decoded.filter(r=>r.firstContentDay>=week&&r.firstContentDay<=end&&Object.entries(filters).filter(([key])=>['country','deviceModel','salesChannel','productLine','deviceStatus'].includes(key)).every(([key,value])=>r[key]===value)).sort((a,b)=>a.firstContentDay.localeCompare(b.firstContentDay)||a.id.localeCompare(b.id));};
 const context=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await context.newPage(),errors=[],states=[];
 p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(filters={},extra={})=>{await p.goto(`${base}#/A?${new URLSearchParams({metric:'16',...filters,...extra})}`);await ready();};
 const form=()=>p.locator('.action-record'),stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const record=async()=>Object.values(JSON.parse(await stored())).find(r=>r.evidenceId===16);
 try {
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]])for(const filters of [{},{country:'US',deviceModel:'K6',salesChannel:'Amazon'},{productLine:'Hunting',deviceModel:'Hunt Pro'}]) {
   await open(filters);await p.setViewportSize({width,height:1000});await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,font);await ready();
   const rows=expected(filters),value=await p.evaluate(()=>metric(16));check(value.kind==='count'&&value.value===rows.length,'Card is not a direct ledger count');
   const week=await p.evaluate(()=>activationDeviceProjection().current),history=await p.evaluate(()=>metricHistory(16));
   check(week.start==='2026-09-14'&&week.end==='2026-09-20','Default complete week changed');
   check(JSON.stringify(history.values)===JSON.stringify(facts.weeks.map(w=>expected(filters,w.start).length)),'Weekly history uses independent shares');
   const plots=p.locator('#A-panel-change [data-evidence-metric="16"] .detail-chart');check(await plots.count()===2,'Weekly/daily plot is missing');
   for(let i=0;i<2;i++){await plots.nth(i).locator('svg').waitFor();const points=await plots.nth(i).evaluate(n=>echarts.getInstanceByDom(n).getOption().series[0].data);const counts=i===0?history.values:Array.from({length:7},(_,d)=>rows.filter(r=>r.firstContentDay===`2026-09-${14+d}`).length);check(JSON.stringify(points)===JSON.stringify(counts),'Rendered chart disagrees with source');}
   await p.getByRole('tab',{name:'分组证据',exact:true}).click();await p.locator('#A-panel-groups [data-evidence-metric="16"] .detail-chart svg').nth(2).waitFor();check(await p.locator('#A-panel-groups [data-evidence-metric="16"] .detail-chart svg').count()===3,'Country/model/channel partition is not rendered');
   const groupSeries=await p.locator('#A-panel-groups [data-evidence-metric="16"] .detail-chart').evaluateAll(nodes=>nodes.map(n=>echarts.getInstanceByDom(n).getOption().series[0].data));
   check(groupSeries.every(values=>values.reduce((a,b)=>a+b,0)===rows.length),'Grouped counts do not close within the selected intersection');
   await p.getByRole('tab',{name:'完整数据',exact:true}).click();const list=p.locator('.activation-device-list');check(await list.locator('tbody tr').count()===Math.min(10,rows.length),'First record page has missing rows');
   const visible=await list.locator('tbody tr').evaluateAll(nodes=>nodes.map(n=>[...n.children].map(c=>c.textContent)));
   check(visible.every((r,i)=>r[0]===rows[i].id&&r[1]===rows[i].firstContentDay&&r[3]===rows[i].deviceModel),'Record fields differ from source');
   check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Desktop/text enlargement overflows page');
   if(!Object.keys(filters).length){await p.locator('.income-workspace').scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/activation-devices-${browser.browserType().name()}-${width}-${font}.png`,scale:'css'});}
   states.push({width,font,filters,count:rows.length});
  }
  await p.setViewportSize({width:1600,height:1000});await open();
  const old11=await p.evaluate(()=>JSON.stringify(metric(11)));await p.getByLabel('首次内容统计周（仅#16）',{exact:true}).selectOption('2026-09-07');await ready();
  check(await p.evaluate(()=>metric(16).value)===2360&&await p.evaluate(()=>JSON.stringify(metric(11)))===old11,'Own week leaks into binding cohort or misses card');
  check((await p.locator('.workspace-observation').innerText()).includes('2026-09-07—2026-09-13'),'Inspector still shows the default week');
  await p.reload();await ready();check(await p.getByLabel('首次内容统计周（仅#16）',{exact:true}).inputValue()==='2026-09-07','Reload loses local week');
  await p.getByLabel('首次内容统计周（仅#16）',{exact:true}).selectOption('2026-09-14');await ready();await p.goBack();await ready();check(await p.evaluate(()=>metric(16).value)===2360,'Browser Back loses actual week');
  await p.goForward();await ready();check(await p.evaluate(()=>metric(16).value)===2450,'Browser Forward loses default week');
  await open({week:'1',appPlatform:'Android'});check(await p.evaluate(()=>metric(16).value)===2450,'Mature cohort week/App falsely affects first-content count');
  await open({productLine:'Bird',deviceModel:'Hunt Pro'});check(await p.evaluate(()=>metric(16).kind)==='na','Impossible product/model becomes a legitimate zero');
  await open({deviceStatus:'Inactive'});check(await p.evaluate(()=>metric(16).kind)==='na','Inactive at first content treated as a valid cohort');
  await open({}, {activationWeek:'2026-09-15'});check(await p.evaluate(()=>metric(16).availability)==='pending','Invalid local week silently falls back');
  await open();await p.getByRole('tab',{name:'完整数据',exact:true}).click();const list=p.locator('.activation-device-list'),search=p.getByRole('searchbox',{name:'查找首次内容设备'});
  await list.getByRole('button',{name:'下一页',exact:true}).click();check((await list.locator('.binding-list-status').innerText()).includes('第 2 / 245 页'),'Pagination missing');
  await list.getByRole('button',{name:'上一页',exact:true}).click();check(await list.getByRole('button',{name:'下一页',exact:true}).evaluate(n=>n===document.activeElement),'Boundary pagination loses keyboard focus');
  const chosen=expected()[121];await search.fill(chosen.id);check(await list.locator('tbody tr').count()===1&&(await list.locator('tbody tr').innerText()).includes(chosen.firstContentDay),'Search cannot inspect an immutable device ID');
  await search.fill('NO-SUCH-DEVICE');check(await list.locator('tbody tr').count()===0&&await p.evaluate(()=>metric(16).value)===2450,'Local empty search turns the business total into zero');
  check(await stored()===null,'Read-only exploration saved an issue');
  await open({}, {issue:'16'});await form().locator('[name=owner]').fill('首次内容核对');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const saved=await record();
  check(saved.baseline==='2,450台'&&saved.baselineAt==='首次内容完整周v1 · 2026-09-14—2026-09-20（UTC）','New issue omitted explicit weekly baseline');
  await form().locator('[name=note]').fill('跨页保留未保存的首次内容核查草稿');await p.goto(base+'#/C?metric=43');await ready();
  check(await p.evaluate(()=>deviceRetentionCurrent().start)==='2026-08-17','Activation changes #43 default retention cohort');
  await p.goBack();await ready();check(await form().locator('[name=note]').inputValue()==='跨页保留未保存的首次内容核查草稿','Returning loses draft');
  // Explicit legacy fixture based on pre-change shipped scalar/window, never user data.
  const legacy={...saved,baselineAt:'快照 2026-09-24',note:'旧版未注明统计期的测试记录'},key=await p.evaluate(()=>recordKey('A',16));
  await p.evaluate(({key,legacy})=>localStorage.setItem('parallens-demo-actions-v1',JSON.stringify({[key]:legacy})),{key,legacy});await p.reload();await ready();const original=await stored();
  check(await form().locator('.activation-legacy-note').isVisible()&&await stored()===original,'Legacy is rewritten or silently equated with new 2450');
  await form().locator('[name=note]').fill('仅更新处理进度');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();const updated=await record();
  check(updated.baseline===legacy.baseline&&updated.baselineAt===legacy.baselineAt&&updated.issueId===legacy.issueId&&JSON.stringify(updated.filters)===JSON.stringify(legacy.filters),'Progress save rewrites legacy scope/number/window');
  await open({}, {activationWeek:'2026-09-07',issue:'16'});await form().locator('[name=owner]').fill('前周核对');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();
  check(await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('parallens-demo-actions-v1'))).some(r=>r.evidenceId===16&&r.filters.activationWeek==='2026-09-07'&&r.baseline==='2,360台')),'A nondefault week cannot save/restore a separate issue');
  check(await p.evaluate(()=>savedIssueEntries().every(e=>!e.target.reason)),'Saved local-week entry cannot restore its scope');
  const scopeBytes=await stored();await p.goto('about:blank');await p.goto(base);await ready();
  check(await p.evaluate(()=>!preparedRoutes.has('A')),'Cold home preloads the first-content ledger');
  await p.locator('#open-saved-issues').click();await p.locator('#saved-issues-query').fill('前周核对');check(await p.locator('.saved-issue-open').count()===1,'Cold saved-issue list cannot restore own week');
  await p.locator('.saved-issue-open').click();await ready();check(await p.evaluate(()=>metric(16).value)===2360&&await p.getByLabel('首次内容统计周（仅#16）',{exact:true}).inputValue()==='2026-09-07'&&await stored()===scopeBytes,'Cold reopen loses original week or edits the saved record');
  // Fault injection hits the lazy payload actually read by A; old raw JSON injection is insufficient.
  let fault='date',hits=0;await p.route('**/data/route-A.json*',async route=>{const response=await route.fetch(),payload=await response.json(),f=payload.diagnostics.A.activationFacts;hits++;if(fault==='date')f.records[0][1]='2026-09-21';else if(fault==='id')f.records[1][0]=f.records[0][0];else for(const row of f.records)if(row[2]===1)row[2]=0;await route.fulfill({response,json:payload});});
  for(const type of ['date','id']){fault=type;await open();await p.reload();await ready();check(await p.evaluate(()=>metric(16).availability)==='pending'&&await p.evaluate(()=>metricHistory(16))===null,'Invalid ledger falls back to scalar or fake history');check(await p.locator('.activation-device-list').count()===0,'Invalid ledger still displays a record queue');}
  fault='empty';await open({country:'UK'});await p.reload();await ready();check(await p.evaluate(()=>metric(16).kind==='count'&&metric(16).value===0),'Verified empty intersection is not an honest zero count');
  check(hits>=3,'Fault test did not touch actual A transport');check(!errors.length,errors.join('; '));
  return {status:'PASS',states,sourceDevices:decoded.length,weeklyAndDailyPlots:true,groupClosure:true,localWeekNavigation:true,scopeIsolation:true,legacyAndDraftPreserved:true,validZero:true,invalidSourceBlocked:true};
 }finally{await context.close();}
}
