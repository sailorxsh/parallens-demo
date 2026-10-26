// Calendar selection, rendered counts, independent issue scopes and unmodified legacy baselines.
async(parent)=>{
 const base=new URL('.',parent.url()).href,engine=parent.context().browser().browserType().name();
 const c=await parent.context().browser().newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'});
 const p=await c.newPage(),errors=[],states=[],geometry=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(q='')=>{await p.goto(`${base}#/B?metric=24&${q}`);await ready();};
 const control=()=>p.getByRole('combobox',{name:'留存观察月（仅#24）',exact:true});
 const choose=async month=>{await control().selectOption(month);await ready();};
 const form=()=>p.locator('.action-record'),stored=()=>p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
 const save=async note=>{await form().locator('[name=owner]').fill('月度留存验收');await form().locator('[name=note]').fill(note);await form().getByRole('button',{name:'保存本地记录',exact:true}).click();check(await form().getAttribute('data-dirty')==='false','Save failed');};
 try{
  for(const scope of ['', 'country=US&appPlatform=iOS', 'country=Other&appPlatform=iOS']){
   await open(scope);
   check(await control().locator('option').count()===12,'Month options are not twelve complete months');
   const others=await p.evaluate(()=>JSON.stringify([metric(4),metric(25),metric(28),metric(29),metric(30)]));
   for(const month of await control().locator('option').evaluateAll(nodes=>nodes.map(n=>n.value))){
    await choose(month);
    const result=await p.evaluate(()=>({month:retentionSelection().month,value:metric(24),history:metricHistory(24),table:retentionTable(),
     others:JSON.stringify([metric(4),metric(25),metric(28),metric(29),metric(30)]),focus:document.activeElement.name,hash:location.hash}));
    const row=result.table.rows.find(r=>r[0]===month),point=result.history.details.find(r=>r.observedMonth===month);
    check(result.month===month&&result.history.selectedPeriod===month&&result.history.labels.length===12,'Selected month and history diverge');
    check(row[2]===result.value.numerator&&row[3]===result.value.denominator&&row[1]===point.baseMonth,'Table loses exact cohort counts');
    check(result.others===others&&result.focus==='retentionMonth','Local month changes another B metric or loses focus');
    check(month==='2026-08'?!result.hash.includes('retentionMonth='):result.hash.includes(`retentionMonth=${month}`),'Month route is not canonical');
    if(['2025-09','2026-07','2026-08'].includes(month)){
     await p.getByRole('tab',{name:'趋势与变化',exact:true}).click();await ready();
     const chart=p.locator('#B-panel-change .detail-chart').first();await chart.locator('svg').waitFor();
     const plotted=await chart.evaluate(n=>{
      const o=echarts.getInstanceByDom(n).getOption(),index=o.xAxis[0].data.indexOf(retentionSelection().month);
      return {labels:o.xAxis[0].data,cursor:o.series[0].markLine.data[0].xAxis,min:o.yAxis[0].min,max:o.yAxis[0].max,
       tooltip:o.tooltip[0].formatter([{dataIndex:index,seriesIndex:0,seriesName:o.series[0].name,value:o.series[0].data[index],marker:''}])};
     });
     check(plotted.labels.length===12&&plotted.labels[0]==='2025-09'&&plotted.cursor===month,'Rendered chart loses complete calendar axis or selected-month cursor');
     check(plotted.min>0&&plotted.max<=100&&plotted.tooltip.includes(result.value.numerator.toLocaleString('en-US'))&&plotted.tooltip.includes(result.value.denominator.toLocaleString('en-US')),'Chart scale or tooltip counts differ from selected cohort');
    }
    await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();
    const selected=p.locator('#B-panel-data tr[aria-current=date]');
    check(await selected.count()===1&&(await selected.innerText()).includes(month),'Visible calculation table does not identify selected month');
    check((await selected.innerText()).includes(result.value.numerator.toLocaleString('en-US'))||(await selected.innerText()).includes(String(result.value.numerator)),'Rendered table differs from runtime counts');
    states.push({scope,month,n:row[2],d:row[3],base:row[1]});
   }
  }
  await open('issue=24');await choose('2026-07');
  check((await p.evaluate(()=>metric(24))).numerator===48960,'July approved anchor differs');
  await p.reload();await ready();check(await control().inputValue()==='2026-07','Reload loses month');
  await choose('2026-06');await p.goBack();await ready();check(await control().inputValue()==='2026-07','Back loses local month');
  await p.goForward();await ready();check(await control().inputValue()==='2026-06','Forward loses local month');
  await p.locator('.filter-bar').evaluate(n=>n.open=true);
  await p.locator('.filter-field select[name=country]').selectOption('US');await ready();
  check(await control().inputValue()==='2026-06'&&(await p.evaluate(()=>metric(24))).denominator===43550,'Country fails to retain month or jointly recalculate');
  await p.getByRole('button',{name:'重置全部',exact:true}).click();await ready();
  check(await control().inputValue()==='2026-08'&&await p.evaluate(()=>Object.keys(filterState).length===0),'Reset does not restore default month and scope');
  // A month may change viewed evidence, never the active unrelated issue or draft.
  await open('issue=4');await form().locator('[name=note]').fill('活跃指标未保存草稿');
  const beforeScope=await p.evaluate(()=>recordScope('B',4));await choose('2026-07');
  check(await form().locator('[name=issueMetric]').inputValue()==='4'&&await form().locator('[name=note]').inputValue()==='活跃指标未保存草稿','Month replaces unrelated active issue or draft');
  check(await p.evaluate(()=>recordScope('B',4))===beforeScope,'Unrelated issue inherits retention month');
  // Genuine old record: reading and progress updates retain the exact original baseline.
  const legacy=JSON.parse(fs.readFileSync('scripts/fixtures/monthly-retention-before-12-months.json','utf8'));
  await p.evaluate(rows=>localStorage.setItem('parallens-demo-actions-v1',JSON.stringify(rows)),legacy.records);
  await open('issue=24');await p.reload();await ready();const original=await stored();
  check((await form().innerText()).includes('DEMO-B-24-1GLZ1VJ')&&(await form().innerText()).includes('原登记未保存留存人数与基期月份'),'Legacy identity or missing-evidence explanation lost');
  check(await stored()===original,'Reading migrated the old record');
  await form().locator('[name=note]').fill('八月原记录未保存草稿');await choose('2026-07');
  check(await form().locator('[name=note]').inputValue()==='','July inherits the August draft');
  await save('七月独立登记');
  const rows=JSON.parse(await stored()),july=Object.values(rows).find(r=>r.filters.retentionMonth==='2026-07');
  check(july&&july.baseline.includes('48,960 / 68,000')&&july.baseline.includes('2026-06 → 2026-07')&&july.baselineAt==='完整月 2026-07','New historical baseline lacks counts or two calendar months');
  check(await form().locator('[name=reviewedAt]').getAttribute('min')==='2026-07-31','Review lower bound is not selected calendar end');
  await choose('2026-08');
  check(await form().locator('[name=note]').inputValue()==='八月原记录未保存草稿','Returning loses original August draft');
  await save('原记录处理进度更新');
  const old=JSON.parse(await stored())['record:B:默认演示范围:24'];
  check(old.issueId==='DEMO-B-24-1GLZ1VJ'&&old.baseline==='77.1%'&&old.baselineAt==='完整月 2026-08'&&JSON.stringify(old.filters)==='{}','Saving overwrites original identity, counts or scope');
  await open('issue=24&retentionMonth=2026-08');
  check((await form().innerText()).includes(old.issueId)&&await p.evaluate(()=>recordKey('B',24))==='record:B:默认演示范围:24','Explicit default month forks legacy record');
  await p.locator('#open-saved-issues').click();const dialog=p.locator('#saved-issues');
  await dialog.getByRole('searchbox').fill(july.issueId);
  await dialog.getByRole('button',{name:`打开 ${july.issueId} · ${july.scope}`,exact:true}).click();await ready();
  check(await control().inputValue()==='2026-07'&&await form().locator('[name=note]').inputValue()==='七月独立登记','Saved issue does not restore month and record');
  await p.reload();await ready();check((await form().innerText()).includes(july.baseline),'Reload rewrites historical baseline');
  for(const q of ['retentionMonth=','retentionMonth=2026-09','retentionMonth=2026-07&retentionMonth=2026-08','retentionMonth=2026-7']){
   await open(q);check(await p.evaluate(()=>metric(24).availability==='pending'&&metric(25).value.DAU===12600),'Invalid month silently falls back or disables unrelated data');
   check(await p.locator('#metric-evidence-24 .issue-register').count()===0,'Pending evidence allows new registration');
   check((await p.locator('#metric-evidence-24').innerText()).includes('待补数据'),'Invalid month lacks visible explanation');
   await choose('2026-08');check(await p.evaluate(()=>metric(24).numerator===54000),'Visible month control cannot repair invalid route');
  }
  for(const [width,size] of [[1366,16],[1600,16],[1920,16],[1366,32]]){
   await p.setViewportSize({width,height:1000});await open('issue=24');
   await p.evaluate(size=>document.documentElement.style.fontSize=`${size}px`,size);await ready();await p.evaluate(()=>document.fonts.ready);
   await p.locator('#metric-evidence-24').scrollIntoViewIfNeeded();await ready();
   const g=await p.evaluate(()=>{const control=document.querySelector('[name=retentionMonth]').getBoundingClientRect(),tabs=document.querySelector('.income-tabs').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,control:{x:control.x,y:control.y,right:control.right,bottom:control.bottom},tabs:{y:tabs.y},value:document.querySelector('[name=retentionMonth]').value};});
   check(!g.overflow&&g.control.bottom<=g.tabs.y+1&&g.control.x>=0&&g.control.right<=width,'Month selector overlaps tabs or overflows desktop');
   geometry.push({width,size,...g});await p.screenshot({path:`output/playwright/v139-audit/${engine}-retention-${width}-${size}.png`});
   await choose('2026-07');check(await control().inputValue()==='2026-07','Enlarged month select is not operable');
  }
  // A source contract failure must render a pending state, not a stale curve.
  await p.route('**/data/route-core.json*',async route=>{
   const response=await route.fetch(),data=await response.json();data.sources.metricTrends.m24.points[0].denominator=0;
   await route.fulfill({response,json:data});
  });
  await open('');await p.reload();await ready();
  check(await p.evaluate(()=>metric(24).availability==='pending'&&metric(25).value.DAU===12600),'Malformed source falls back to a stale value or breaks unrelated data');
  check(await p.locator('#metric-evidence-24 .detail-chart[aria-label^="月度用户留存率"]').count()===0&&(await p.locator('#metric-evidence-24').innerText()).includes('待核验'),'Source failure still draws a misleading retention curve');
  await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();
  const anchorRows=await p.locator('#B-panel-data tr').filter({hasText:'月度复合活跃'}).allTextContents();
  check(anchorRows.length===2&&anchorRows.every(row=>row.includes('待核验')&&!row.includes('77.1%')&&!row.includes('72.0%')),'Supplemental table silently falls back to invalid source totals');
  await p.unroute('**/data/route-core.json*');await p.reload();await ready();
  check(await p.evaluate(()=>metric(24).numerator===54000),'Source repair does not restore current evidence');
  check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
  return {status:'PASS',states,geometry,legacy:{issueId:old.issueId,baseline:old.baseline,baselineAt:old.baselineAt},july,errors};
 }finally{await c.close();}
}
