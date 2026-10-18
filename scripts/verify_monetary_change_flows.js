// Monetary precision must agree across the KPI, trend description and income analysis.
async(parent)=>{
 const browser=parent.context().browser(),base=new URL('.',parent.url()).href,results=[],errors=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 // Keep 10,000 August payers and $49,980 / 9,800 = $5.10 in July.
 // Each fixture changes only August revenue and its matching ARPPU endpoint.
 const fixtures=[
  [51400,'+$0.04/人'],[51100,'+$0.01/人'],[51050,'+$0.01/人'],[51049,'上升不足 $0.01/人'],
  [51040,'上升不足 $0.01/人'],[51001,'上升不足 $0.01/人'],[51000,'持平'],
  [50999,'下降不足 $0.01/人'],[50960,'下降不足 $0.01/人'],[50950,'−$0.01/人'],
  [50900,'−$0.01/人'],[50600,'−$0.04/人'],[50500,'−$0.05/人'],[51500,'+$0.05/人'],[52000,'+$0.10/人']
 ];
 for(const [width,height] of [[1366,768],[1600,900],[1920,1080]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));let revenue=52000,priorCount=9800;
  const card=()=>p.locator('.detail-kpi[data-metric-id="35"]');
  const ready=()=>p.waitForFunction(()=>lastRenderedHash===location.hash&&document.querySelector('#main')?.getAttribute('aria-busy')==='false');
  try{
   await p.route('**/data/metric-values.json',async r=>{
    const response=await r.fetch(),data=await response.json();data.m35.value.subscriptionNetIncome=revenue;
    data.m35.value.ARPPU=revenue/10000;await r.fulfill({response,json:data});
   });
   await p.route('**/data/diagnostics.json',async r=>{
    const response=await r.fetch(),data=await response.json();const prior=data.E.paymentMonths.rows.at(-2),latest=data.E.paymentMonths.rows.at(-1);
    prior.payers=priorCount;if(!priorCount)prior.netIncome=0;latest.netIncome=revenue;
    await r.fulfill({response,json:data});
   });
   await p.goto(`${base}#/E?metric=35`);await ready();
   for(const [amount,label] of fixtures){
    revenue=amount;await p.reload();await ready();await card().locator('.metric-delta').waitFor();
    const expected=label==='持平'?'2026-08 · 与上期持平':`2026-08 · ${label}（较上期）`;
    check(await card().locator('.metric-delta').innerText()===expected,`Wrong monetary change at ${width}: ${amount}`);
    await card().locator('.detail-select').click();
    const inspectorChange=p.locator('.metric-inspector .inspector-facts > div').filter({has:p.locator('dt', {hasText:'较上一期'})}).locator('dd');
    check((await inspectorChange.innerText()).startsWith(`${label} · `),'Inspector contradicts the monetary direction or precision');
    await p.locator('.inspector-close').click();
    const current=`$${(amount/10000).toFixed(2)}/人`;
    check(await card().locator('.detail-select').innerText()===current,'KPI does not show its actual revenue / payers');
    const aria=await card().locator('.headline-sparkline').getAttribute('aria-label');
    check(aria.includes(`2026-08${current}；`)&&aria.includes(expected.slice('2026-08 · '.length)),'Trend accessible text loses cents, direction or its period');
    check(await p.locator('[data-driver="arppu"] .income-driver-delta').innerText()===label,'KPI and income analysis disagree on monetary direction or rounding');
    const evidence=await p.evaluate(()=>{
     const history=metricHistory(35),change=subscriptionIncomeChange(history);
     return {history:history.values,current:history.details.at(-1),delta:change.delta,
      reconciled:change.payersContribution+change.arppuContribution,month:change.afterLabel,
      storage:localStorage.getItem('parallens-demo-actions-v1')};
    });
    check(evidence.current.numerator===amount&&evidence.current.denominator===10000&&
     evidence.history.at(-2)===5.1&&evidence.history.at(-1)===amount/10000&&evidence.delta===amount-49980&&
     Math.abs(evidence.reconciled-evidence.delta)<.01&&evidence.month==='8月','Formatting changes source arithmetic, denominator or month');
    check(evidence.storage===null,'Viewing monetary labels creates an issue record');
    await p.getByRole('button',{name:'关键指标',exact:true}).click();
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||[...document.querySelectorAll('.detail-kpi,.metric-delta')].some(n=>n.scrollWidth>n.clientWidth+1)),'Monetary labels overflow the desktop cards');
    if(width===1600&&amount===51400)await p.screenshot({path:`output/playwright/v91-cents-after-${browser.browserType().name()}.png`,scale:'css'});
    if(width===1366&&amount===51001){
     for(const size of [24,32,16]){
      await p.evaluate(size=>document.documentElement.style.fontSize=size+'px',size);
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
      check(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||[...document.querySelectorAll('.detail-kpi,.metric-delta')].some(n=>n.scrollWidth>n.clientWidth+1)),'Sub-cent text overflows when enlarged');
     }
    }
    results.push({kind:'fixture',width,revenue:amount,change:label,current,aria});
   }
   revenue=52000;
   for(const count of [0,29]){
    priorCount=count;await p.reload();await ready();
    check(await card().locator('.metric-delta').innerText()==='2026-08 · 暂无可比值','Missing or insufficient prior payers fabricate a tie or monetary change');
    check((await card().locator('.headline-sparkline').getAttribute('aria-label')).includes('2026-08$5.20/人；暂无可比值'),
     'Unavailable comparison loses its current monetary value or lack of baseline');
    check(await p.locator('[data-driver="arppu"] .income-driver-delta').count()===0,'Unavailable baseline fabricates an income driver');
    results.push({kind:'unavailable-baseline',width,priorPayers:count});
   }
   await p.unroute('**/data/metric-values.json');await p.unroute('**/data/diagnostics.json');await p.reload();await ready();
   for(const query of ['','country=US','country=UK','country=DE','country=Other']){
    await p.goto(`${base}#/E?metric=35${query?'&'+query:''}`);await ready();
    const current=await card().locator('.detail-select').innerText(),aria=await card().locator('.headline-sparkline').getAttribute('aria-label');
    check(aria.includes(`2026-08${current}；`),'Current market loses displayed cents in its trend description');
    results.push({kind:'source-market',width,query,current});
   }
  }catch(e){await p.screenshot({path:`output/playwright/v91-cents-failure-${browser.browserType().name()}-${width}.png`});throw e;}
  finally{await context.close();}
 }
 check(!errors.length,errors.join('; '));
 return {status:'PASS',checks:['15 reconciled revenue fixtures at 3 desktop sizes','positive, negative, exact zero and half-cent boundaries',
  'sub-cent direction does not claim a tie','KPI and income driver use matching precision','trend accessible description retains displayed cents',
  'source revenue, payers, month and decomposition unchanged','missing and low-sample prior month do not fabricate change',
  'no accidental issue persistence','150% and 200% long-label reflow','five current markets at three sizes','no runtime errors'],results};
}
