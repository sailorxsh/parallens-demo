// Full calendar-month evidence, actual chart interaction and unavailable-source behaviour.
async(parent)=>{
 const base=new URL('.',parent.url()).href,browser=parent.context().browser(),states=[],errors=[];
 const c=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'}),p=await c.newPage();
 const check=(ok,message)=>{if(!ok)throw Error(message);};p.on('pageerror',e=>errors.push(e.message));
 const ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy="false"]'));
  await p.evaluate(()=>document.fonts.ready);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 const open=async(query='')=>{await p.goto(`${base}#/E?metric=35${query?'&'+query:''}`);await ready();};
 const pair=()=>p.locator('.monthly-comparison'),plots=()=>pair().locator('.detail-chart');
 const source=await(await parent.request.get(`${base}data/diagnostics.json`)).json();
 const expectedMonths=source.E.paymentMonths.rows.map(r=>r.month);
 try{
  for(const width of [1366,1600,1920])for(const size of [16,32])for(const query of ['','country=US','country=UK&productLine=Bird']){
   await p.setViewportSize({width,height:1000});await open(query);
   await p.evaluate(s=>document.documentElement.style.fontSize=`${s}px`,size);await ready();
   const summary=pair().locator(':scope > summary');await summary.focus();await summary.press('Enter');await plots().first().locator('svg').waitFor();await ready();
   const observed=await plots().evaluateAll(nodes=>nodes.map(n=>{const o=echarts.getInstanceByDom(n).getOption(),r=n.getBoundingClientRect();return {
    labels:o.xAxis[0].data,type:o.series[0].type,values:o.series[0].data.map(d=>typeof d==='object'&&d!==null?d.value:d),
    box:{left:r.left,right:r.right},texts:[...n.querySelectorAll('svg text')].filter(t=>t.getBoundingClientRect().width).map(t=>{
     const b=t.getBoundingClientRect();return {text:t.textContent,left:b.left,right:b.right};})};}));
   check(observed.length===2&&observed.every(o=>o.type==='line'&&JSON.stringify(o.labels)===JSON.stringify(expectedMonths)),'Month histories are mismatched, incomplete or rendered as categories');
   check(observed.every(o=>o.texts.some(t=>t.text==='2025-09')&&o.texts.some(t=>t.text==='2026-08')),'Year or first/last month omitted');
   check(observed.every(o=>o.texts.every(t=>t.left>=o.box.left-2&&t.right<=o.box.right+2)),'Monthly labels or endpoint values clipped');
   const history=await p.evaluate(()=>({arppu:metricHistory(35),payers:paidPayersHistory(),value:metric(35),baseline:actionBaselineValue(35),comparison:currentComparisonEvidence(35)}));
   check(history.arppu.details.every((r,i)=>r.denominator===history.payers.values[i]&&r.value===r.numerator/r.denominator),'Filtered counts, income and ARPPU disagree');
   check(history.value.value.monthlySubscriptionPayers===history.payers.values.at(-1)&&history.value.value.ARPPU===history.arppu.values.at(-1),'Latest month no longer matches current card');
   if(!query)check(history.value.value.subscriptionNetIncome===52000&&history.arppu.values.slice(-3).join(',')==='5,5.1,5.2'&&history.payers.values.slice(-3).join(',')==='9600,9800,10000','Original three months changed');
   check((await pair().innerText()).includes('前9个月为新增合成场景')&&(await pair().innerText()).includes('跨月不可相加'),'Synthetic provenance or unique-account warning lost');
   check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Monthly history causes page overflow');
   if(width===1366&&size===32&&!query){await pair().scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/payment-history-enlarged-${browser.browserType().name()}.png`});}
   if(width===1600&&size===16&&!query){
    for(let i=0;i<2;i++){
     const plot=plots().nth(i);await plot.scrollIntoViewIfNeeded();await ready();
     const point=await plot.evaluate(n=>{const e=echarts.getInstanceByDom(n),o=e.getOption(),r=n.getBoundingClientRect(),v=o.series[0].data[0];
      const [x,y]=e.convertToPixel({seriesIndex:0},[0,typeof v==='object'?v.value:v]);return {x:r.x+x,y:r.y+y};});
     await p.mouse.click(point.x,point.y);await ready();
     const row=plot.locator('..').locator('tr.chart-selected');check(await row.count()===1&&(await row.innerText()).includes('2025-09'),'Native point does not reveal exact older-month row');
     check((await row.innerText()).includes(i===0?'7,600':'$4.80'),'Native point selected another month value');
    }
   }
   await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();
   const table=p.locator('.payment-month-table');check(await table.locator('tbody tr').count()===12,'Full monthly n/d table missing');
   const tableRows=await table.locator('tbody tr').allTextContents();
   check(tableRows.every((text,i)=>text.includes(expectedMonths[i])&&text.includes(history.payers.values[i].toLocaleString('zh-CN'))),'Full data table uses another filter or month');
   check(await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===null,'Viewing historical evidence silently creates records');
   states.push({width,size,query,months:12,latest:history.arppu.values.at(-1)});
  }
  await p.setViewportSize({width:1600,height:1000});
  await open('week=1');
  check(await p.evaluate(()=>metricHistory(35).labels.length===12&&metric(35).value.subscriptionNetIncome===52000),'Weekly filter replaces full calendar-month evidence');
  await open();await p.locator('.detail-finding .issue-register').click();await ready();
  const form=p.locator('.action-record');await form.locator('[name="owner"]').fill('月度历史隔离验收');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();
  const original=await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'));
  const archived=Object.values(JSON.parse(original)).find(r=>r.evidenceId===35);
  check(archived.baselineAt==='完整月 2026-08'&&archived.comparisonEvidence.periods[0].label==='完整月 2026年7月'&&archived.comparisonEvidence.periods[1].label==='完整月 2026年8月','Extended history changes existing registration period semantics');
  await form.locator('[name="note"]').fill('查看去年月份时保留的草稿');
  await p.getByRole('button',{name:'当前指标',exact:true}).click();
  await pair().locator('summary').first().click();await plots().first().scrollIntoViewIfNeeded();await ready();
  const point=await plots().first().evaluate(n=>{const e=echarts.getInstanceByDom(n),r=n.getBoundingClientRect();const [x,y]=e.convertToPixel({seriesIndex:0},[0,7600]);return {x:r.x+x,y:r.y+y};});
  await p.mouse.click(point.x,point.y);await ready();
  check(await p.evaluate(()=>localStorage.getItem('parallens-demo-actions-v1'))===original,'Old chart point overwrites original issue evidence');
  await p.getByRole('button',{name:'问题登记',exact:true}).click();
  check(await form.locator('[name="note"]').inputValue()==='查看去年月份时保留的草稿','Month point discards the active draft');
  await form.getByRole('button',{name:'保存本地记录',exact:true}).click();await p.reload();await ready();
  const updated=await p.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('parallens-demo-actions-v1'))).find(r=>r.evidenceId===35));
  check(Boolean(archived.issueId),'Saved monthly issue lacks its original issue number');
  for(const key of ['issueId','page','evidenceId','scope','filters','baseline','baselineAt','comparisonEvidence'])check(JSON.stringify(updated[key])===JSON.stringify(archived[key]),`Progress edit changes original ${key}`);
  await p.evaluate(()=>localStorage.clear());states.push({kind:'weekly-filter-and-historical-point',archivedEvidencePreserved:true});
  for(const kind of ['absent','duplicate','future','negative','stale','mismatch']){
   const data=structuredClone(source),rows=data.E.paymentMonths.rows;
   if(kind==='absent')delete data.E.paymentMonths;
   if(kind==='duplicate')rows[0].month=rows[1].month;
   if(kind==='future')rows.at(-1).month='2026-09';
   if(kind==='negative')rows[0].payers=-1;
   if(kind==='stale')data.E.paymentMonths.asOf='2026-09-23';
   if(kind==='mismatch')rows.at(-1).netIncome++;
   await p.route('**/data/diagnostics.json',r=>r.fulfill({json:data}));await open();await p.reload();await ready();
   check(await p.locator('.payment-history-unavailable').isVisible(),'Invalid history lacks visible explanation');
   check(await pair().count()===0&&await p.locator('.income-driver-delta').count()===0,'Invalid source falls back to stale three-month evidence');
   check(await p.locator('.detail-kpi[data-metric-id="35"] .detail-select').innerText()==='$5.20/人','History error erased valid latest metric');
   await p.getByRole('tab',{name:'完整数据',exact:true}).click();await ready();
   check((await p.locator('.payment-month-table').innerText()).includes('待核验'),'Full data silently displays stale source');
   await p.unroute('**/data/diagnostics.json');states.push({kind,result:'unavailable-history-current-retained'});
  }
  for(const n of [0,29]){
   const data=structuredClone(source);Object.assign(data.E.paymentMonths.rows[0],{payers:n,netIncome:n*5});
   await p.route('**/data/diagnostics.json',r=>r.fulfill({json:data}));await open();await p.reload();await ready();
   check(await p.evaluate(()=>metricHistory(35).values[0])===null,'No/low sample is drawn as zero ARPPU');
   await pair().locator('summary').first().click();await ready();
   const arppu=plots().nth(1);await arppu.locator('..').locator('.chart-data > summary').click();
   check(await arppu.evaluate(n=>echarts.getInstanceByDom(n).getOption().series[0].data[0])===null,'Rendered chart fills unavailable ARPPU with zero');
   check((await arppu.locator('..').locator('tbody tr').first().innerText()).includes(n?'少于30人':'该月无付款样本'),'Gap table mislabels an empty/low-sample month');
   await p.unroute('**/data/diagnostics.json');states.push({kind:'unavailable-month',payers:n});
  }
  check(!errors.length,errors.join('; '));return {status:'PASS',states,checks:['12 same-axis full calendar months','source arithmetic and original latest months','filtered table/card/chart agreement','older point native clicks','keyboard disclosure','three desktops and 200% text','invalid source does not leak old evidence','zero and small samples remain gaps','no issue writes']};
 }catch(e){await p.screenshot({path:`output/playwright/payment-history-failure-${browser.browserType().name()}.png`});throw e;}
 finally{await c.close();}
}
