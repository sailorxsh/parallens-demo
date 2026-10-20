// Complete topic discovery, then one-metric diagnosis, preserving scope, records and history.
async parent=>{
 const base=new URL('.',parent.url()).href,b=parent.context().browser(),c=await b.newContext({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),p=await c.newPage(),errors=[],results=[];
 const check=(ok,m)=>{if(!ok)throw Error(m);},ready=async()=>{await p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));};
 const open=async hash=>{await p.goto(base+'#/'+hash);await ready();};p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 try{
  const expected={A:[7,9,16,10,11,12,13,14,15],B:[4,25,30,26,27,31,24,28,29],C:[8,41,44,42,45,46,43,47],D:[2,3,6,21,17,18,19,20,5,22,23,32,33,52],E:[34,35,3,36,37,38,39,40],F:[7,8,48,49,50,51,47],G:[53,54,15,29,42,52]};
  for(const [code,ids]of Object.entries(expected)){
   await p.goto('about:blank');await open(code);check(await p.locator('.topic-overview').count()===1&&await p.locator('.income-workspace,.income-catalog').count()===0,'Bare topic does not start with a complete overview '+code);
   const coverage=await p.evaluate(code=>[...new Set([...sourceData.catalog.filter(r=>r.page===code).map(r=>r.id),...sourceData.diagnostics[code].heroIds])].sort((a,b)=>a-b),code);check(JSON.stringify(coverage)===JSON.stringify([...ids].sort((a,b)=>a-b)),'Original own or shared metric missing '+code);
   const visible=await p.locator('.topic-metric').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length&&!n.closest('details')).map(n=>Number(n.dataset.metricId)));
   check(JSON.stringify(visible)===JSON.stringify(ids),'Metric hidden or unaccounted for '+code);
   check(await p.evaluate(()=>document.querySelectorAll('[_echarts_instance_]').length)===0,'Overview constructs heavy diagnosis charts '+code);
   for(const id of ids){
    const card=p.locator(`#topic-${code}-metric-${id}`),facts=await p.evaluate(id=>({kind:metric(id).kind,rows:topicMetricRows(id),value:metric(id)}),id),before=facts.value;
    check((await card.locator('.topic-window').innerText()).trim().length>0,'Missing metric time window '+id);
    check(!/undefined|NaN|\[object Object\]/.test(await card.innerText()),'Broken summary values '+id);
    const displayed=await card.locator('.metric-secondary-values>div').evaluateAll(rows=>rows.map(row=>[row.querySelector('dt').textContent.trim(),row.querySelector('dd').textContent.trim()]));
    for(const [label,value]of facts.rows)check(displayed.some(([name,text])=>name===label&&text===value),'A compound subitem is absent '+id+' '+label);
    await card.locator('.topic-diagnose').focus();await p.keyboard.press('Enter');await ready();
    check(await p.locator(`#metric-evidence-${id}`).count()===1&&await p.locator('.topic-overview,.detail-kpi').count()===0,'Diagnosis destination or hierarchy incorrect '+id);
    check(JSON.stringify(await p.evaluate(id=>metric(id),id))===JSON.stringify(before),'Overview and diagnosis disagree '+id);
    await p.locator('.topic-return').click();await ready();
    check(await p.evaluate(id=>document.activeElement?.id===id,`topic-open-${code}-${id}`),'Explicit return loses metric focus '+id);
    const rect=await card.boundingBox(),nav=await p.locator('.topic-navigation').boundingBox();check(rect.y+rect.height>nav.y+nav.height&&rect.y<1000,'Explicit return hides the target '+id+' '+JSON.stringify({rect,nav,state:await p.evaluate(code=>({top:scrollY,focus:document.activeElement?.id,origin:topicOverviewOrigins.get(code),fonts:document.fonts.status}),code)}));
   }
   results.push({code,metrics:ids.length,allDiscovered:true,allDiagnosisValuesMatch:true});
  }
  // Visible compound content must answer both sides of the business question.
  await open('D');for(const [id,texts]of[[32,['升级','降级','90 / 8,000','60 / 8,000']],[33,['恢复率','连续订阅时长P50','连续订阅时长P90']],[20,['订阅页','弹窗','触点合并']],[21,['净增 +380人','试用转正流入','权益流失']],[5,['47,880','18,120','已过期']]])for(const text of texts)check((await p.locator('#topic-D-metric-'+id).innerText()).includes(text),'Required overview content absent '+id+' '+text);
  await open('B');for(const [id,texts]of[[25,['8,400','20,500','46,800','12,600','29,800','68,000']],[30,['23,800','19,200','200人','4,000']],[29,['独立历史入组7天回流','日期未提供']]])for(const text of texts)check((await p.locator('#topic-B-metric-'+id).innerText()).includes(text),'Incomplete active overview '+id+' '+text);
  await open('A');check((await p.locator('#topic-A-metric-9').innerText()).includes('待补按事件发生周'),'Registration cohort misrepresented as event-week binding');check((await p.locator('#topic-A-metric-12').innerText()).includes('参照W7'),'Long-window activation hides its distinct reference cohort');
  // Return uses edited scope; history uses the scope of each actual step.
  await open('D');await p.locator('#topic-open-D-17').click();await ready();await p.locator('.filter-bar>summary').click();await p.getByLabel('国家/市场',{exact:true}).selectOption('US');await ready();await p.locator('.topic-return').click();await ready();check(p.url().endsWith('#/D?country=US')&&await p.locator('.topic-metric').count()===14,'Return loses the edited scope');await p.goBack();await ready();check(p.url().includes('metric=17')&&p.url().includes('country=US'),'Back loses filtered diagnosis');await p.goBack();await ready();check(!p.url().includes('country=')&&p.url().includes('metric=17'),'Back loses original diagnosis scope');await p.goForward();await ready();check(p.url().includes('country=US'),'Forward loses scope');
  await open('D?panel=groups');check(await p.locator('#metric-evidence-18').count()===1&&await p.locator('#D-tab-groups[aria-selected=true]').count()===1,'Old panel-only diagnosis no longer works');
  await open('D?issue=17');check(await p.locator('.action-record [name=issueMetric]').inputValue()==='17','Old issue-only link no longer works');
  // A stored issue and a separate unsaved draft survive browsing another metric.
  await open('D?metric=17&issue=17');await p.locator('.action-record [name=owner]').fill('概览回归');await p.locator('.action-record').getByRole('button',{name:'保存本地记录',exact:true}).click();const original=await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY));await p.locator('.action-record [name=note]').fill('不能覆盖的未保存草稿');await p.locator('.topic-return').click();await ready();await p.locator('#topic-open-D-32').click();await ready();check(await p.locator('.action-record [name=issueMetric]').inputValue()==='17'&&await p.locator('.action-record [name=note]').inputValue()==='不能覆盖的未保存草稿','Browsing a metric replaces selected issue or draft');check(await p.evaluate(()=>localStorage.getItem(ACTION_STORAGE_KEY))===original,'Overview rewrites saved scope or baseline');
  // Invalid, partially applicable, pending, immature and zero are not conflated.
  await open('D?country=FR');check(await p.locator('.topic-metric,.income-workspace,.action-record').count()===0&&await p.locator('.filter-error-notice').count()===1,'Invalid filter leaks values or registration');
  await open('D?plan=Plus');check((await p.locator('#topic-D-metric-17').innerText()).includes('47.0%')&&(await p.locator('#topic-D-metric-17').innerText()).includes('不改变总体开启率'),'Composition filters misstate overall trial opening');check((await p.locator('#topic-D-metric-5').innerText()).includes('待补'),'Missing status detail keeps overall structure');
  await open('D?plan=Free');check((await p.locator('#topic-D-metric-18').innerText()).includes('不适用'),'Free is shown as a conversion denominator');check((await p.locator('#topic-D-metric-17').innerText()).includes('0 / 1,292人'),'Reliable zero starter composition disappears or becomes missing');
  await open('A?week=12');check((await p.locator('#topic-A-metric-12').innerText()).includes('观察尚未结束')&&!(await p.locator('#topic-A-metric-12').innerText()).includes('NaN'),'Immature activation is shown as zero');
  await open('B?userCohort=2026-09-14');check((await p.locator('#topic-B-metric-28').innerText()).includes('观察')&&await p.locator('#topic-B-metric-28 .topic-retention-cell').count()===1,'Immature retained rate gets a numeric heat color');
  // Desktop/text layouts and unobstructed definitions with keyboard close and focus return.
  for(const [width,size]of[[1366,16],[1600,16],[1920,16],[1366,32],[1600,32],[1920,32]]){
   await p.setViewportSize({width,height:1000});for(const code of 'ABCDEFG'){await open(code);await p.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);await ready();check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),'Page-wide overflow '+code+' '+width+' '+size);
    const trigger=p.locator('.topic-metric .definition-trigger').first();await trigger.focus();await p.keyboard.press('Enter');check(await p.evaluate(()=>definitionPopoverIsOpen()),'Keyboard definition cannot open');await p.keyboard.press('Escape');check(await trigger.evaluate(n=>document.activeElement===n),'Definition close loses focus');
    if(width===1600&&size===16)await p.screenshot({path:`output/playwright/v186-structure/${b.browserType().name()}-overview-${code}.png`,fullPage:true});
   }
  }
  const withoutCharts=await b.newContext({viewport:{width:1366,height:1000},reducedMotion:'reduce'}),q=await withoutCharts.newPage();q.on('pageerror',e=>errors.push(e.message));
  try{await q.route('**/vendor/echarts.min.js*',r=>r.abort());await q.goto(base+'#/D');await q.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main[aria-busy=false]'));check(await q.locator('.topic-metric').count()===14&&await q.locator('.topic-sparkline svg').count()>0&&await q.evaluate(()=>!window.echarts),'Overview is blocked by missing chart library');await q.locator('#topic-open-D-17').click();await q.locator('#D-tab-data').click();check(await q.locator('#D-panel-data table').count()>0,'Missing chart library blocks exact diagnosis data');}finally{await withoutCharts.close();}
  check(!errors.length,errors.join('; '));return{status:'PASS',results,checks:['61 visible summaries / 53 own metrics','all 61 direct diagnosis destinations and equal projections','compound subitems and shared ownership','edited-scope return and browser history','legacy panel and issue URLs','immutable saved JSON and unsaved draft','invalid/missing/immature distinctions','six desktop/text states on all topics','keyboard and focus']};
 }finally{await c.close();}
}
