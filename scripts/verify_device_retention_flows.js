// Approved activation cohorts: exact counts, fixed-scale colour, missing states and preserved records.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name();
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 const errors=[],states=[],geometry=[],checks=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(q='')=>{await p.goto(`${base}#/C?metric=43&${q}`);await ready();};
 const control=()=>p.getByRole('combobox',{name:'激活批次（仅#43）',exact:true});
 const choose=async id=>{await control().selectOption(id);await ready();};
 const form=()=>p.locator('.action-record'),field=name=>form().locator(`[name=${name}]`),stored=()=>p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));
 const save=async note=>{await field('owner').fill('设备留存合成验收');await field('note').fill(note);await form().getByRole('button',{name:'保存本地记录',exact:true}).click();check(await form().getAttribute('data-dirty')==='false','Issue save failed');};
 try{
  for(const scope of ['','country=US','deviceModel=K6']){
   await open(scope);check(await control().locator('option').count()===12,'Not twelve complete activation weeks');
   const other=await p.evaluate(()=>JSON.stringify([metric(8),metric(41),metric(42),metric(45),metric(46),recordScope('C',42)]));
   for(const id of await control().locator('option').evaluateAll(ns=>ns.map(n=>n.value))){
    await choose(id);
    const state=await p.evaluate(()=>({id:deviceRetentionSelection().id,value:metric(43),table:deviceRetentionTable(),c:deviceRetentionCurrent(),
     other:JSON.stringify([metric(8),metric(41),metric(42),metric(45),metric(46),recordScope('C',42)]),focus:document.activeElement.name,hash:location.hash}));
    const row=state.table.rows.find(r=>r[0]===id),v=state.value.value;
    check(state.id===id&&state.table.rows.length===12&&row[2]===state.c.denominator,'Selected cohort and exact table count differ');
    check(state.other===other&&state.focus==='activationCohort','Local cohort changes another C metric or loses keyboard focus');
    check(row[3]===(v.D7.numerator??'—')&&row[6]===(v.D30.numerator??'—'),'D7/D30 table numerator mismatch');
    check(id==='2026-08-17'?!state.hash.includes('activationCohort='):state.hash.includes(`activationCohort=${id}`),'Cohort route not canonical');
    check((await p.locator('.device-retention-summary').innerText()).includes(`${id}—${state.c.end}`),'Visible selected cohort is stale');
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();
    const selected=p.locator('#C-panel-data .device-retention-calculation tr[aria-current=date]');
    check(await selected.count()===1&&(await selected.innerText()).includes(id),'Calculation table does not highlight the current cohort');
    states.push({scope,id,d:row[2],D7:row[3],D30:row[6],mature:state.c.mature});
   }
  }
  await open();
  const palette=await p.locator('.device-retention-heatmap').evaluate(n=>{
   const chart=echarts.getInstanceByDom(n),o=chart.getOption(),data=chart.getModel().getSeriesByIndex(0).getData();
   const lum=color=>{const v=echarts.color.parse(color).slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v.reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);};
   const colourChecks=Array.from({length:1001},(_,i)=>{const rate=i/10,fill=echarts.color.lerp(rate/100,deviceRetentionPalette),light=lum(fill),ink=lum(deviceRetentionLabelColor(rate));return {rate,light,contrast:(Math.max(light,ink)+.05)/(Math.min(light,ink)+.05)};});
   return {map:o.visualMap[0],valid:o.series[0].data.length,missing:o.series[1].data.length,labels:[...n.querySelectorAll('text')].map(n=>n.textContent),
    rendered:o.series[0].data.map((r,i)=>({value:r.value,fill:data.getItemVisual(i,'style').fill,ink:r.label.color,contrast:(Math.max(lum(data.getItemVisual(i,'style').fill),lum(r.label.color))+.05)/(Math.min(lum(data.getItemVisual(i,'style').fill),lum(r.label.color))+.05)})),
    minimumContrast:Math.min(...colourChecks.map(v=>v.contrast)),monotonic:colourChecks.every((v,i)=>i===0||v.light<=colourChecks[i-1].light),grid:o.grid[0]};
  });
  check(palette.map.min===0&&palette.map.max===100&&JSON.stringify(palette.map.seriesIndex)==='[0]','Heatmap does not use one fixed 0–100% scale');
  check(palette.valid===19&&palette.missing===5&&palette.labels.includes('80.0%')&&palette.labels.includes('72.5%')&&palette.labels.includes('观察未结束'),'Missing observations are coloured as zero or percentage labels absent');
  check(palette.monotonic&&palette.minimumContrast>=4.5&&palette.rendered.every(v=>v.contrast>=4.5),'Darker green or readable percentage rule fails');
  check(new Set(palette.rendered.map(r=>r.fill)).size>8,'Distinct retention rates do not produce distinct colours');checks.push({palette});
  const chart=p.locator('.device-retention-heatmap');await chart.scrollIntoViewIfNeeded();
  const point=await chart.evaluate(n=>{const r=n.getBoundingClientRect(),v=echarts.getInstanceByDom(n).convertToPixel({seriesIndex:0},[1,6]);return {x:r.x+v[0],y:r.y+v[1]};});
  await p.mouse.click(point.x,point.y);await ready();check(await control().inputValue()==='2026-08-10','Real heatmap point does not select activation cohort');
  await choose('2026-08-17');
  const trend=await p.locator('#C-panel-change .detail-chart').nth(1).evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption();return {axis:o.xAxis[0].data,series:o.series.map(s=>({type:s.type,values:s.data})),text:[...n.querySelectorAll('text')].map(n=>n.textContent)};});
  check(trend.axis.length===12&&trend.axis[0]==='2026-06-29'&&trend.series.every(s=>s.type==='line'),'Cohort trend not actually rendered as dated lines');
  check(trend.series[0].values.filter(Number.isFinite).length===11&&trend.series[1].values.filter(Number.isFinite).length===8,'Trend fills immature cohorts with zero');checks.push({trend});
  await open('deviceStatus=Effective');check(await p.evaluate(()=>metric(43).value.D30.numerator)===1450,'Entry-effective filter excludes historical stopped devices');
  await open('deviceStatus=Inactive');check(await p.evaluate(()=>metric(43).value.D7.kind==='na'&&metric(43).value.D7.denominator===0),'Ineligible population displayed as zero retention');
  check((await p.locator('.device-retention-heatmap').innerText()).includes('无合格样本'),'Empty population lacks explicit grey labels');
  await open('country=Other&deviceModel=K6&salesChannel=Shopify');check(await p.evaluate(()=>metric(43).value.D30.kind==='na'&&metric(43).value.D30.denominator>0),'Small sample presented as reliable rate');
  await open('issue=43');await choose('2026-09-14');
  check(await field('reviewedAt').getAttribute('min')===null,'Immature cohort acquires a review baseline');
  check(await p.locator('.income-context .current-metric-register').count()===0||await p.locator('.income-context .current-metric-register').isDisabled(),'Immature cohort enables inspector registration');
  const before=await stored();await field('owner').fill('无完整观察不得保存');await form().getByRole('button',{name:'保存本地记录',exact:true}).click();check(await stored()===before,'Immature cohort saves a fabricated baseline');
  await choose('2026-09-07');check(await field('reviewedAt').getAttribute('min')==='2026-09-20','D7-only mature cohort uses wrong observation date');
  await save('仅D7完整的独立合成问题');let rows=JSON.parse(await stored()),d7=Object.values(rows).find(r=>r.filters.activationCohort==='2026-09-07');
  check(d7&&d7.baseline.includes('D7')&&d7.baseline.includes('D30')&&d7.baseline.includes('观察未结束')&&d7.baselineAt.includes('D7观察期末 2026-09-20'),'D7-only record loses immature D30 or exact horizon');
  await open('activationCohort=2026-08-10');await p.reload();await ready();check(await control().inputValue()==='2026-08-10','Reload loses cohort');
  await choose('2026-08-03');await p.goBack();await ready();check(await control().inputValue()==='2026-08-10','Back loses cohort');
  await p.goForward();await ready();check(await control().inputValue()==='2026-08-03','Forward loses cohort');
  await p.locator('.filter-bar').evaluate(n=>n.open=true);await p.locator('.filter-field select[name=country]').selectOption('US');await ready();check(await control().inputValue()==='2026-08-03','Global country change drops cohort');
  await p.getByRole('button',{name:'重置全部',exact:true}).click();await ready();check(await control().inputValue()==='2026-08-17'&&await p.evaluate(()=>Object.keys(filterState).length===0),'Reset fails to restore default cohort and overall scope');
  await open('issue=42');await field('note').fill('空触发原问题草稿');const scope42=await p.evaluate(()=>recordScope('C',42));await choose('2026-08-10');
  check(await field('issueMetric').inputValue()==='42'&&await field('note').inputValue()==='空触发原问题草稿'&&await p.evaluate(()=>recordScope('C',42))===scope42,'Viewing retention changes another active issue or its draft');
  await open('panel=groups');await p.locator('#C-panel-groups .evidence-pair').first().locator('summary').click();await p.getByRole('button',{name:'查看K6的批次设备',exact:true}).click();await ready();
  check(await p.evaluate(()=>filterState.deviceModel==='K6'&&deviceRetentionCurrent().denominator===221),'Model drilldown not based on same cohort');
  check((await p.locator('.device-retention-list').innerText()).includes('221'),'Device list count differs from grouped denominator');
  const list=p.locator('.device-retention-list');check(await list.locator('tbody tr').count()===20,'Device list paging missing');
  const first=await list.locator('tbody button').first().innerText(),dataBefore=await stored();await list.getByRole('button',{name:'下一页',exact:true}).click();check(await list.locator('tbody button').first().innerText()!==first,'Next page repeats the same devices');
  await list.getByRole('searchbox',{name:'搜索留存批次设备',exact:true}).fill(first);check(await list.locator('tbody tr').count()===1,'Device ID search not exact enough');
  await list.locator('tbody button').click();check((await p.locator('.retention-device-detail').innerText()).includes(first)&&await list.locator('tbody button').getAttribute('aria-pressed')==='true','Readonly device details fail to identify selected device');
  check(await stored()===dataBefore,'Viewing a retention device changes persistent issue data');
  await p.getByRole('button',{name:'返回设备清单',exact:true}).click();check(await list.locator('tbody button').evaluate(n=>n===document.activeElement),'Device return loses visible keyboard focus');
  const legacy=JSON.parse(fs.readFileSync('scripts/fixtures/device-retention-before-cohorts.json','utf8'));
  await p.evaluate(rows=>localStorage.setItem(ACTION_STORAGE_KEY,JSON.stringify(rows)),legacy.records);await open('issue=43');await p.reload();await ready();const oldRaw=await stored();
  check((await form().innerText()).includes('DEMO-C-43-MW45DP')&&await field('reviewedAt').getAttribute('min')===null,'Legacy unknown cohort rebased to new dates');
  check((await form().innerText()).includes('原登记未保存完整激活批次')&&await stored()===oldRaw,'Legacy missing-cohort boundary hidden or migrated');
  await field('note').fill('默认原问题草稿');await choose('2026-08-10');check(await field('note').inputValue()==='','New cohort inherits legacy draft');
  await save('前一批次独立登记');rows=JSON.parse(await stored());const older=Object.values(rows).find(r=>r.filters.activationCohort==='2026-08-10');
  check(older&&older.baseline.includes('D7')&&older.baseline.includes('D30')&&older.baseline.includes('/ 2,000')&&older.baselineAt.includes('2026-09-15'),'New record lacks both cohort counts and observation end');
  await choose('2026-08-17');check(await field('note').inputValue()==='默认原问题草稿','Returning loses old default draft');await save('更新处理进度不改旧基线');
  const old=JSON.parse(await stored())['record:C:默认演示范围:43'];
  for(const key of ['issueId','scope','filters','baseline','baselineAt','reviewMetric'])check(JSON.stringify(old[key])===JSON.stringify(legacy.records['record:C:默认演示范围:43'][key]),`Legacy ${key} changed`);
  await open('issue=43&activationCohort=2026-08-17');check(await p.evaluate(()=>recordKey('C',43))==='record:C:默认演示范围:43','Explicit default cohort forks old issue');
  await p.locator('#open-saved-issues').click();const dialog=p.locator('#saved-issues');await dialog.getByRole('searchbox').fill(older.issueId);await dialog.getByRole('button',{name:`打开 ${older.issueId} · ${older.scope}`,exact:true}).click();await ready();
  check(await control().inputValue()==='2026-08-10'&&await field('note').inputValue()==='前一批次独立登记','Saved-issue entry cannot restore cohort and original record');
  for(const q of ['activationCohort=','activationCohort=2026-09-21','activationCohort=2026-08-11','activationCohort=2026-08-10&activationCohort=2026-08-17']){
   await open(q);check(await p.evaluate(()=>metric(43).availability==='pending'&&metric(41).kind==='rate'),'Invalid cohort silently defaults or disables other metrics');
   check(await p.locator('#metric-evidence-43 .device-retention-heatmap').count()===0,'Invalid cohort draws stale heatmap');await choose('2026-08-17');check(await p.evaluate(()=>metric(43).value.D30.numerator)===1450,'Visible cohort control cannot repair invalid route');
  }
  for(const [width,font] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open();await p.evaluate(font=>document.documentElement.style.fontSize=`${font}px`,font);await ready();
   const heat=p.locator('.device-retention-heatmap');await heat.scrollIntoViewIfNeeded();await ready();
   const g=await heat.evaluate(n=>{const o=echarts.getInstanceByDom(n).getOption(),r=n.getBoundingClientRect(),label=o.series[0].label.fontSize;return {overflow:document.documentElement.scrollWidth>innerWidth+1,height:r.height,rowHeight:(r.height-o.grid[0].top-o.grid[0].bottom)/12,cellWidth:(r.width-o.grid[0].left-o.grid[0].right)/2,symbolSize:o.series[1].symbolSize,label,labels:[...n.querySelectorAll('text')].filter(t=>/^\d+\.\d%$/.test(t.textContent)).length,control:document.querySelector('[name=activationCohort]').getBoundingClientRect().toJSON(),tabs:document.querySelector('.income-tabs').getBoundingClientRect().toJSON()};});
   check(!g.overflow&&g.height>=28*font&&g.rowHeight>=g.label+4&&g.labels===19,'Heatmap labels are cramped, missing or overflow desktop');
   check(g.symbolSize[0]<=g.cellWidth&&g.symbolSize[1]<=g.rowHeight,'Grey observation cells cover adjacent percentages or cohort labels');
   check(g.control.bottom<=g.tabs.y+1&&g.control.x>=0&&g.control.right<=width,'Cohort selector overlaps tabs or page edge');
   geometry.push({width,font,...g});await p.screenshot({path:`output/playwright/v142-audit/${engine}-retention-${width}-${font}.png`});
   await choose('2026-08-10');check(await control().inputValue()==='2026-08-10','Cohort control cannot be operated at larger text');
  }
  await p.evaluate(()=>document.documentElement.style.fontSize='16px');await p.route('**/data/device-retention-facts.json*',async route=>{const response=await route.fetch(),data=await response.json();data.cohorts[0].records[0].activated++;await route.fulfill({response,json:data});});
  await open();await p.reload();await ready();check(await p.evaluate(()=>metric(43).availability==='pending'&&metric(41).kind==='rate'),'Invalid source falls back to old aggregates or breaks other C metrics');
  check(await p.locator('.device-retention-heatmap').count()===0&&(await p.locator('#metric-evidence-43').innerText()).includes('待核验'),'Invalid source still plots retained stale cohort values');
  await p.unroute('**/data/device-retention-facts.json*');await p.reload();await ready();check(await p.evaluate(()=>metric(43).value.D30.numerator)===1450,'Source repair fails to recover retention');
  // New source stays usable even if the deferred chart library never becomes ready.
  let releaseLibrary;const libraryGate=new Promise(resolve=>releaseLibrary=resolve);
  await p.route('**/vendor/echarts.min.js*',async route=>{await libraryGate;await route.continue();});
  try{
   await p.goto('about:blank');await p.goto(`${base}#/C?metric=43&panel=data`,{waitUntil:'commit'});
   const dataFirst=p.getByRole('button',{name:'先查看数据表',exact:true});await dataFirst.focus();await p.keyboard.press('Enter');
   await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'),{},{polling:50});
   check(await p.evaluate(()=>typeof window.echarts)==='undefined','Chart gate was not exercised');
   const full=p.locator('.device-retention-calculation');
   check(await full.locator('tbody tr').count()===12&&(await full.innerText()).includes('观察未结束'),'Complete cohort counts or missing-state labels disappear without charts');
   check((await full.locator('tr[aria-current=date]').innerText()).includes('1,450')&&(await p.locator('.device-retention-list').innerText()).includes('2,000'),'No-chart table or device denominator differs from the current cohort');
   checks.push({withoutChartLibrary:'12 cohorts, exact mature counts, unknown labels and 2000-device roster available'});
  }finally{releaseLibrary();await p.waitForLoadState('domcontentloaded');await p.unroute('**/vendor/echarts.min.js*');}
  check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
  return {status:'PASS',states,geometry,checks,legacy:{issueId:old.issueId,baseline:old.baseline,baselineAt:old.baselineAt},newIssue:older,errors};
 }finally{await c.close();}
}
